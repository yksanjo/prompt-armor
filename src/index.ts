// Core components
export { PromptArmorDetector, DetectionResult, DetectorConfig, ThreatType } from './core/detector';
export { Classifier, ClassificationResult, ClassifierConfig } from './core/classifier';
export { PromptArmorSanitizer, SanitizationResult, SanitizerConfig } from './core/sanitizer';
export { PromptArmorFilter, FilterResult, FilterConfig } from './core/filter';
export { Logger, LogEntry, LoggerConfig } from './core/logger';

// Pattern libraries
export { InjectionPatterns, PatternDefinition } from './patterns/injection-patterns';
export { JailbreakPatterns, JailbreakPattern } from './patterns/jailbreak-patterns';

// Adapters
export { OpenAIAdapter, OpenAIAdapterConfig, withPromptArmor } from './adapters/openai';
export { AnthropicAdapter, AnthropicAdapterConfig, withPromptArmorAnthropic } from './adapters/anthropic';
export { PromptArmorLangChainAdapter, LangChainAdapterConfig, withPromptArmorLangChain } from './adapters/langchain';
export { PromptArmorGenericAdapter, GenericAdapterConfig, GenericRequest, GenericResponse } from './adapters/generic';

// Browser components (browser build only)
export { DetectorUI, UIOptions } from './browser/detector-ui';

// Main class combining all features
export interface PromptArmorConfig {
  detector?: {
    enableHeuristics?: boolean;
    enableML?: boolean;
    mlThreshold?: number;
    customPatterns?: RegExp[];
  };
  sanitizer?: {
    removeControlChars?: boolean;
    normalizeWhitespace?: boolean;
    maxLength?: number;
  };
  filter?: {
    blockOnDetection?: boolean;
    removePII?: boolean;
    blockedKeywords?: string[];
  };
  logger?: {
    endpoint?: string;
    logAttempts?: boolean;
  };
}

export class PromptArmor {
  detector: import('./core/detector').PromptArmorDetector;
  sanitizer: import('./core/sanitizer').PromptArmorSanitizer;
  filter: import('./core/filter').PromptArmorFilter;
  logger: import('./core/logger').Logger;

  constructor(config: PromptArmorConfig = {}) {
    this.detector = new (require('./core/detector').PromptArmorDetector)(config.detector);
    this.sanitizer = new (require('./core/sanitizer').PromptArmorSanitizer)(config.sanitizer);
    this.filter = new (require('./core/filter').PromptArmorFilter)(config.filter);
    this.logger = new (require('./core/logger').Logger)(config.logger);
  }

  async initialize(): Promise<void> {
    await this.detector.initialize();
  }

  async protect(input: string, context?: Record<string, unknown>): Promise<{
    safe: boolean;
    sanitized: string;
    detection?: import('./core/detector').DetectionResult;
  }> {
    // Sanitize
    const sanitization = this.sanitizer.sanitize(input);
    
    // Detect
    const detection = await this.detector.detect(sanitization.sanitized, context);
    
    if (detection.isMalicious) {
      return {
        safe: false,
        sanitized: sanitization.sanitized,
        detection
      };
    }

    return {
      safe: true,
      sanitized: sanitization.sanitized
    };
  }

  async checkOutput(output: string): Promise<{
    allowed: boolean;
    filtered?: string;
    reasons?: string[];
  }> {
    const result = this.filter.filterOutput(output);
    
    return {
      allowed: result.allowed,
      filtered: result.output,
      reasons: result.filterReasons
    };
  }
}

export default PromptArmor;
