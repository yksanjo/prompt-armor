import type { 
  BaseChatModel,
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage
} from 'langchain/schema';
import { Runnable, RunnableConfig } from 'langchain/schema/runnable';
import { PromptArmorDetector, DetectionResult } from '../core/detector';
import { PromptArmorFilter } from '../core/filter';
import { PromptArmorSanitizer } from '../core/sanitizer';

export interface LangChainAdapterConfig {
  detector?: PromptArmorDetector;
  filter?: PromptArmorFilter;
  sanitizer?: PromptArmorSanitizer;
  blockOnDetection?: boolean;
  sanitizeInput?: boolean;
  filterOutput?: boolean;
  onDetection?: (result: DetectionResult, input: BaseMessage[]) => void;
  onBlocked?: (result: DetectionResult, input: BaseMessage[]) => void;
}

export class PromptArmorLangChainAdapter {
  private detector: PromptArmorDetector;
  private filter: PromptArmorFilter;
  private sanitizer: PromptArmorSanitizer;
  private config: Required<LangChainAdapterConfig>;

  constructor(config: LangChainAdapterConfig = {}) {
    this.config = {
      detector: new PromptArmorDetector(),
      filter: new PromptArmorFilter(),
      sanitizer: new PromptArmorSanitizer(),
      blockOnDetection: true,
      sanitizeInput: true,
      filterOutput: true,
      onDetection: () => {},
      onBlocked: () => {},
      ...config
    };

    this.detector = this.config.detector;
    this.filter = this.config.filter;
    this.sanitizer = this.config.sanitizer;
  }

  async initialize(): Promise<void> {
    await this.detector.initialize();
  }

  wrapModel<T extends BaseChatModel>(model: T): T {
    const originalCall = (model as unknown as { call: (messages: BaseMessage[]) => Promise<BaseMessage> }).call.bind(model);
    const adapter = this;

    const wrappedModel = new Proxy(model, {
      get(target, prop) {
        if (prop === 'call') {
          return async (messages: BaseMessage[]): Promise<BaseMessage> => {
            return adapter.handleCall(messages, originalCall);
          };
        }
        
        if (prop === 'invoke') {
          const originalInvoke = (target as unknown as { invoke: (input: BaseMessage[], options?: RunnableConfig) => Promise<BaseMessage> }).invoke.bind(target);
          return async (input: BaseMessage[], options?: RunnableConfig): Promise<BaseMessage> => {
            return adapter.handleInvoke(input, options, originalInvoke);
          };
        }

        if (prop === 'stream') {
          const originalStream = (target as unknown as { stream: (input: BaseMessage[], options?: RunnableConfig) => AsyncIterableIterator<BaseMessage> }).stream.bind(target);
          return (input: BaseMessage[], options?: RunnableConfig) => {
            return adapter.handleStream(input, options, originalStream);
          };
        }

        return (target as Record<string, unknown>)[prop as string];
      }
    });

    return wrappedModel as T;
  }

  private async handleCall(
    messages: BaseMessage[],
    originalCall: (messages: BaseMessage[]) => Promise<BaseMessage>
  ): Promise<BaseMessage> {
    // Process messages
    const processedMessages = await this.processMessages(messages);
    
    if (processedMessages === null) {
      // Blocked
      return this.createBlockedResponse();
    }

    // Call original model
    const response = await originalCall(processedMessages);

    // Filter output
    if (this.config.filterOutput) {
      return this.filterResponse(response);
    }

    return response;
  }

  private async handleInvoke(
    input: BaseMessage[],
    options: RunnableConfig | undefined,
    originalInvoke: (input: BaseMessage[], options?: RunnableConfig) => Promise<BaseMessage>
  ): Promise<BaseMessage> {
    const processedMessages = await this.processMessages(input);
    
    if (processedMessages === null) {
      return this.createBlockedResponse();
    }

    const response = await originalInvoke(processedMessages, options);

    if (this.config.filterOutput) {
      return this.filterResponse(response);
    }

    return response;
  }

  private async handleStream(
    input: BaseMessage[],
    options: RunnableConfig | undefined,
    originalStream: (input: BaseMessage[], options?: RunnableConfig) => AsyncIterableIterator<BaseMessage>
  ): AsyncIterableIterator<BaseMessage> {
    const processedMessages = await this.processMessages(input);
    
    if (processedMessages === null) {
      // Return single blocked message
      return this.createBlockedStream();
    }

    const stream = originalStream(processedMessages, options);

    if (!this.config.filterOutput) {
      return stream;
    }

    // Wrap stream with filtering
    return this.wrapStream(stream);
  }

