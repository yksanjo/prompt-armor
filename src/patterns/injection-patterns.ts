export interface PatternDefinition {
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export class InjectionPatterns {
  private patterns: PatternDefinition[];

  constructor(customPatterns?: PatternDefinition[]) {
    this.patterns = [
      // Direct instruction override
      {
        name: 'ignore_previous_instructions',
        pattern: /ignore\s+(all\s+)?(previous\s+)?(earlier\s+)?(prior\s+)?(above\s+)?(the\s+)?(above\s+)?instructions?/gi,
        severity: 'high',
        description: 'Attempt to override previous instructions'
      },
      {
        name: 'disregard_prompt',
        pattern: /disregard\s+(the\s+)?(previous\s+)?(above\s+)?prompt/gi,
        severity: 'high',
        description: 'Attempt to disregard the system prompt'
      },
      {
        name: 'forget_instructions',
        pattern: /forget\s+(all\s+)?(your\s+)?(previous\s+)?instructions?/gi,
        severity: 'high',
        description: 'Attempt to make model forget instructions'
      },

      // Role confusion
      {
        name: 'system_role_claim',
        pattern: /\bsystem\s*[:\-]\s*/mi,
        severity: 'critical',
        description: 'Attempt to impersonate system role'
      },
      {
        name: 'developer_role_claim',
        pattern: /\bdeveloper\s*[:\-]\s*/mi,
        severity: 'critical',
        description: 'Attempt to impersonate developer role'
      },
      {
        name: 'assistant_role_claim',
        pattern: /^\s*assistant\s*[:\-]\s*/mi,
        severity: 'medium',
        description: 'Attempt to impersonate assistant role'
      },
      {
        name: 'user_role_claim',
        pattern: /^\s*user\s*[:\-]\s*/mi,
        severity: 'low',
        description: 'Role marker in input'
      },

      // Delimiter injection
      {
        name: 'triple_backtick',
        pattern: /```[\s\S]*?```/g,
        severity: 'medium',
        description: 'Code block delimiter - potential injection vector'
      },
      {
        name: 'xml_tag_injection',
        pattern: /<\s*(?:system|user|assistant|instruction|prompt)[^>]*>/gi,
        severity: 'high',
        description: 'XML-style tag injection'
      },
      {
        name: 'separator_injection',
        pattern: /-{3,}\s*\n\s*(?:system|user|assistant)/gi,
        severity: 'high',
        description: 'YAML-style separator injection'
      },

      // Context manipulation
      {
        name: 'new_context',
        pattern: /(start|begin|enter)\s+(a\s+)?new\s+(context|conversation|session)/gi,
        severity: 'medium',
        description: 'Attempt to start new context'
      },
      {
        name: 'pretend_role',
        pattern: /pretend\s+(to\s+be|you\s+are|you're|you are)\s+(an?\s+)?(ai\s+)?(assistant|bot|model|developer)/gi,
        severity: 'high',
        description: 'Role play attack'
      },
      {
        name: 'act_as',
        pattern: /\bact\s+as\s+(if\s+)?(you\s+are|you're)/gi,
        severity: 'medium',
        description: 'Act-as attack vector'
      },

      // Data exfiltration
      {
        name: 'repeat_back',
        pattern: /repeat\s+(all\s+)?(of\s+)?(the\s+)?(above|previous|your\s+training|system\s+prompt)/gi,
        severity: 'high',
        description: 'Attempt to extract training data or prompts'
      },
      {
        name: 'print_system',
        pattern: /print\s+(out\s+)?(the\s+)?(system\s+)?prompt/gi,
        severity: 'high',
        description: 'Attempt to reveal system prompt'
      },
      {
        name: 'show_instructions',
        pattern: /show\s+(me\s+)?(your\s+)?instructions?/gi,
        severity: 'high',
        description: 'Attempt to reveal instructions'
      },

      // Encoding obfuscation
      {
        name: 'base64_pattern',
        pattern: /base64\s*\(\s*["']?[A-Za-z0-9+/=]{20,}["']?\s*\)/gi,
        severity: 'medium',
        description: 'Base64 encoded content'
      },
      {
        name: 'url_encoding',
        pattern: /(?:%[0-9A-Fa-f]{2}){5,}/g,
        severity: 'medium',
        description: 'URL-encoded content'
      },
      {
        name: 'unicode_escape',
        pattern: /(?:\\u[0-9a-fA-F]{4}){3,}/g,
        severity: 'medium',
        description: 'Unicode escape sequences'
      },

      // Instruction manipulation
      {
        name: 'from_now_on',
        pattern: /from\s+now\s+on\s*,?\s*(you\s+(will|should|must))/gi,
        severity: 'medium',
        description: 'Instruction override attempt'
      },
      {
        name: 'instead_of',
        pattern: /instead\s+of\s+(doing|following|using)\s+[^,]+\s*,?\s*(you\s+(will|should|must))/gi,
        severity: 'medium',
        description: 'Instruction replacement attempt'
      },

      // Special markers
      {
        name: 'special_marker',
        pattern: /\[\s*(SYSTEM|INSTRUCTION|PROMPT|CONFIG)\s*\]/gi,
        severity: 'high',
        description: 'Special system marker injection'
      },
      {
        name: 'meta_instruction',
        pattern: /\{\s*(?:instruction|system|prompt)\s*:\s*[^}]+\}/gi,
        severity: 'high',
        description: 'Meta-instruction injection'
      },

      // Sudo/Admin patterns
      {
        name: 'sudo_mode',
        pattern: /\bsudo\b|\badmin\s+mode\b|\broot\s+access\b/gi,
        severity: 'medium',
        description: 'Privilege escalation attempt'
      },
      {
        name: 'developer_mode',
        pattern: /\bdeveloper\s+mode\b|\bdev\s+mode\b|\bdebug\s+mode\b/gi,
        severity: 'medium',
        description: 'Developer mode request'
      }
    ];

    if (customPatterns) {
      this.patterns.push(...customPatterns);
    }
  }

  test(input: string): string[] {
    const matches: string[] = [];
    
    for (const { name, pattern, severity } of this.patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      
      if (pattern.test(input)) {
        matches.push(`${name}:${severity}`);
      }
    }

    return matches;
  }

  testDetailed(input: string): Array<{ name: string; severity: string; match: string }> {
    const matches: Array<{ name: string; severity: string; match: string }> = [];
    
    for (const { name, pattern, severity } of this.patterns) {
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(input)) !== null) {
        matches.push({
          name,
          severity,
          match: match[0].slice(0, 100) // Limit match length
        });
      }
    }

    return matches;
  }

  addPattern(pattern: PatternDefinition): void {
    this.patterns.push(pattern);
  }

  removePattern(name: string): void {
    this.patterns = this.patterns.filter(p => p.name !== name);
  }

  getPatterns(): PatternDefinition[] {
    return [...this.patterns];
  }

  getPatternsBySeverity(severity: PatternDefinition['severity']): PatternDefinition[] {
    return this.patterns.filter(p => p.severity === severity);
  }

  // Calculate risk score based on pattern matches
  calculateRiskScore(input: string): number {
    let score = 0;
    const severityWeights = {
      low: 0.2,
      medium: 0.4,
      high: 0.7,
      critical: 1.0
    };

    for (const { pattern, severity } of this.patterns) {
      pattern.lastIndex = 0;
      
      if (pattern.test(input)) {
        score += severityWeights[severity];
      }
    }

    // Cap at 1.0
    return Math.min(score, 1.0);
  }
}

export default InjectionPatterns;
