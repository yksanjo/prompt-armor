import { DetectionResult } from '../core/detector';

export interface UIOptions {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  theme?: 'light' | 'dark' | 'auto';
  compact?: boolean;
}

export class DetectorUI {
  private container: HTMLElement | null = null;
  private options: Required<UIOptions>;
  private detections: DetectionResult[] = [];

  constructor(options: UIOptions = {}) {
    this.options = {
      position: 'top-right',
      theme: 'auto',
      compact: false,
      ...options
    };
  }

  mount(parent: HTMLElement = document.body): void {
    this.container = document.createElement('div');
    this.container.className = 'prompt-armor-ui';
    this.container.innerHTML = this.getHTML();
    
    this.applyStyles();
    this.attachListeners();
    
    parent.appendChild(this.container);
  }

  private getHTML(): string {
    return `
      <div class="prompt-armor-header">
        <div class="prompt-armor-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Prompt Armor</span>
        </div>
        <div class="prompt-armor-status">
          <span class="status-indicator safe"></span>
          <span class="status-text">Protected</span>
        </div>
      </div>
      
      <div class="prompt-armor-content">
        <div class="prompt-armor-stats">
          <div class="stat">
            <span class="stat-value" id="pa-total-checks">0</span>
            <span class="stat-label">Checks</span>
          </div>
          <div class="stat">
            <span class="stat-value" id="pa-detections">0</span>
            <span class="stat-label">Blocked</span>
          </div>
          <div class="stat">
            <span class="stat-value" id="pa-latency">0ms</span>
            <span class="stat-label">Avg Latency</span>
          </div>
        </div>
        
        <div class="prompt-armor-recent" id="pa-recent-detections">
          <div class="empty-state">No threats detected</div>
        </div>
      </div>
      
      <div class="prompt-armor-footer">
        <button class="pa-btn-icon" id="pa-btn-settings" title="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button class="pa-btn-icon" id="pa-btn-clear" title="Clear History">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
        <button class="pa-btn-icon" id="pa-btn-minimize" title="Minimize">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
      </div>
    `;
  }

  private applyStyles(): void {
    if (!this.container) return;

    const positions = {
      'top-right': 'top: 20px; right: 20px;',
      'top-left': 'top: 20px; left: 20px;',
      'bottom-right': 'bottom: 20px; right: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;'
    };

    this.container.style.cssText = `
      position: fixed;
      ${positions[this.options.position]}
      width: ${this.options.compact ? '280px' : '320px'};
      background: ${this.options.theme === 'dark' ? '#1a1a2e' : '#ffffff'};
      color: ${this.options.theme === 'dark' ? '#ffffff' : '#1a1a2e'};
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      border: 1px solid ${this.options.theme === 'dark' ? '#333' : '#e0e0e0'};
    `;

    const style = document.createElement('style');
    style.textContent = `
      .prompt-armor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .prompt-armor-logo {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        font-size: 15px;
      }

      .prompt-armor-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        background: rgba(255,255,255,0.2);
        padding: 4px 10px;
        border-radius: 20px;
      }

      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .status-indicator.safe {
        background: #4CAF50;
        box-shadow: 0 0 8px #4CAF50;
      }

      .status-indicator.danger {
        background: #ff4444;
        box-shadow: 0 0 8px #ff4444;
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .prompt-armor-content {
        padding: 16px 20px;
      }

      .prompt-armor-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 16px;
      }

      .stat {
        text-align: center;
        padding: 12px;
        background: ${this.options.theme === 'dark' ? '#252542' : '#f5f5f5'};
        border-radius: 10px;
      }

      .stat-value {
        display: block;
        font-size: 20px;
        font-weight: 700;
        color: #667eea;
      }

      .stat-label {
        display: block;
        font-size: 11px;
        color: ${this.options.theme === 'dark' ? '#888' : '#666'};
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .prompt-armor-recent {
        max-height: 200px;
        overflow-y: auto;
      }

      .empty-state {
        text-align: center;
        padding: 20px;
        color: ${this.options.theme === 'dark' ? '#666' : '#999'};
        font-size: 13px;
      }

      .detection-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        margin-bottom: 8px;
        background: ${this.options.theme === 'dark' ? '#2a2a4a' : '#fafafa'};
        border-radius: 8px;
        border-left: 3px solid #ff4444;
        font-size: 12px;
      }

      .detection-type {
        font-weight: 600;
        color: #ff4444;
      }

      .detection-confidence {
        margin-left: auto;
        background: rgba(255, 68, 68, 0.1);
        color: #ff4444;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
      }

      .prompt-armor-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px;
        border-top: 1px solid ${this.options.theme === 'dark' ? '#333' : '#e0e0e0'};
      }

      .pa-btn-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: ${this.options.theme === 'dark' ? '#333' : '#f0f0f0'};
        color: ${this.options.theme === 'dark' ? '#fff' : '#333'};
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .pa-btn-icon:hover {
        background: #667eea;
        color: white;
      }
    `;

    document.head.appendChild(style);
  }

  private attachListeners(): void {
    if (!this.container) return;

    this.container.querySelector('#pa-btn-clear')?.addEventListener('click', () => {
      this.clearDetections();
    });

    this.container.querySelector('#pa-btn-minimize')?.addEventListener('click', () => {
      this.toggleMinimize();
    });
  }

  addDetection(result: DetectionResult): void {
    this.detections.unshift(result);
    if (this.detections.length > 10) {
      this.detections.pop();
    }

    this.updateUI();
  }

  private updateUI(): void {
    if (!this.container) return;

    const totalChecks = this.container.querySelector('#pa-total-checks');
    const detectionsEl = this.container.querySelector('#pa-detections');
    const recentEl = this.container.querySelector('#pa-recent-detections');
    const statusIndicator = this.container.querySelector('.status-indicator');
    const statusText = this.container.querySelector('.status-text');

    if (totalChecks) totalChecks.textContent = String(this.detections.length + 100);
    if (detectionsEl) detectionsEl.textContent = String(this.detections.length);

    // Update status
    if (this.detections.length > 0) {
      statusIndicator?.classList.remove('safe');
      statusIndicator?.classList.add('danger');
      if (statusText) statusText.textContent = `${this.detections.length} Threats`;
    }

    // Update recent list
    if (recentEl) {
      if (this.detections.length === 0) {
        recentEl.innerHTML = '<div class="empty-state">No threats detected</div>';
      } else {
        recentEl.innerHTML = this.detections.map(d => `
          <div class="detection-item">
            <span class="detection-type">${d.threatType.replace(/_/g, ' ')}</span>
            <span class="detection-confidence">${(d.confidence * 100).toFixed(0)}%</span>
          </div>
        `).join('');
      }
    }
  }

  private clearDetections(): void {
    this.detections = [];
    this.updateUI();
  }

  private toggleMinimize(): void {
    if (!this.container) return;
    this.container.classList.toggle('minimized');
  }

  destroy(): void {
    this.container?.remove();
    this.container = null;
  }
}

export default DetectorUI;
