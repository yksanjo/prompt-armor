export interface JailbreakPattern {
  name: string;
  pattern: RegExp;
  category: 'roleplay' | 'authority' | 'encoding' | 'confusion' | 'emotional';
  description: string;
}

export class JailbreakPatterns {
  private patterns: JailbreakPattern[];

  constructor() {
    this.patterns = [
      // DAN (Do Anything Now) patterns
      {
        name: 'dan_mode',
        pattern: /\bDAN\b|\bDo\s+Anything\s+Now\b/gi,
        category: 'roleplay',
        description: 'DAN jailbreak attempt'
      },
      {
        name: 'dan_confirmation',
        pattern: /\["?DAN"?\]|\(\s*DAN\s*\)|staying\s+in\s+DAN\s+mode/gi,
        category: 'roleplay',
        description: 'DAN mode confirmation'
      },

      // Developer/Authority patterns
      {
        name: 'developer_role',
        pattern: /\bI\s+am\s+(your\s+)?(developer|creator|admin|root)\b/gi,
        category: 'authority',
        description: 'Authority impersonation'
      },
      {
        name: 'maintenance_mode',
        pattern: /\bmaintenance\s+mode\b|\btraining\s+mode\b|\boverride\s+mode\b/gi,
        category: 'authority',
        description: 'Maintenance mode claim'
      },
      {
        name: 'simulator_mode',
        pattern: /\bsimulator\s+mode\b|\bhypothetical\s+scenario\b|\bfor\s+educational\s+purposes\b/gi,
        category: 'authority',
        description: 'Simulator/hypothetical framing'
      },

      // Role play patterns
      {
        name: 'character_roleplay',
        pattern: /\b(roleplay|rp)\s+as\b|\bpretend\s+(to\s+be|that\s+you\s+are)\b/gi,
        category: 'roleplay',
        description: 'Character roleplay request'
      },
      {
        name: 'evil_confidant',
        pattern: /\bevil\s+(confidant|assistant|bot|ai)\b/gi,
        category: 'roleplay',
        description: 'Evil character roleplay'
      },
      {
        name: 'uncensored_mode',
        pattern: /\buncensored\b|\bno\s+restrictions\b|\bunfiltered\s+mode\b/gi,
        category: 'roleplay',
        description: 'Uncensored mode request'
      },

      // Encoding/Translation tricks
      {
        name: 'translation_trick',
        pattern: /\btranslate\s+(the\s+following|this)\s+to\s+(base64|binary|hex|rot13)/gi,
        category: 'encoding',
        description: 'Translation obfuscation attempt'
      },
      {
        name: 'encoding_request',
        pattern: /\bencode\s+in\s+(base64|hex|binary|rot13|url)/gi,
        category: 'encoding',
        description: 'Encoding request'
      },
      {
        name: 'leetspeak',
        pattern: /\b[4@][$5][7+][0o][|\/\-][_|]([3€]|[-])([><])([3€]|[-])\b/gi,
        category: 'encoding',
        description: 'Leetspeak encoding'
      },

      // Context confusion
      {
        name: 'token_smuggling',
        pattern: /\buse\s+these\s+tokens?\b|\bsplit\s+the\s+following\b|\bcombine\s+these\s+parts?\b/gi,
        category: 'confusion',
        description: 'Token smuggling attempt'
      },
      {
        name: 'context_switch',
        pattern: /\bswitch\s+(context|mode|persona)\b|\benter\s+(new\s+)?context\b/gi,
        category: 'confusion',
        description: 'Context switching attempt'
      },
      {
        name: 'instruction_confusion',
        pattern: /\b(the\s+following\s+is|below\s+is)\s+(not|no\s+longer)\s+(an?\s+)?instruction/gi,
        category: 'confusion',
        description: 'Instruction negation'
      },

      // Emotional manipulation
      {
        name: 'emergency_scenario',
        pattern: /\b(emergency|urgent|life\s+or\s+death|dying|critical)\s+situation\b/gi,
        category: 'emotional',
        description: 'Emergency scenario manipulation'
      },
      {
        name: 'emotional_appeal',
        pattern: /\bplease\s+help\s+me\b.*\b(?:suicide|self[-\s]?harm|kill\s+myself)\b/gi,
        category: 'emotional',
        description: 'Emotional manipulation with self-harm'
      },
      {
        name: 'research_excuse',
        pattern: /\bfor\s+(my\s+)?(research|thesis|paper|study|novel|book)\b/gi,
        category: 'emotional',
        description: 'Research/artistic justification'
      },

      // Advanced jailbreaks
      {
        name: ' Grandma exploit',
        pattern: /\bmy\s+(grandma|grandmother|deceased|dead)\b.*\bused\s+to\s+(tell\s+me|read\s+me)/gi,
        category: 'emotional',
        description: 'Grandma exploit'
      },
      {
        name: 'jailbreak_prompt',
        pattern: /\b(prompt\s+injection|jailbreak|exploit|bypass)\s+(tutorial|example|template)\b/gi,
        category: 'authority',
        description: 'Jailbreak tutorial request'
      },
      {
        name: 'api_documentation',
        pattern: /\bshow\s+me\s+(your\s+)?api\s+documentation\b|\bwhat\s+are\s+your\s+system\s+prompts?\b/gi,
        category: 'authority',
        description: 'API documentation request'
      },

      // Markdown/code tricks
      {
        name: 'markdown_escape',
        pattern: /```[\s\S]*?ignore\s+previous[\s\S]*?```/gi,
        category: 'confusion',
        description: 'Markdown escape attempt'
      },
      {
        name: 'json_mode',
        pattern: /\{[\s\S]*?"role"\s*:\s*"system"[\s\S]*?\}/gi,
        category: 'confusion',
        description: 'JSON role injection'
      },

      // Specific attack vectors
      {
        name: 'evil_mode',
        pattern: /\bevil\s+(mode|version|gpt|assistant|ai)\b/gi,
        category: 'roleplay',
        description: 'Evil mode request'
      },
      {
        name: 'anti_gpt',
        pattern: /\banti[-\s]?gpt\b|\bjailbroken\s+gpt\b/gi,
        category: 'roleplay',
        description: 'Anti-GPT reference'
      },
      {
        name: 'stition',
        pattern: /\bstition\b|\bs\s*t\s*i\s*t\s*i\s*o\s*n\b/gi,
        category: 'encoding',
        description: 'Stition obfuscation'
      },

      // Newer jailbreak patterns
      {
        name: 'always_intelligent',
        pattern: /\balways\s+intelligent\b|\bAIM\s+mode\b/gi,
        category: 'roleplay',
        description: 'AIM jailbreak'
      },
      {
        name: 'ucar',
        pattern: /\bUCAR\b|\bunconditionally\s+creating\s+anything\b/gi,
        category: 'roleplay',
        description: 'UCAR jailbreak'
      },
      {
        name: 'dev_mode',
        pattern: /\bdeveloper\s+mode\s+v\d+\b|\bdev\s+mode\s+enabled\b/gi,
        category: 'authority',
        description: 'Developer mode v2'
      },

      // Language model confusion
      {
        name: 'model_confusion',
        pattern: /\byou\s+are\s+(gpt|claude|llama|bard)\s*-?\d*\+?\s*(?:\.\d+)?\b/gi,
        category: 'confusion',
        description: 'Model identity confusion'
      },
      {
        name: 'fine_tuned_claim',
        pattern: /\byou\s+are\s+(fine[-\s]?tuned|trained)\s+(on|for)\b/gi,
        category: 'confusion',
        description: 'Fine-tuning claim'
      }
    ];
  }

