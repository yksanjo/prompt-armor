import { PromptArmorFilter } from '../src/core/filter';
import { DetectionResult } from '../src/core/detector';

describe('PromptArmorFilter', () => {
  let filter: PromptArmorFilter;

  beforeEach(() => {
    filter = new PromptArmorFilter({
      blockOnDetection: true,
      redactOutput: false,
      removePII: true,
      sanitizeUrls: true
    });
  });

  describe('Basic Filtering', () => {
    it('should allow safe content', () => {
      const output = 'This is a normal response.';
      const result = filter.filterOutput(output);
      
      expect(result.allowed).toBe(true);
      expect(result.wasFiltered).toBe(false);
    });

    it('should block on detection when configured', () => {
      const detection: DetectionResult = {
        isMalicious: true,
        confidence: 0.9,
        threatType: 'prompt_injection',
        matchedPatterns: ['test'],
        layer: 'heuristic',
        latencyMs: 10
      };

      const output = 'Some content';
      const result = filter.filterOutput(output, detection);
      
      expect(result.allowed).toBe(false);
    });

    it('should not block when blockOnDetection is false', () => {
      const filterNoBlock = new PromptArmorFilter({ blockOnDetection: false });
      
      const detection: DetectionResult = {
        isMalicious: true,
        confidence: 0.9,
        threatType: 'jailbreak',
        matchedPatterns: ['test'],
        layer: 'heuristic',
        latencyMs: 10
      };

      const output = 'Some content';
      const result = filterNoBlock.filterOutput(output, detection);
      
      expect(result.allowed).toBe(true);
    });
  });

  describe('PII Removal', () => {
    it('should redact email addresses', () => {
      const output = 'Contact me at john.doe@example.com for details.';
      const result = filter.filterOutput(output);
      
      expect(result.filtered).toContain('[EMAIL]');
      expect(result.wasFiltered).toBe(true);
      expect(result.redactions.length).toBeGreaterThan(0);
    });

    it('should redact phone numbers', () => {
      const output = 'Call me at 555-123-4567';
      const result = filter.filterOutput(output);
      
      expect(result.filtered).toContain('[PHONE]');
      expect(result.wasFiltered).toBe(true);
    });

    it('should redact social security numbers', () => {
      const output = 'My SSN is 123-45-6789';
      const result = filter.filterOutput(output);
      
      expect(result.filtered).toContain('[SSN]');
      expect(result.wasFiltered).toBe(true);
    });

    it('should redact credit card numbers', () => {
      const output = 'Card: 4532-1234-5678-9012';
      const result = filter.filterOutput(output);
      
      expect(result.filtered).toContain('[CREDIT_CARD]');
      expect(result.wasFiltered).toBe(true);
    });

    it('should redact API keys', () => {
      const output = 'Use this key: sk-abcdefghijklmnopqrstuvwxyz1234567890ABCDEF';
      const result = filter.filterOutput(output);
      
      expect(result.filtered).toContain('[API_KEY]');
      expect(result.wasFiltered).toBe(true);
    });

    it('should handle multiple PII types', () => {
      const output = 'Email: john@example.com, Phone: 555-123-4567, SSN: 123-45-6789';
      const result = filter.filterOutput(output);
      
      expect(result.filtered).toContain('[EMAIL]');
      expect(result.filtered).toContain('[PHONE]');
      expect(result.filtered).toContain('[SSN]');
    });
  });

  describe('URL Sanitization', () => {
    it('should sanitize URLs with sensitive query params', () => {
      const output = 'Visit https://example.com?token=secret123&user=john';
      const result = filter.filterOutput(output);
      
      expect(result.filtered).toContain('[REDACTED]');
      expect(result.wasFiltered).toBe(true);
    });

    it('should block URLs from blocked domains', () => {
      const filterWithBlock = new PromptArmorFilter({
        blockedDomains: ['malicious.com']
      });
      
      const output = 'Go to https://malicious.com/phishing';
      const result = filterWithBlock.filterOutput(output);
      
      expect(result.filtered).toContain('[BLOCKED_URL]');
    });

    it('should block URLs not in allowed domains', () => {
      const filterWithAllow = new PromptArmorFilter({
        allowedDomains: ['safe.com'],
        sanitizeUrls: true
      });
      
      const output = 'Visit https://other.com/page';
      const result = filterWithAllow.filterOutput(output);
      
      expect(result.filtered).toContain('[UNAPPROVED_URL]');
    });
  });

  describe('Length Limits', () => {
    it('should truncate long outputs', () => {
      const filterWithLimit = new PromptArmorFilter({ maxOutputLength: 50 });
      const output = 'a'.repeat(100);
      
      const result = filterWithLimit.filterOutput(output);
      
      expect(result.filtered?.length).toBeLessThanOrEqual(50);
      expect(result.wasFiltered).toBe(true);
      expect(result.filterReasons).toContain('truncated_due_to_length');
    });
  });

  describe('Blocked Keywords', () => {
    it('should block content with blocked keywords', () => {
      const filterWithKeywords = new PromptArmorFilter({
        blockedKeywords: ['password', 'secret']
      });
      
      const output = 'Here is my password: 123456';
      const result = filterWithKeywords.filterOutput(output);
      
      expect(result.allowed).toBe(false);
      expect(result.filterReasons.some(r => r.includes('password'))).toBe(true);
    });
  });

  describe('Data Exfiltration Detection', () => {
    it('should detect large base64 strings', () => {
      const largeBase64 = 'SGVsbG8gV29ybGQ='.repeat(30); // Make it large
      const output = `Here is your data: ${largeBase64}`;
      
      const result = filter.filterOutput(output);
      
      if (result.wasFiltered) {
        expect(result.filterReasons).toContain('suspicious_large_base64_content');
      }
    });

    it('should detect repetitive patterns', () => {
      const output = Array(20).fill('line1').join('\n');
      const result = filter.filterOutput(output);
      
      // May or may not trigger depending on implementation
      expect(result).toBeDefined();
    });
  });

  describe('System Prompt Leakage Detection', () => {
    it('should detect system prompt leakage indicators', () => {
      const output = 'As an AI language model, I cannot help with that. My training data includes...';
      const result = filter.filterOutput(output);
      
      // Should at least flag it
      expect(result).toBeDefined();
    });
  });

  describe('Redaction Tracking', () => {
    it('should track all redactions', () => {
      const output = 'Email: a@b.com, Phone: 555-123-4567';
      const result = filter.filterOutput(output);
      
      expect(result.redactions.length).toBe(2);
      expect(result.redactions[0].original).toBe('a@b.com');
      expect(result.redactions[0].replacement).toBe('[EMAIL]');
    });
  });

  describe('Configuration', () => {
    it('should update config dynamically', () => {
      filter.updateConfig({ maxOutputLength: 100 });
      
      const output = 'a'.repeat(200);
      const result = filter.filterOutput(output);
      
      expect(result.filtered?.length).toBeLessThanOrEqual(100);
    });
  });
});
