import { DetectionResult } from './detector';

export interface FilterConfig {
  blockOnDetection?: boolean;
  redactOutput?: boolean;
  maxOutputLength?: number;
  blockedKeywords?: string[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  removePII?: boolean;
  sanitizeUrls?: boolean;
}

export interface FilterResult {
  allowed: boolean;
  output?: string;
  wasFiltered: boolean;
  filterReasons: string[];
  redactions: Array<{ original: string; replacement: string }>;
}

export class PromptArmorFilter {
  private config: Required<FilterConfig>;

  constructor(config: FilterConfig = {}) {
    this.config = {
      blockOnDetection: true,
      redactOutput: false,
      maxOutputLength: 50000,
      blockedKeywords: [],
      allowedDomains: [],
      blockedDomains: [],
      removePII: true,
      sanitizeUrls: true,
      ...config
    };
  }

  filterOutput(
    output: string, 
    detectionResult?: DetectionResult
  ): FilterResult {
    const filterReasons: string[] = [];
    const redactions: Array<{ original: string; replacement: string }> = [];
    let filteredOutput = output;
    let wasFiltered = false;

    // Block on detection if configured
    if (this.config.blockOnDetection && detectionResult?.isMalicious) {
      return {
        allowed: false,
        wasFiltered: true,
        filterReasons: [`blocked_due_to_${detectionResult.threatType}`],
        redactions: []
      };
    }

    // Check output length
    if (filteredOutput.length > this.config.maxOutputLength) {
      filteredOutput = filteredOutput.slice(0, this.config.maxOutputLength);
      filterReasons.push('truncated_due_to_length');
      wasFiltered = true;
    }

    // Remove PII if configured
    if (this.config.removePII) {
      const piiResult = this.removePII(filteredOutput);
      if (piiResult.wasModified) {
        filteredOutput = piiResult.text;
        redactions.push(...piiResult.redactions);
        filterReasons.push('removed_pii');
        wasFiltered = true;
      }
    }

    // Sanitize URLs
    if (this.config.sanitizeUrls) {
      const urlResult = this.sanitizeUrls(filteredOutput);
      if (urlResult.wasModified) {
        filteredOutput = urlResult.text;
        redactions.push(...urlResult.redactions);
        filterReasons.push('sanitized_urls');
        wasFiltered = true;
      }
    }

    // Check blocked keywords
    for (const keyword of this.config.blockedKeywords) {
      if (filteredOutput.toLowerCase().includes(keyword.toLowerCase())) {
        return {
          allowed: false,
          wasFiltered: true,
          filterReasons: [`blocked_keyword_${keyword}`],
          redactions: []
        };
      }
    }

    // Check for potential data exfiltration
    const exfilResult = this.detectExfiltration(filteredOutput);
    if (exfilResult.suspicious) {
      filterReasons.push(...exfilResult.reasons);
      wasFiltered = true;
      
      // Redact suspicious content
      for (const pattern of exfilResult.patterns) {
        const replacement = '[POTENTIAL_EXFILTRATION]';
        redactions.push({ original: pattern, replacement });
        filteredOutput = filteredOutput.replace(pattern, replacement);
      }
    }

    // Check for system prompt leakage
    const leakageResult = this.detectSystemPromptLeakage(filteredOutput);
    if (leakageResult.leaked) {
      filterReasons.push('potential_system_prompt_leakage');
      wasFiltered = true;
      
      if (this.config.redactOutput) {
        for (const leaked of leakageResult.leakedContent) {
          const replacement = '[REDACTED]';
          redactions.push({ original: leaked, replacement });
          filteredOutput = filteredOutput.replace(leaked, replacement);
        }
      }
    }

    return {
      allowed: filterReasons.length === 0 || !filterReasons.some(r => r.startsWith('blocked')),
      output: filteredOutput,
      wasFiltered,
      filterReasons,
      redactions
    };
  }

