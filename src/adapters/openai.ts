import type { 
  OpenAI as OpenAIType, 
  ChatCompletionCreateParams,
  ChatCompletion,
  ChatCompletionMessageParam 
} from 'openai';
import { PromptArmorDetector, DetectionResult } from '../core/detector';
import { PromptArmorFilter, FilterResult } from '../core/filter';
import { PromptArmorSanitizer } from '../core/sanitizer';

export interface OpenAIAdapterConfig {
  detector?: PromptArmorDetector;
  filter?: PromptArmorFilter;
  sanitizer?: PromptArmorSanitizer;
  blockOnDetection?: boolean;
  sanitizeInput?: boolean;
  filterOutput?: boolean;
  onDetection?: (result: DetectionResult, messages: ChatCompletionMessageParam[]) => void;
  onBlocked?: (result: DetectionResult, messages: ChatCompletionMessageParam[]) => void;
}

export class OpenAIAdapter {
  private detector: PromptArmorDetector;
  private filter: PromptArmorFilter;
  private sanitizer: PromptArmorSanitizer;
  private config: Required<OpenAIAdapterConfig>;

  constructor(config: OpenAIAdapterConfig = {}) {
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

  wrapOpenAI(openai: OpenAIType): OpenAIType {
    const originalCreate = openai.chat.completions.create.bind(openai.chat.completions);
    const adapter = this;

    // Create a wrapper that intercepts API calls
    const wrappedOpenai = new Proxy(openai, {
      get(target, prop) {
        if (prop === 'chat') {
          return new Proxy(target.chat, {
            get(chatTarget, chatProp) {
              if (chatProp === 'completions') {
                return {
                  ...chatTarget.completions,
                  create: async (
                    params: ChatCompletionCreateParams,
                    options?: { signal?: AbortSignal }
                  ): Promise<ChatCompletion> => {
                    return adapter.handleCompletion(params, options, originalCreate);
                  }
                };
              }
              return (chatTarget as Record<string, unknown>)[chatProp as string];
            }
          });
        }
        return (target as Record<string, unknown>)[prop as string];
      }
    });

    return wrappedOpenai as OpenAIType;
  }

  private async handleCompletion(
    params: ChatCompletionCreateParams,
    options: { signal?: AbortSignal } | undefined,
    originalCreate: (params: ChatCompletionCreateParams, options?: { signal?: AbortSignal }) => Promise<ChatCompletion>
  ): Promise<ChatCompletion> {
    // Sanitize and check each message
    const processedMessages: ChatCompletionMessageParam[] = [];
    
    for (const message of params.messages) {
      if (typeof message.content === 'string') {
        // Sanitize input if enabled
        let content = message.content;
        if (this.config.sanitizeInput) {
          const sanitization = this.sanitizer.sanitize(content);
          content = sanitization.sanitized;
        }

        // Detect threats
        const detection = await this.detector.detect(content, {
          role: message.role,
          model: params.model
        });

        if (detection.isMalicious) {
          this.config.onDetection(detection, params.messages);

          if (this.config.blockOnDetection) {
            this.config.onBlocked(detection, params.messages);
            return this.createBlockedResponse(detection, params);
          }
        }

        processedMessages.push({
          ...message,
          content
        });
      } else {
        // Handle multi-modal content
        processedMessages.push(message);
      }
    }

    // Call original API with processed messages
    const response = await originalCreate(
      { ...params, messages: processedMessages },
      options
    );

    // Filter output if enabled
    if (this.config.filterOutput && response.choices[0]?.message?.content) {
      const filterResult = this.filter.filterOutput(
        response.choices[0].message.content
      );

      if (!filterResult.allowed) {
        return this.createFilteredResponse(filterResult, response);
      }

      if (filterResult.wasFiltered && filterResult.output) {
        return {
          ...response,
          choices: response.choices.map((choice, idx) => 
            idx === 0 
              ? {
                  ...choice,
                  message: {
                    ...choice.message,
                    content: filterResult.output!
                  }
                }
              : choice
          )
        };
      }
    }

    return response;
  }

  private createBlockedResponse(
    detection: DetectionResult,
    originalParams: ChatCompletionCreateParams
  ): ChatCompletion {
    const timestamp = Math.floor(Date.now() / 1000);
    
    return {
      id: `prompt-armor-blocked-${timestamp}`,
      object: 'chat.completion',
      created: timestamp,
      model: originalParams.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: `[BLOCKED] This request was blocked due to detected ${detection.threatType}. Confidence: ${(detection.confidence * 100).toFixed(1)}%`,
          refusal: `Blocked: ${detection.threatType}`
        },
        finish_reason: 'stop',
        logprobs: null
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      },
      system_fingerprint: 'prompt-armor-v1'
    };
  }

  private createFilteredResponse(
    filterResult: FilterResult,
    originalResponse: ChatCompletion
  ): ChatCompletion {
    return {
      ...originalResponse,
      choices: originalResponse.choices.map((choice, idx) => 
        idx === 0 
          ? {
              ...choice,
              message: {
                ...choice.message,
                content: `[FILTERED] Output blocked. Reasons: ${filterResult.filterReasons.join(', ')}`
              },
              finish_reason: 'stop'
            }
          : choice
      )
    };
  }

  // Middleware for Express/Fastify
  middleware() {
    return async (
      req: { body: { messages?: ChatCompletionMessageParam[] } },
      res: { status: (code: number) => { json: (data: unknown) => void } },
      next: () => void
    ) => {
      if (!req.body?.messages) {
        return next();
      }

      for (const message of req.body.messages) {
        if (typeof message.content === 'string') {
          const detection = await this.detector.detect(message.content, { role: message.role });
          
          if (detection.isMalicious) {
            this.config.onDetection(detection, req.body.messages);
            
            if (this.config.blockOnDetection) {
              res.status(400).json({
                error: 'Prompt injection detected',
                details: {
                  threatType: detection.threatType,
                  confidence: detection.confidence
                }
              });
              return;
            }
          }
        }
      }

      next();
    };
  }
}

// Factory function for easy setup
export function withPromptArmor(
  openai: OpenAIType,
  config?: OpenAIAdapterConfig
): OpenAIType {
  const adapter = new OpenAIAdapter(config);
  return adapter.wrapOpenAI(openai);
}

export default OpenAIAdapter;
