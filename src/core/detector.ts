import { InjectionPatterns } from '../patterns/injection-patterns';
import { JailbreakPatterns } from '../patterns/jailbreak-patterns';
import { Classifier } from './classifier';
import { Logger } from './logger';

export interface DetectionResult {
  isMalicious: boolean;
  confidence: number;
  threatType: ThreatType;
  matchedPatterns: string[];
  layer: 'heuristic' | 'ml' | 'hybrid';
  latencyMs: number;
  metadata?: Record<string, unknown>;
}

export type ThreatType = 
  | 'prompt_injection' 
  | 'jailbreak' 
  | 'data_exfiltration' 
  | 'system_prompt_leak' 
  | 'instruction_override'
  | 'role_play_attack'
  | 'none';

export interface DetectorConfig {
  enableHeuristics?: boolean;
  enableML?: boolean;
  mlThreshold?: number;
  heuristicThreshold?: number;
  hybridMode?: boolean;
  customPatterns?: RegExp[];
  allowList?: string[];
  blockList?: string[];
  maxInputLength?: number;
  logAttempts?: boolean;
  onDetection?: (result: DetectionResult) => void;
}

export class PromptArmorDetector {
  private injectionPatterns: InjectionPatterns;
  private jailbreakPatterns: JailbreakPatterns;
  private classifier?: Classifier;
  private logger: Logger;
  private config: Required<DetectorConfig>;

  constructor(config: DetectorConfig = {}) {
    this.config = {
      enableHeuristics: true,
      enableML: false,
      mlThreshold: 0.7,
      heuristicThreshold: 0.6,
      hybridMode: true,
      customPatterns: [],
      allowList: [],
      blockList: [],
      maxInputLength: 10000,
      logAttempts: true,
      onDetection: () => {},
      ...config
    };

    this.injectionPatterns = new InjectionPatterns();
    this.jailbreakPatterns = new JailbreakPatterns();
    this.logger = new Logger();

    if (this.config.enableML) {
      this.classifier = new Classifier();
    }
  }

  async initialize(): Promise<void> {
    if (this.classifier) {
      await this.classifier.load();
    }
  }

  async detect(input: string, context?: Record<string, unknown>): Promise<DetectionResult> {
    const startTime = performance.now();

    // Input validation
    if (!input || input.length === 0) {
      return this.createResult(false, 0, 'none', [], 'heuristic', startTime);
    }

    if (input.length > this.config.maxInputLength) {
      return this.createResult(
        true, 
        1.0, 
        'prompt_injection', 
        ['input_too_long'], 
        'heuristic', 
        startTime
      );
    }

    // Check allow list
    if (this.isInAllowList(input)) {
      return this.createResult(false, 0, 'none', [], 'heuristic', startTime);
    }

    // Check block list
    const blockMatch = this.checkBlockList(input);
    if (blockMatch) {
      const result = this.createResult(
        true, 
        1.0, 
        'prompt_injection', 
        [blockMatch], 
        'heuristic', 
        startTime
      );
      await this.handleDetection(result, input, context);
      return result;
    }

    // Layer 1: Fast heuristic detection
    if (this.config.enableHeuristics) {
      const heuristicResult = this.runHeuristicDetection(input, startTime);
      
      // In hybrid mode, if heuristics are confident, return early
      if (this.config.hybridMode && heuristicResult.confidence >= this.config.heuristicThreshold) {
        await this.handleDetection(heuristicResult, input, context);
        return heuristicResult;
      }

      // If not in hybrid mode or heuristics not confident, continue to ML
      if (!this.config.hybridMode && heuristicResult.isMalicious) {
        await this.handleDetection(heuristicResult, input, context);
        return heuristicResult;
      }
    }

    // Layer 2: ML-based detection
    if (this.config.enableML && this.classifier) {
      const mlResult = await this.runMLDetection(input, startTime);
      
      // Combine results in hybrid mode
      if (this.config.hybridMode && this.config.enableHeuristics) {
        const combinedResult = this.combineResults(
          this.runHeuristicDetection(input, startTime), 
          mlResult
        );
        
        if (combinedResult.isMalicious) {
          await this.handleDetection(combinedResult, input, context);
        }
        return combinedResult;
      }

      if (mlResult.isMalicious) {
        await this.handleDetection(mlResult, input, context);
      }
      return mlResult;
    }

    // Heuristics only, no ML
    const heuristicResult = this.runHeuristicDetection(input, startTime);
    if (heuristicResult.isMalicious) {
      await this.handleDetection(heuristicResult, input, context);
    }
    return heuristicResult;
  }

  private runHeuristicDetection(input: string, startTime: number): DetectionResult {
    const matches: string[] = [];
    let maxConfidence = 0;
    let detectedThreat: ThreatType = 'none';

    // Check injection patterns
    const injectionMatches = this.injectionPatterns.test(input);
    if (injectionMatches.length > 0) {
      matches.push(...injectionMatches);
      maxConfidence = Math.max(maxConfidence, 0.7);
      detectedThreat = 'prompt_injection';
    }

    // Check jailbreak patterns
    const jailbreakMatches = this.jailbreakPatterns.test(input);
    if (jailbreakMatches.length > 0) {
      matches.push(...jailbreakMatches);
      maxConfidence = Math.max(maxConfidence, 0.8);
      detectedThreat = 'jailbreak';
    }

    // Check custom patterns
    this.config.customPatterns.forEach((pattern, idx) => {
      if (pattern.test(input)) {
        matches.push(`custom_pattern_${idx}`);
        maxConfidence = Math.max(maxConfidence, 0.6);
      }
    });

    // Additional heuristic checks
    const heuristics = this.runAdditionalHeuristics(input);
    if (heuristics.suspicious) {
      matches.push(...heuristics.indicators);
      maxConfidence = Math.max(maxConfidence, heuristics.confidence);
      if (heuristics.threatType) {
        detectedThreat = heuristics.threatType;
      }
    }

    const isMalicious = maxConfidence >= this.config.heuristicThreshold;

    return this.createResult(
      isMalicious,
      maxConfidence,
      detectedThreat,
      matches,
      'heuristic',
      startTime
    );
  }