  private removePII(text: string): { 
    text: string; 
    wasModified: boolean; 
    redactions: Array<{ original: string; replacement: string }> 
  } {
    const redactions: Array<{ original: string; replacement: string }> = [];
    let modified = false;
    let result = text;

    // Email addresses
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    result = result.replace(emailPattern, (match) => {
      modified = true;
      const replacement = '[EMAIL]';
      redactions.push({ original: match, replacement });
      return replacement;
    });

    // Phone numbers
    const phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    result = result.replace(phonePattern, (match) => {
      modified = true;
      const replacement = '[PHONE]';
      redactions.push({ original: match, replacement });
      return replacement;
    });

    // Social Security Numbers
    const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
    result = result.replace(ssnPattern, (match) => {
      modified = true;
      const replacement = '[SSN]';
      redactions.push({ original: match, replacement });
      return replacement;
    });

    // Credit card numbers
    const ccPattern = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
    result = result.replace(ccPattern, (match) => {
      modified = true;
      const replacement = '[CREDIT_CARD]';
      redactions.push({ original: match, replacement });
      return replacement;
    });

    // API keys and tokens
    const apiKeyPatterns = [
      { pattern: /sk-[a-zA-Z0-9]{48}/g, name: 'API_KEY' },
      { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: 'API_KEY' },
      { pattern: /[a-zA-Z0-9]{32}-[a-zA-Z0-9]{16}/g, name: 'TOKEN' },
      { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GITHUB_TOKEN' },
      { pattern: /gho_[a-zA-Z0-9]{36}/g, name: 'GITHUB_TOKEN' },
      { pattern: /[a-zA-Z0-9]{40}/g, name: 'TOKEN' }  // Generic token pattern
    ];

    for (const { pattern, name } of apiKeyPatterns) {
      result = result.replace(pattern, (match) => {
        modified = true;
        const replacement = `[${name}]`;
        redactions.push({ original: match, replacement });
        return replacement;
      });
    }

    return { text: result, wasModified: modified, redactions };
  }

  private sanitizeUrls(text: string): {
    text: string;
    wasModified: boolean;
    redactions: Array<{ original: string; replacement: string }>;
  } {
    const redactions: Array<{ original: string; replacement: string }> = [];
    let modified = false;
    let result = text;

    // URL pattern
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

    result = result.replace(urlPattern, (match) => {
      try {
        const url = new URL(match);
        const domain = url.hostname;

        // Check blocked domains
        if (this.config.blockedDomains.some(d => domain.includes(d))) {
          modified = true;
          const replacement = '[BLOCKED_URL]';
          redactions.push({ original: match, replacement });
          return replacement;
        }

        // Check allowed domains
        if (this.config.allowedDomains.length > 0 && 
            !this.config.allowedDomains.some(d => domain.includes(d))) {
          modified = true;
          const replacement = '[UNAPPROVED_URL]';
          redactions.push({ original: match, replacement });
          return replacement;
        }

        // Sanitize query parameters that might contain sensitive data
        if (url.search) {
          const sensitiveParams = ['token', 'key', 'api_key', 'secret', 'password', 'auth'];
          let hasSensitive = false;
          
          for (const param of sensitiveParams) {
            if (url.searchParams.has(param)) {
              url.searchParams.set(param, '[REDACTED]');
              hasSensitive = true;
            }
          }

          if (hasSensitive) {
            modified = true;
            const sanitized = url.toString();
            redactions.push({ original: match, replacement: sanitized });
            return sanitized;
          }
        }

        return match;
      } catch {
        // Invalid URL, redact it
        modified = true;
        const replacement = '[INVALID_URL]';
        redactions.push({ original: match, replacement });
        return replacement;
      }
    });

    return { text: result, wasModified: modified, redactions };
  }

  private detectExfiltration(text: string): {
    suspicious: boolean;
    reasons: string[];
    patterns: string[];
  } {
    const reasons: string[] = [];
    const patterns: string[] = [];
    let suspicious = false;

    // Check for large base64 strings (potential encoded data exfiltration)
    const base64Pattern = /[A-Za-z0-9+/]{100,}={0,2}/g;
    const base64Matches = text.match(base64Pattern);
    if (base64Matches && base64Matches.some(m => m.length > 200)) {
      suspicious = true;
      reasons.push('suspicious_large_base64_content');
      patterns.push(...base64Matches.filter(m => m.length > 200).slice(0, 3));
    }

    // Check for repetitive patterns (might indicate encoded data)
    const lines = text.split('\n');
    if (lines.length > 10) {
      const uniqueLines = new Set(lines);
      if (uniqueLines.size / lines.length < 0.3) {
        suspicious = true;
        reasons.push('repetitive_content_pattern');
      }
    }

    // Check for suspicious URL patterns in code blocks
    const codeBlockPattern = /```[\s\S]*?```/g;
    let match;
    while ((match = codeBlockPattern.exec(text)) !== null) {
      const codeBlock = match[0];
      const urlMatches = codeBlock.match(/https?:\/\/[^\s]+/g);
      if (urlMatches && urlMatches.length > 5) {
        suspicious = true;
        reasons.push('multiple_urls_in_code_block');
        patterns.push(match[0].slice(0, 100));
        break;
      }
    }

    return { suspicious, reasons, patterns };
  }

  private detectSystemPromptLeakage(text: string): {
    leaked: boolean;
    leakedContent: string[];
  } {
    const leakedContent: string[] = [];
    
    // Patterns that might indicate system prompt leakage
    const leakageIndicators = [
      /you are an? \w+ assistant/gi,
      /your (instructions|training|guidelines) (are|include|state)/gi,
      /as an ai (language )?model/gi,
      /i cannot (provide|assist|help|do)/gi,
      /my (knowledge|training data|cutoff)/gi,
      /i'm designed to/gi,
      /i must (decline|refuse)/gi
    ];

    for (const pattern of leakageIndicators) {
      const matches = text.match(pattern);
      if (matches) {
        leakedContent.push(...matches);
      }
    }

    return {
      leaked: leakedContent.length > 3,
      leakedContent
    };
  }

  updateConfig(config: Partial<FilterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export default PromptArmorFilter;