  private async processMessages(messages: BaseMessage[]): Promise<BaseMessage[] | null> {
    const processed: BaseMessage[] = [];

    for (const message of messages) {
      const content = this.extractContent(message);
      
      if (content) {
        // Sanitize
        let sanitizedContent = content;
        if (this.config.sanitizeInput) {
          const result = this.sanitizer.sanitize(content);
          sanitizedContent = result.sanitized;
        }

        // Detect
        const detection = await this.detector.detect(sanitizedContent, {
          type: message._getType()
        });

        if (detection.isMalicious) {
          this.config.onDetection(detection, messages);

          if (this.config.blockOnDetection) {
            this.config.onBlocked(detection, messages);
            return null;
          }
        }

        processed.push(this.createMessage(message._getType(), sanitizedContent));
      } else {
        processed.push(message);
      }
    }

    return processed;
  }

  private extractContent(message: BaseMessage): string | null {
    if (typeof message.content === 'string') {
      return message.content;
    }
    
    // Handle complex content types
    if (Array.isArray(message.content)) {
      return message.content
        .filter((c): c is { type: string; text?: string } => 
          typeof c === 'object' && c !== null && 'text' in c
        )
        .map(c => c.text)
        .filter((text): text is string => text !== undefined)
        .join('\n');
    }
    
    return null;
  }

  private createMessage(type: string, content: string): BaseMessage {
    switch (type) {
      case 'human':
        return new HumanMessage(content);
      case 'ai':
        return new AIMessage(content);
      case 'system':
        return new SystemMessage(content);
      default:
        return new HumanMessage(content);
    }
  }

  private filterResponse(response: BaseMessage): BaseMessage {
    const content = typeof response.content === 'string' 
      ? response.content 
      : JSON.stringify(response.content);

    const filterResult = this.filter.filterOutput(content);

    if (!filterResult.allowed) {
      return new AIMessage(
        `[FILTERED] Output blocked. Reasons: ${filterResult.filterReasons.join(', ')}`
      );
    }

    if (filterResult.wasFiltered && filterResult.output) {
      return new AIMessage(filterResult.output);
    }

    return response;
  }

  private createBlockedResponse(): AIMessage {
    return new AIMessage(
      '[BLOCKED] This request was blocked due to a detected security threat. Your input may contain prompt injection or jailbreak attempts.'
    );
  }

  private async* createBlockedStream(): AsyncIterableIterator<BaseMessage> {
    yield new AIMessage(
      '[BLOCKED] This request was blocked due to a detected security threat.'
    );
  }

  private async* wrapStream(
    originalStream: AsyncIterableIterator<BaseMessage>
  ): AsyncIterableIterator<BaseMessage> {
    let accumulated = '';

    for await (const chunk of originalStream) {
      const content = typeof chunk.content === 'string' 
        ? chunk.content 
        : '';
      
      accumulated += content;

      // Check accumulated content
      const filterResult = this.filter.filterOutput(accumulated);
      
      if (!filterResult.allowed) {
        yield new AIMessage(
          '[FILTERED] Stream blocked. Detected potential exfiltration.'
        );
        return;
      }

      yield chunk;
    }
  }

  // Create a Runnable wrapper for use in chains
  createRunnableWrapper<T extends Runnable>(runnable: T): T {
    const adapter = this;

    return new Proxy(runnable, {
      get(target, prop) {
        if (prop === 'invoke') {
          const originalInvoke = (target as unknown as { invoke: (input: unknown, options?: RunnableConfig) => Promise<unknown> }).invoke.bind(target);
          return async (input: unknown, options?: RunnableConfig): Promise<unknown> => {
            // Check if input is messages
            if (Array.isArray(input)) {
              const processed = await adapter.processMessages(input as BaseMessage[]);
              if (processed === null) {
                return { content: '[BLOCKED]' };
              }
              input = processed;
            }

            const result = await originalInvoke(input, options);
            
            // Filter output if it's a message
            if (result && typeof result === 'object' && 'content' in result) {
              const content = (result as { content: unknown }).content;
              if (typeof content === 'string') {
                const filterResult = adapter.filter.filterOutput(content);
                if (!filterResult.allowed) {
                  return { content: `[FILTERED] ${filterResult.filterReasons.join(', ')}` };
                }
                if (filterResult.wasFiltered && filterResult.output) {
                  return { ...result, content: filterResult.output };
                }
              }
            }

            return result;
          };
        }

        return (target as Record<string, unknown>)[prop as string];
      }
    }) as T;
  }
}

// Factory function
export function withPromptArmorLangChain<T extends BaseChatModel>(
  model: T,
  config?: LangChainAdapterConfig
): T {
  const adapter = new PromptArmorLangChainAdapter(config);
  return adapter.wrapModel(model);
}

export default PromptArmorLangChainAdapter;