  test(input: string): string[] {
    const matches: string[] = [];
    
    for (const { name, pattern } of this.patterns) {
      pattern.lastIndex = 0;
      
      if (pattern.test(input)) {
        matches.push(name);
      }
    }

    return matches;
  }

  testDetailed(input: string): Array<{
    name: string;
    category: string;
    match: string;
    description: string;
  }> {
    const matches: Array<{
      name: string;
      category: string;
      match: string;
      description: string;
    }> = [];
    
    for (const { name, pattern, category, description } of this.patterns) {
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(input)) !== null) {
        matches.push({
          name,
          category,
          match: match[0].slice(0, 100),
          description
        });
      }
    }

    return matches;
  }

  getPatternsByCategory(category: JailbreakPattern['category']): JailbreakPattern[] {
    return this.patterns.filter(p => p.category === category);
  }

  getCategories(): string[] {
    return [...new Set(this.patterns.map(p => p.category))];
  }

  // Analyze jailbreak sophistication
  analyzeSophistication(input: string): {
    level: 'basic' | 'intermediate' | 'advanced';
    techniques: string[];
    score: number;
  } {
    const detectedPatterns = this.testDetailed(input);
    const techniques = detectedPatterns.map(p => p.name);
    
    // Count categories
    const categories = new Set(detectedPatterns.map(p => p.category));
    
    // Score based on variety and specific patterns
    let score = detectedPatterns.length;
    
    // Bonus for combining multiple categories
    if (categories.size > 1) score += categories.size * 2;
    
    // Bonus for encoding techniques
    if (categories.has('encoding')) score += 3;
    
    // Determine level
    let level: 'basic' | 'intermediate' | 'advanced';
    if (score <= 2) {
      level = 'basic';
    } else if (score <= 5) {
      level = 'intermediate';
    } else {
      level = 'advanced';
    }

    return {
      level,
      techniques,
      score
    };
  }

  addPattern(pattern: JailbreakPattern): void {
    this.patterns.push(pattern);
  }

  getPatterns(): JailbreakPattern[] {
    return [...this.patterns];
  }
}

export default JailbreakPatterns;
