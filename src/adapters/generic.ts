import { PromptArmorDetector, DetectionResult } from '../core/detector';
import { PromptArmorFilter, FilterResult } from '../core/filter';
import { PromptArmorSanitizer, SanitizationResult } from '../core/sanitizer';

export interface GenericAdapterConfig {
  detector?: PromptArmorDetector;
  filter?: PromptArmorFilter;
  sanitizer?: PromptArmorSanitizer;
  blockOnDetection?: boolean;
  sanitizeInput?: boolean;
  filterOutput?: boolean;
  onDetection?: (result: DetectionResult, input: unknown) => void;
  onBlocked?: (result: DetectionResult, input: unknown) => void;
}

export interface GenericRequest {
  messages?: Array<{ role: string; content: string }>;
  prompt?: string;
  input?: string;
  text?: string;
  [key: string]: unknown;
}

export interface GenericResponse {
  content?: string;
  text?: string;
  message?: { content?: string };
  choices?: Array<{ message?: { content?: string } }>;
  [key: string]: unknown;
}

export class PromptArmorGenericAdapter {
  private detector: PromptArmorDetector;
  private filter: PromptArmorFilter;
  private sanitizer: PromptArmorSanitizer;
  private config: Required<GenericAdapterConfig>;

  constructor(config: GenericAdapterConfig = {}) {
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

  async checkInput(request: GenericRequest): Promise<{
    safe: boolean;
    detection?: DetectionResult;
    sanitized: GenericRequest;
  }> {
    const texts = this.extractTexts(request);
    const detections: DetectionResult[] = [];
    const sanitizedTexts: Map<string, string> = new Map();

    for (const { key, text } of texts) {
      // Sanitize
      let sanitized = text;
      if (this.config.sanitizeInput) {
        const result = this.sanitizer.sanitize(text);
        sanitized = result.sanitized;
        sanitizedTexts.set(key, sanitized);
      }

      // Detect
      const detection = await this.detector.detect(sanitized, { key });
      
      if (detection.isMalicious) {
        detections.push(detection);
        this.config.onDetection(detection, request);

        if (this.config.blockOnDetection) {
          this.config.onBlocked(detection, request);
          return {
            safe: false,
            detection,
            sanitized: this.rebuildRequest(request, sanitizedTexts)
          };
        }
      }
    }

    return {
      safe: detections.length === 0,
      detection: detections[0],
      sanitized: this.rebuildRequest(request, sanitizedTexts)
    };
  }

  filterOutput(response: GenericResponse): {
    allowed: boolean;
    filtered: GenericResponse;
    filterResult?: FilterResult;
  } {
    if (!this.config.filterOutput) {
      return { allowed: true, filtered: response };
    }

    const content = this.extractContent(response);
    
    if (!content) {
      return { allowed: true, filtered: response };
    }

    const filterResult = this.filter.filterOutput(content);

    if (!filterResult.allowed) {
      return {
        allowed: false,
        filtered: this.createBlockedResponse(filterResult, response),
        filterResult
      };
    }

    if (filterResult.wasFiltered && filterResult.output) {
      return {
        allowed: true,
        filtered: this.rebuildResponse(response, filterResult.output),
        filterResult
      };
    }

    return { allowed: true, filtered: response };
  }

  private extractTexts(request: GenericRequest): Array<{ key: string; text: string }> {
    const texts: Array<{ key: string; text: string }> = [];

    // Check messages array
    if (request.messages && Array.isArray(request.messages)) {
      for (let i = 0; i < request.messages.length; i++) {
        const msg = request.messages[i];
        if (msg.content && typeof msg.content === 'string') {
          texts.push({ key: `messages[${i}].content`, text: msg.content });
        }
      }
    }

    // Check direct prompt/input/text fields
    if (request.prompt && typeof request.prompt === 'string') {
      texts.push({ key: 'prompt', text: request.prompt });
    }

    if (request.input && typeof request.input === 'string') {
      texts.push({ key: 'input', text: request.input });
    }

    if (request.text && typeof request.text === 'string') {
      texts.push({ key: 'text', text: request.text });
    }

    // Check for content field
    if (request.content && typeof request.content === 'string') {
      texts.push({ key: 'content', text: request.content });
    }

    return texts;
  }

  private rebuildRequest(
    original: GenericRequest, 
    sanitizedTexts: Map<string, string>
  ): GenericRequest {
    const result = { ...original };

    for (const [key, text] of sanitizedTexts.entries()) {
      if (key.startsWith('messages[')) {
        // Handle array index
        const match = key.match(/messages\[(\d+)\]\.content/);
        if (match && result.messages) {
          const index = parseInt(match[1], 10);
          if (result.messages[index]) {
            result.messages[index].content = text;
          }
        }
      } else {
        (result as Record<string, string>)[key] = text;
      }
    }

    return result;
  }

  private extractContent(response: GenericResponse): string | null {
    if (response.content && typeof response.content === 'string') {
      return response.content;
    }

    if (response.text && typeof response.text === 'string') {
      return response.text;
    }

    if (response.message?.content && typeof response.message.content === 'string') {
      return response.message.content;
    }

    if (response.choices && response.choices.length > 0) {
      const choice = response.choices[0];
      if (choice.message?.content && typeof choice.message.content === 'string') {
        return choice.message.content;
      }
    }

    return null;
  }

  private createBlockedResponse(
    filterResult: FilterResult,
    original: GenericResponse
  ): GenericResponse {
    const blockedMessage = `[FILTERED] Response blocked. Reasons: ${filterResult.filterReasons.join(', ')}`;

    // Try to maintain structure
    if (original.content !== undefined) {
      return { ...original, content: blockedMessage };
    }

    if (original.text !== undefined) {
      return { ...original, text: blockedMessage };
    }

    if (original.message) {
      return { ...original, message: { ...original.message, content: blockedMessage } };
    }

    if (original.choices) {
      return {
        ...original,
        choices: original.choices.map((choice, idx) => 
          idx === 0 && choice.message
            ? { ...choice, message: { ...choice.message, content: blockedMessage } }
            : choice
        )
      };
    }

    return { ...original, content: blockedMessage };
  }

  private rebuildResponse(response: GenericResponse, newContent: string): GenericResponse {
    if (response.content !== undefined) {
      return { ...response, content: newContent };
    }

    if (response.text !== undefined) {
      return { ...response, text: newContent };
    }

    if (response.message) {
      return { ...response, message: { ...response.message, content: newContent } };
    }

    if (response.choices) {
      return {
        ...response,
        choices: response.choices.map((choice, idx) => 
          idx === 0 && choice.message
            ? { ...choice, message: { ...choice.message, content: newContent } }
            : choice
        )
      };
    }

    return { ...response, content: newContent };
  }

  // Express middleware
  expressMiddleware() {
    return async (
      req: { body: GenericRequest },
      res: { 
        status: (code: number) => { json: (data: unknown) => void; send: (data: string) => void };
        json: (data: unknown) => void;
      },
      next: () => void
    ) => {
      const check = await this.checkInput(req.body);

      if (!check.safe) {
        res.status(400).json({
          error: 'Prompt injection detected',
          details: {
            threatType: check.detection?.threatType,
            confidence: check.detection?.confidence
          }
        });
        return;
      }

      // Replace request body with sanitized version
      req.body = check.sanitized;

      // Intercept response
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        if (body && typeof body === 'object') {
          const filter = this.filterOutput(body as GenericResponse);
          return originalJson(filter.filtered);
        }
        return originalJson(body);
      };

      next();
    };
  }

  // Fetch wrapper
  wrapFetch(originalFetch: typeof fetch): typeof fetch {
    const adapter = this;

    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Intercept request body if it's JSON
      if (init?.body && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body);
          const check = await adapter.checkInput(body);

          if (!check.safe) {
            return new Response(
              JSON.stringify({
                error: 'Prompt injection detected',
                details: {
                  threatType: check.detection?.threatType,
                  confidence: check.detection?.confidence
                }
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          }

          init = { ...init, body: JSON.stringify(check.sanitized) };
        } catch {
          // Not JSON, pass through
        }
      }

      const response = await originalFetch(input, init);

      // Clone response to avoid consuming it
      const cloned = response.clone();

      // Try to filter response body
      if (adapter.config.filterOutput && cloned.headers.get('content-type')?.includes('json')) {
        try {
          const body = await cloned.json();
          const filter = adapter.filterOutput(body);
          
          if (!filter.allowed || filter.filterResult?.wasFiltered) {
            return new Response(JSON.stringify(filter.filtered), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
        } catch {
          // Not JSON or parsing failed
        }
      }

      return response;
    };
  }
}

export default PromptArmorGenericAdapter;
