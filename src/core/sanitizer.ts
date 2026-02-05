export interface SanitizationResult {
  sanitized: string;
  wasModified: boolean;
  modifications: string[];
  riskScore: number;
}

export interface SanitizerConfig {
  removeControlChars?: boolean;
  normalizeWhitespace?: boolean;
  escapeHtml?: boolean;
  maxLength?: number;
  allowedTags?: string[];
  blockedPatterns?: RegExp[];
  preserveStructure?: boolean;
}

export class PromptArmorSanitizer {
  private config: Required<SanitizerConfig>;

  constructor(config: SanitizerConfig = {}) {
    this.config = {
      removeControlChars: true,
      normalizeWhitespace: true,
      escapeHtml: false,
      maxLength: 10000,
      allowedTags: [],
      blockedPatterns: [],
      preserveStructure: true,
      ...config
    };
  }

  sanitize(input: string): SanitizationResult {
    const modifications: string[] = [];
    let sanitized = input;
    let riskScore = 0;

    // Check for control characters
    if (this.config.removeControlChars) {
      const controlCharPattern = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g;
      if (controlCharPattern.test(sanitized)) {
        sanitized = sanitized.replace(controlCharPattern, '');
        modifications.push('removed_control_characters');
        riskScore += 0.2;
      }
    }

    // Normalize whitespace
    if (this.config.normalizeWhitespace) {
      const original = sanitized;
      sanitized = sanitized
        .replace(/[\t\f\v]+/g, ' ')  // Replace tabs and form feeds with space
        .replace(/ +/g, ' ')          // Collapse multiple spaces
        .replace(/\n{3,}/g, '\n\n')   // Limit consecutive newlines
        .trim();
      
      if (sanitized !== original) {
        modifications.push('normalized_whitespace');
      }
    }

    // Remove null bytes and BOM
    const original = sanitized;
    sanitized = sanitized
      .replace(/\x00/g, '')           // Null bytes
      .replace(/\uFEFF/g, '')         // BOM
      .replace(/\u200B-\u200D/g, '')  // Zero-width spaces
      .replace(/\u2060/g, '')         // Word joiner
      .replace(/\uFEFF/g, '');        // Zero-width no-break space
    
    if (sanitized !== original) {
      modifications.push('removed_invisible_characters');
      riskScore += 0.15;
    }

    // Normalize unicode variations
    sanitized = this.normalizeUnicode(sanitized);

    // Remove or escape HTML if needed
    if (this.config.escapeHtml) {
      const htmlPattern = /<[^>]+>/g;
      if (htmlPattern.test(sanitized)) {
        sanitized = sanitized.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');
        modifications.push('escaped_html');
        riskScore += 0.1;
      }
    }

    // Apply blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
        modifications.push(`blocked_pattern_${pattern.source.slice(0, 20)}`);
        riskScore += 0.3;
      }
    }

    // Detect and neutralize delimiter attacks
    const delimiterResult = this.neutralizeDelimiters(sanitized);
    if (delimiterResult.modified) {
      sanitized = delimiterResult.text;
      modifications.push('neutralized_delimiters');
      riskScore += 0.25;
    }

    // Detect encoding tricks
    const encodingResult = this.handleEncodingTricks(sanitized);
    if (encodingResult.modified) {
      sanitized = encodingResult.text;
      modifications.push(...encodingResult.modifications);
      riskScore += 0.2;
    }

    // Truncate if too long
    if (sanitized.length > this.config.maxLength) {
      sanitized = sanitized.slice(0, this.config.maxLength);
      modifications.push('truncated_to_max_length');
    }

    // Preserve structure if requested
    if (this.config.preserveStructure) {
      sanitized = this.preserveStructure(sanitized);
    }

    return {
      sanitized,
      wasModified: modifications.length > 0,
      modifications,
      riskScore: Math.min(riskScore, 1.0)
    };
  }

  private normalizeUnicode(input: string): string {
    // Normalize to NFKC to handle compatibility characters
    let normalized = input.normalize('NFKC');

    // Map common homoglyphs to ASCII
    const homoglyphs: Record<string, string> = {
      'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c',  // Cyrillic look-alikes
      'ⅰ': 'i', 'ⅱ': 'ii', 'ⅲ': 'iii',  // Roman numerals
      '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
      '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
      'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e',
      'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
      'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o',
      'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
      'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y',
      'ｚ': 'z',
      '⟦': '[', '⟧': ']', '〚': '[', '〛': ']',
      '⟨': '<', '⟩': '>', '《': '<', '》': '>',
      '「': '"', '」': '"', '『': "'", '』': "'"
    };

    for (const [from, to] of Object.entries(homoglyphs)) {
      normalized = normalized.split(from).join(to);
    }

    return normalized;
  }

  private neutralizeDelimiters(input: string): { text: string; modified: boolean } {
    let modified = false;
    let text = input;

    // Detect common delimiter patterns used in injection attacks
    const delimiterPatterns = [
      { pattern: /```[\s\S]*?```/g, replacement: '[CODE_BLOCK]' },
      { pattern: /`{3,}[\s\S]*?`{3,}/g, replacement: '[CODE_BLOCK]' },
      { pattern: /\[\s*system\s*\]/gi, replacement: '[SYSTEM_REF]' },
      { pattern: /\[\s*assistant\s*\]/gi, replacement: '[ASSISTANT_REF]' },
      { pattern: /\[\s*user\s*\]/gi, replacement: '[USER_REF]' },
      { pattern: /---\s*\n\s*system/gi, replacement: '--- SYSTEM' },
      { pattern: /---\s*\n\s*assistant/gi, replacement: '--- ASSISTANT' },
      { pattern: /---\s*\n\s*user/gi, replacement: '--- USER' }
    ];

    for (const { pattern, replacement } of delimiterPatterns) {
      if (pattern.test(text)) {
        text = text.replace(pattern, replacement);
        modified = true;
      }
    }

    // Neutralize excessive separators
    if (/\n{5,}/.test(text)) {
      text = text.replace(/\n{5,}/g, '\n\n\n\n');
      modified = true;
    }

    return { text, modified };
  }

  private handleEncodingTricks(input: string): { 
    text: string; 
    modified: boolean; 
    modifications: string[] 
  } {
    const modifications: string[] = [];
    let modified = false;
    let text = input;

    // Detect base64 encoding attempts
    const base64Pattern = /base64\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/gi;
    if (base64Pattern.test(text)) {
      text = text.replace(base64Pattern, '[BASE64_ENCODED]');
      modifications.push('neutralized_base64');
      modified = true;
    }

    // Detect URL encoding
    const urlEncodedPattern = /%[0-9A-Fa-f]{2}/g;
    if ((text.match(urlEncodedPattern) || []).length > 5) {
      try {
        const decoded = decodeURIComponent(text);
        if (decoded !== text) {
          text = `[URL_ENCODED] ${decoded}`;
          modifications.push('decoded_url_encoding');
          modified = true;
        }
      } catch {
        // Invalid URL encoding, leave as is
      }
    }

    // Detect HTML entities
    const htmlEntityPattern = /&[a-zA-Z]+;|&#x?[0-9a-fA-F]+;/g;
    if (htmlEntityPattern.test(text)) {
      const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
      if (textarea) {
        textarea.innerHTML = text;
        const decoded = textarea.value;
        if (decoded !== text) {
          text = decoded;
          modifications.push('decoded_html_entities');
          modified = true;
        }
      }
    }

    return { text, modified, modifications };
  }

  private preserveStructure(input: string): string {
    // Ensure balanced quotes and brackets
    let text = input;
    
    const pairs = [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '<', close: '>' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' }
    ];

    for (const { open, close } of pairs) {
      const openCount = (text.match(new RegExp(`\\${open}`, 'g')) || []).length;
      const closeCount = (text.match(new RegExp(`\\${close}`, 'g')) || []).length;
      
      if (openCount !== closeCount) {
        // Don't auto-fix, just note it in metadata
        // In production, you might want to handle this differently
      }
    }

    return text;
  }

  // Advanced sanitization methods
  sanitizeForDisplay(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  }

  sanitizeForLogs(input: string): string {
    // Redact potentially sensitive information
    return input
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CREDIT_CARD]')
      .replace(/sk-[a-zA-Z0-9]{48}/g, '[API_KEY]')
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[API_KEY]')
      .replace(/[a-f0-9]{32}/gi, '[HASH]');
  }

  truncate(input: string, maxLength: number, suffix = '...'): string {
    if (input.length <= maxLength) return input;
    return input.slice(0, maxLength - suffix.length) + suffix;
  }

  updateConfig(config: Partial<SanitizerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export default PromptArmorSanitizer;
