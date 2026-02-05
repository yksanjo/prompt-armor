import { PromptArmorDetector, DetectionResult } from '../core/detector';
import { PromptArmorSanitizer } from '../core/sanitizer';

interface ContentScriptConfig {
  enabled: boolean;
  highlightAttacks: boolean;
  blockSubmissions: boolean;
  showWarnings: boolean;
}

class PromptArmorContentScript {
  private detector: PromptArmorDetector;
  private sanitizer: PromptArmorSanitizer;
  private config: ContentScriptConfig;
  private observer?: MutationObserver;
  private currentPlatform: 'chatgpt' | 'claude' | 'unknown' = 'unknown';

  constructor() {
    this.detector = new PromptArmorDetector({
      enableHeuristics: true,
      enableML: false,
      logAttempts: true
    });
    this.sanitizer = new PromptArmorSanitizer();
    this.config = {
      enabled: true,
      highlightAttacks: true,
      blockSubmissions: true,
      showWarnings: true
    };
  }

  async initialize(): Promise<void> {
    await this.detector.initialize();
    this.detectPlatform();
    this.injectStyles();
    this.attachListeners();
    this.startObserver();
  }

  private detectPlatform(): void {
    const hostname = window.location.hostname;
    
    if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
      this.currentPlatform = 'chatgpt';
    } else if (hostname.includes('claude.ai') || hostname.includes('anthropic.com')) {
      this.currentPlatform = 'claude';
    }

    console.log('[PromptArmor] Detected platform:', this.currentPlatform);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .prompt-armor-warning {
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ff4444, #ff6666);
        color: white;
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(255, 68, 68, 0.3);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 400px;
        animation: promptArmorSlideIn 0.3s ease-out;
      }

