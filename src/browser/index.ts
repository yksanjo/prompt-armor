// Browser-specific exports
export { DetectorUI, UIOptions } from './detector-ui';
export { default as PromptArmorContentScript } from './content-script';

// Re-export core functionality for browser builds
export { PromptArmorDetector, DetectionResult, DetectorConfig, ThreatType } from '../core/detector';
export { PromptArmorSanitizer, SanitizationResult, SanitizerConfig } from '../core/sanitizer';
export { PromptArmorFilter, FilterResult, FilterConfig } from '../core/filter';
export { InjectionPatterns, PatternDefinition } from '../patterns/injection-patterns';
export { JailbreakPatterns, JailbreakPattern } from '../patterns/jailbreak-patterns';

// Browser-compatible logger (uses localStorage)
export { Logger, LogEntry, LoggerConfig } from '../core/logger';

// Browser-specific initialization
export async function createBrowserDetector() {
  const { PromptArmorDetector } = await import('../core/detector');
  
  const detector = new PromptArmorDetector({
    enableHeuristics: true,
    enableML: false, // ONNX not available in content scripts
    logAttempts: true
  });
  
  await detector.initialize();
  return detector;
}

// Create UI for content script
export function createDetectorUI(options?: { position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' }) {
  const { DetectorUI } = require('./detector-ui');
  const ui = new DetectorUI(options);
  ui.mount();
  return ui;
}