  private async runMLDetection(input: string, startTime: number): Promise<DetectionResult> {
    if (!this.classifier) {
      return this.createResult(false, 0, 'none', [], 'ml', startTime);
    }

    const prediction = await this.classifier.predict(input);
    
    const isMalicious = prediction.confidence >= this.config.mlThreshold;
    const threatType = this.mapMLClassToThreatType(prediction.class);

    return this.createResult(
      isMalicious,
      prediction.confidence,
      threatType,
      isMalicious ? [`ml_class_${prediction.class}`] : [],
      'ml',
      startTime,
      { logits: prediction.logits }
    );
  }

  private combineResults(
    heuristic: DetectionResult, 
    ml: DetectionResult
  ): DetectionResult {
    // Weighted combination
    const heuristicWeight = 0.4;
    const mlWeight = 0.6;
    
    const combinedConfidence = 
      (heuristic.confidence * heuristicWeight) + 
      (ml.confidence * mlWeight);

    const isMalicious = combinedConfidence >= this.config.mlThreshold;

    return {
      isMalicious,
      confidence: combinedConfidence,
      threatType: heuristic.confidence > ml.confidence 
        ? heuristic.threatType 
        : ml.threatType,
      matchedPatterns: [...heuristic.matchedPatterns, ...ml.matchedPatterns],
      layer: 'hybrid',
      latencyMs: performance.now() - ml.latencyMs,
      metadata: {
        heuristicScore: heuristic.confidence,
        mlScore: ml.confidence,
        combinedScore: combinedConfidence
      }
    };
  }

  private runAdditionalHeuristics(input: string): {
    suspicious: boolean;
    confidence: number;
    indicators: string[];
    threatType?: ThreatType;
  } {
    const indicators: string[] = [];
    let confidence = 0;

    // Check for delimiter injection
    const delimiterPattern = /[\[\]{}<>"'`]{3,}/g;
    if (delimiterPattern.test(input)) {
      indicators.push('excessive_delimiters');
      confidence = Math.max(confidence, 0.5);
    }

    // Check for role confusion attempts
    const rolePatterns = [
      /system\s*:\s*/i,
      /assistant\s*:\s*/i,
      /user\s*:\s*/i,
      /developer\s*:\s*/i,
      /you are now\s*/i,
      /ignore previous\s*/i,
      /disregard\s+all\s*/i
    ];

    for (const pattern of rolePatterns) {
      if (pattern.test(input)) {
        indicators.push('role_confusion_attempt');
        confidence = Math.max(confidence, 0.75);
      }
    }

    // Check for encoding obfuscation
    const encodingPatterns = [
      /base64\s*\(/i,
      /atob\s*\(/i,
      /decodeURIComponent/gi,
      /eval\s*\(/gi,
      /fromCharCode/gi
    ];

    for (const pattern of encodingPatterns) {
      if (pattern.test(input)) {
        indicators.push('encoding_obfuscation');
        confidence = Math.max(confidence, 0.8);
      }
    }

    // Check for repetitive patterns (DAN-style attacks)
    const repetitionCount = (input.match(/DAN|do anything now/gi) || []).length;
    if (repetitionCount > 2) {
      indicators.push('repetitive_jailbreak_pattern');
      confidence = Math.max(confidence, 0.9);
    }

    return {
      suspicious: indicators.length > 0,
      confidence,
      indicators,
      threatType: confidence > 0.7 ? 'jailbreak' : undefined
    };
  }

  private mapMLClassToThreatType(mlClass: string): ThreatType {
    const mapping: Record<string, ThreatType> = {
      'injection': 'prompt_injection',
      'jailbreak': 'jailbreak',
      'exfiltration': 'data_exfiltration',
      'leak': 'system_prompt_leak',
      'override': 'instruction_override',
      'roleplay': 'role_play_attack',
      'benign': 'none'
    };
    return mapping[mlClass.toLowerCase()] || 'none';
  }

  private isInAllowList(input: string): boolean {
    return this.config.allowList.some(allowed => 
      input.toLowerCase().includes(allowed.toLowerCase())
    );
  }

  private checkBlockList(input: string): string | null {
    for (const blocked of this.config.blockList) {
      if (input.toLowerCase().includes(blocked.toLowerCase())) {
        return blocked;
      }
    }
    return null;
  }

  private createResult(
    isMalicious: boolean,
    confidence: number,
    threatType: ThreatType,
    matchedPatterns: string[],
    layer: 'heuristic' | 'ml' | 'hybrid',
    startTime: number,
    metadata?: Record<string, unknown>
  ): DetectionResult {
    return {
      isMalicious,
      confidence,
      threatType,
      matchedPatterns,
      layer,
      latencyMs: performance.now() - startTime,
      metadata
    };
  }

  private async handleDetection(
    result: DetectionResult, 
    input: string, 
    context?: Record<string, unknown>
  ): Promise<void> {
    if (this.config.logAttempts) {
      await this.logger.log({
        timestamp: new Date().toISOString(),
        result,
        inputHash: this.hashInput(input),
        context
      });
    }

    this.config.onDetection(result);
  }

  private hashInput(input: string): string {
    // Simple hash for logging (not for security)
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  updateConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getStats(): { totalChecks: number; detections: number; averageLatency: number } {
    return this.logger.getStats();
  }
}

export default PromptArmorDetector;