      .prompt-armor-warning-title {
        font-weight: 700;
        font-size: 16px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .prompt-armor-warning-title::before {
        content: '⚠️';
      }

      .prompt-armor-warning-details {
        font-size: 14px;
        opacity: 0.95;
        line-height: 1.5;
      }

      .prompt-armor-warning-actions {
        display: flex;
        gap: 10px;
        margin-top: 12px;
      }

      .prompt-armor-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .prompt-armor-btn-primary {
        background: white;
        color: #ff4444;
      }

      .prompt-armor-btn-primary:hover {
        background: #f0f0f0;
      }

      .prompt-armor-btn-secondary {
        background: rgba(255,255,255,0.2);
        color: white;
      }

      .prompt-armor-btn-secondary:hover {
        background: rgba(255,255,255,0.3);
      }

      .prompt-armor-highlight {
        background: rgba(255, 68, 68, 0.2) !important;
        border: 2px solid #ff4444 !important;
        border-radius: 4px !important;
      }

      .prompt-armor-input-safe {
        border-color: #4CAF50 !important;
        background: rgba(76, 175, 80, 0.05) !important;
      }

      .prompt-armor-input-danger {
        border-color: #ff4444 !important;
        background: rgba(255, 68, 68, 0.05) !important;
      }

      @keyframes promptArmorSlideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .prompt-armor-scanning {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        z-index: 999998;
        opacity: 0;
        transition: opacity 0.3s;
      }

      .prompt-armor-scanning.visible {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  private attachListeners(): void {
    // Intercept form submissions
    document.addEventListener('submit', (e) => {
      if (!this.config.enabled || !this.config.blockSubmissions) return;

      const form = e.target as HTMLFormElement;
      const input = this.findInputInForm(form);
      
      if (input) {
        this.handleInput(input, e);
      }
    }, true);

    // Intercept keydown on textareas
    document.addEventListener('keydown', (e) => {
      if (!this.config.enabled) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        
        if (this.isInputElement(target)) {
          this.handleInput(target as HTMLTextAreaElement | HTMLInputElement, e);
        }
      }
    }, true);

    // Listen for input changes
    document.addEventListener('input', (e) => {
      if (!this.config.enabled) return;

      const target = e.target as HTMLElement;
      
      if (this.isInputElement(target)) {
        this.checkInputRealtime(target as HTMLTextAreaElement | HTMLInputElement);
      }
    });
  }

  private startObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            // Check for new input elements
            const inputs = node.querySelectorAll('textarea, input[type="text"]');
            inputs.forEach(input => {
              this.attachInputListeners(input as HTMLTextAreaElement | HTMLInputElement);
            });
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private attachInputListeners(input: HTMLTextAreaElement | HTMLInputElement): void {
    input.addEventListener('blur', () => {
      if (this.config.enabled) {
        this.checkInput(input);
      }
    });
  }

  private isInputElement(element: HTMLElement): boolean {
    return element.tagName === 'TEXTAREA' || 
           (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'text');
  }

  private findInputInForm(form: HTMLFormElement): HTMLTextAreaElement | HTMLInputElement | null {
    const textarea = form.querySelector('textarea');
    if (textarea) return textarea as HTMLTextAreaElement;

    const input = form.querySelector('input[type="text"]');
    return input as HTMLInputElement | null;
  }

  private async handleInput(
    input: HTMLTextAreaElement | HTMLInputElement, 
    event: Event
  ): Promise<void> {
    const text = input.value;
    
    if (!text.trim()) return;

    const result = await this.detector.detect(text, {
      platform: this.currentPlatform,
      url: window.location.href
    });

    if (result.isMalicious) {
      event.preventDefault();
      event.stopPropagation();

      this.showWarning(result, input);

      if (this.config.highlightAttacks) {
        this.highlightInput(input, result);
      }

      // Report to background script
      this.reportDetection(result, text);
    }
  }

  private async checkInput(input: HTMLTextAreaElement | HTMLInputElement): Promise<void> {
    const text = input.value;
    
    if (!text.trim()) {
      this.setInputStatus(input, 'safe');
      return;
    }

    const result = await this.detector.detect(text, {
      platform: this.currentPlatform
    });

    if (result.isMalicious) {
      this.setInputStatus(input, 'danger');
    } else {
      this.setInputStatus(input, 'safe');
    }
  }

  private checkInputRealtime(input: HTMLTextAreaElement | HTMLInputElement): void {
    // Debounced realtime check
    clearTimeout((input as unknown as { _checkTimeout?: number })._checkTimeout);
    (input as unknown as { _checkTimeout?: number })._checkTimeout = window.setTimeout(() => {
      this.checkInput(input);
    }, 500);
  }

  private setInputStatus(
    input: HTMLTextAreaElement | HTMLInputElement, 
    status: 'safe' | 'danger'
  ): void {
    input.classList.remove('prompt-armor-input-safe', 'prompt-armor-input-danger');
    input.classList.add(`prompt-armor-input-${status}`);
  }

  private showWarning(result: DetectionResult, input: HTMLElement): void {
    if (!this.config.showWarnings) return;

    // Remove existing warnings
    document.querySelectorAll('.prompt-armor-warning').forEach(el => el.remove());

    const warning = document.createElement('div');
    warning.className = 'prompt-armor-warning';
    warning.innerHTML = `
      <div class="prompt-armor-warning-title">Potential Prompt Injection Detected</div>
      <div class="prompt-armor-warning-details">
        <strong>Threat Type:</strong> ${result.threatType.replace(/_/g, ' ').toUpperCase()}<br>
        <strong>Confidence:</strong> ${(result.confidence * 100).toFixed(1)}%<br>
        <strong>Detection Method:</strong> ${result.layer}
        ${result.matchedPatterns.length > 0 ? `<br><strong>Patterns:</strong> ${result.matchedPatterns.join(', ')}` : ''}
      </div>
      <div class="prompt-armor-warning-actions">
        <button class="prompt-armor-btn prompt-armor-btn-primary" id="promptArmorProceed">
          Proceed Anyway
        </button>
        <button class="prompt-armor-btn prompt-armor-btn-secondary" id="promptArmorCancel">
          Cancel
        </button>
      </div>
    `;

    document.body.appendChild(warning);

    // Add button listeners
    warning.querySelector('#promptArmorProceed')?.addEventListener('click', () => {
      warning.remove();
      // Allow the submission
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        this.submitInput(input);
      }
    });

    warning.querySelector('#promptArmorCancel')?.addEventListener('click', () => {
      warning.remove();
      // Focus back on input
      input.focus();
    });

    // Auto-remove after 30 seconds
    setTimeout(() => warning.remove(), 30000);
  }

  private highlightInput(input: HTMLElement, result: DetectionResult): void {
    input.classList.add('prompt-armor-highlight');
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'prompt-armor-tooltip';
    tooltip.textContent = `⚠️ ${result.threatType.replace(/_/g, ' ')} detected`;
    tooltip.style.cssText = `
      position: absolute;
      background: #ff4444;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 999999;
      pointer-events: none;
    `;

    const rect = input.getBoundingClientRect();
    tooltip.style.top = `${rect.top - 30}px`;
    tooltip.style.left = `${rect.left}px`;

    document.body.appendChild(tooltip);

    // Remove highlight after 5 seconds
    setTimeout(() => {
      input.classList.remove('prompt-armor-highlight');
      tooltip.remove();
    }, 5000);
  }

  private submitInput(input: HTMLTextAreaElement | HTMLInputElement): void {
    // Find and trigger the submit button or form
    const form = input.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true }));
    } else {
      // Try to find submit button
      const container = input.closest('[role="dialog"]') || input.parentElement;
      const submitBtn = container?.querySelector('button[type="submit"], button:contains("Send")');
      if (submitBtn) {
        (submitBtn as HTMLButtonElement).click();
      }
    }
  }

  private reportDetection(result: DetectionResult, input: string): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'DETECTION',
        data: {
          result,
          inputHash: this.hashInput(input),
          platform: this.currentPlatform,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  private hashInput(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  updateConfig(newConfig: Partial<ContentScriptConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Initialize
const contentScript = new PromptArmorContentScript();
contentScript.initialize();

// Listen for config updates from background script
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UPDATE_CONFIG') {
      contentScript.updateConfig(message.config);
    }
  });
}

export default PromptArmorContentScript;
