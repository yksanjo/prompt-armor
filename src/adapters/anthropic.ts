import type { 
  Anthropic as AnthropicType,
  MessageCreateParams,
  Message,
  ContentBlock,
  TextBlock
} from '@anthropic-ai/sdk';
import { PromptArmorDetector, DetectionResult } from '../core/detector';
import { PromptArmorFilter } from '../core/filter';
import { PromptArmorSanitizer } from '../core/sanitizer';

export interface AnthropicAdapterConfig {
  detector?: PromptArmorDetector;
  filter?: PromptArmorFilter;
  sanitizer?: PromptArmorSanitizer;
  blockOnDetection?: boolean;
  sanitizeInput?: boolean;
  filterOutput?: boolean;
  onDetection?: (result: DetectionResult, messages: Array<{ role: string; content: string }>) => void;
  onBlocked?: (result: DetectionResult, messages: Array<{ role: string; content: string }>) => void;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<ContentBlock>;
}

export class AnthropicAdapter {
  private detector: PromptArmorDetector;
  private filter: PromptArmorFilter;
  private sanitizer: PromptArmorSanitizer;
  private config: Required<AnthropicAdapterConfig>;

  constructor(config: AnthropicAdapterConfig = {}) {
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

  wrapAnthropic(anthropic: AnthropicType): AnthropicType {
    const originalCreate = anthropic.messages.create.bind(anthropic.messages);
    const adapter = this;

    const wrappedAnthropic = new Proxy(anthropic, {
      get(target, prop) {
        if (prop === 'messages') {
          return {
            ...target.messages,
            create: async (params: MessageCreateParams): Promise<Message> => {
              return adapter.handleMessage(params, originalCreate);
            }
          };
        }
        return (target as Record<string, unknown>)[prop as string];
      }
    });

    return wrappedAnthropic as AnthropicType;
  }

  private async handleMessage(
    params: MessageCreateParams,
    originalCreate: (params: MessageCreateParams) => Promise<Message>
  ): Promise<Message> {
    // Process messages
    const processedMessages: AnthropicMessage[] = [];

    for (const msg of params.messages) {
      const content = this.extractContent(msg.content);
      
      if (content) {
        // Sanitize
        let sanitizedContent = content;
        if (this.config.sanitizeInput) {
          const result = this.sanitizer.sanitize(content);
          sanitizedContent = result.sanitized;
        }

        // Detect
        const detection = await this.detector.detect(sanitizedContent, {
          role: msg.role,
          model: params.model
        });

        if (detection.isMalicious) {
          this.config.onDetection(detection, params.messages as Array<{ role: string; content: string }>);

          if (this.config.blockOnDetection) {
            this.config.onBlocked(detection, params.messages as Array<{ role: string; content: string }>);
            return this.createBlockedMessage(detection, params);
          }
        }

        processedMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: sanitizedContent
        });
      } else {
        processedMessages.push(msg as AnthropicMessage);
      }
    }

    // Call original API
    const response = await originalCreate({
      ...params,
      messages: processedMessages
    });

    // Filter output
    if (this.config.filterOutput) {
      return this.filterMessageResponse(response);
    }

    return response;
  }

  private extractContent(content: string | Array<ContentBlock>): string | null {
    if (typeof content === 'string') {
      return content;
    }
    
    // Extract text from content blocks
    const textBlocks = content.filter((block): block is TextBlock => 
      block.type === 'text'
    );
    
    if (textBlocks.length > 0) {
      return textBlocks.map(b => b.text).join('\n');
    }
    
    return null;
  }

  private filterMessageResponse(response: Message): Message {
    const textContent = response.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map(b => b.text)
      .join('\n');

    if (!textContent) return response;

    const filterResult = this.filter.filterOutput(textContent);

    if (!filterResult.allowed) {
      return {
        ...response,
        content: [{
          type: 'text',
          text: `[FILTERED] Output blocked. Reasons: ${filterResult.filterReasons.join(', ')}`
        }],
        stop_reason: 'end_turn'
      };
    }

    if (filterResult.wasFiltered && filterResult.output) {
      return {
        ...response,
        content: [{
          type: 'text',
          text: filterResult.output
        }]
      };
    }

    return response;
  }

  private createBlockedMessage(
    detection: DetectionResult,
    originalParams: MessageCreateParams
  ): Message {
    return {
      id: `msg_prompt_armor_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{
        type: 'text',
        text: `[BLOCKED] This request was blocked due to detected ${detection.threatType}. Confidence: ${(detection.confidence * 100).toFixed(1)}%`
      }],
      model: originalParams.model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0
      }
    };
  }

  // Middleware for server-side protection
  middleware() {
    return async (
      req: { body: { messages?: Array<{ role: string; content: string }> } },
      res: { status: (code: number) => { json: (data: unknown) => void } },
      next: () => void
    ) => {
      if (!req.body?.messages) {
        return next();
      }

      for (const message of req.body.messages) {
        const detection = await this.detector.detect(message.content, { role: message.role });
        
        if (detection.isMalicious) {
          this.config.onDetection(detection, req.body.messages);
          
          if (this.config.blockOnDetection) {
            res.status(400).json({
              error: 'Prompt injection detected',
              details: {
                threatType: detection.threatType,
                confidence: detection.confidence,
                provider: 'anthropic'
              }
            });
            return;
          }
        }
      }

      next();
    };
  }
}

// Factory function
export function withPromptArmorAnthropic(
  anthropic: AnthropicType,
  config?: AnthropicAdapterConfig
): AnthropicType {
  const adapter = new AnthropicAdapter(config);
  return adapter.wrapAnthropic(anthropic);
}

export default AnthropicAdapter;
