import { DetectionResult } from '../src/core/detector';

interface ExtensionState {
  enabled: boolean;
  blockSubmissions: boolean;
  showWarnings: boolean;
  highlightAttacks: boolean;
  stats: {
    totalChecks: number;
    detections: number;
    byPlatform: Record<string, number>;
  };
}

const defaultState: ExtensionState = {
  enabled: true,
  blockSubmissions: true,
  showWarnings: true,
  highlightAttacks: true,
  stats: {
    totalChecks: 0,
    detections: 0,
    byPlatform: {}
  }
};

class BackgroundService {
  private state: ExtensionState = defaultState;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Load state from storage
    const stored = await chrome.storage.local.get('promptArmorState');
    if (stored.promptArmorState) {
      this.state = { ...defaultState, ...stored.promptArmorState };
    }

    this.setupListeners();
  }

  private setupListeners(): void {
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender).then(sendResponse);
      return true; // Keep channel open for async
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.promptArmorState) {
        this.state = { ...defaultState, ...changes.promptArmorState.newValue };
        this.broadcastState();
      }
    });

    // Listen for tab updates to inject content script
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.checkAndInject(tabId, tab.url);
      }
    });
  }

  private async handleMessage(
    message: { type: string; data?: unknown },
    sender: chrome.runtime.MessageSender
  ): Promise<unknown> {
    switch (message.type) {
      case 'GET_STATE':
        return this.state;

      case 'SET_STATE':
        await this.updateState(message.data as Partial<ExtensionState>);
        return { success: true };

      case 'DETECTION':
        await this.handleDetection(
          message.data as { result: DetectionResult; platform: string }
        );
        return { success: true };

      case 'GET_STATS':
        return this.state.stats;

      case 'RESET_STATS':
        await this.resetStats();
        return { success: true };

      default:
        return { error: 'Unknown message type' };
    }
  }

  private async updateState(updates: Partial<ExtensionState>): Promise<void> {
    this.state = { ...this.state, ...updates };
    await chrome.storage.local.set({ promptArmorState: this.state });
    this.broadcastState();
  }

  private async handleDetection(data: { 
    result: DetectionResult; 
    platform: string;
    inputHash: string;
  }): Promise<void> {
    // Update stats
    this.state.stats.totalChecks++;
    this.state.stats.detections++;
    this.state.stats.byPlatform[data.platform] = 
      (this.state.stats.byPlatform[data.platform] || 0) + 1;

    await chrome.storage.local.set({ promptArmorState: this.state });

    // Show notification
    await this.showNotification(data.result, data.platform);

    // Log for analysis (respecting privacy)
    console.log('[PromptArmor] Detection logged:', {
      threatType: data.result.threatType,
      confidence: data.result.confidence,
      platform: data.platform,
      inputHash: data.inputHash
    });
  }

  private async showNotification(result: DetectionResult, platform: string): Promise<void> {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Prompt Injection Blocked',
      message: `Detected ${result.threatType.replace(/_/g, ' ')} on ${platform} with ${(result.confidence * 100).toFixed(0)}% confidence`,
      priority: 2
    });
  }

  private async resetStats(): Promise<void> {
    this.state.stats = {
      totalChecks: 0,
      detections: 0,
      byPlatform: {}
    };
    await chrome.storage.local.set({ promptArmorState: this.state });
  }

  private broadcastState(): void {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_CONFIG',
            config: {
              enabled: this.state.enabled,
              blockSubmissions: this.state.blockSubmissions,
              showWarnings: this.state.showWarnings,
              highlightAttacks: this.state.highlightAttacks
            }
          }).catch(() => {
            // Tab may not have content script, ignore error
          });
        }
      }
    });
  }

  private checkAndInject(tabId: number, url: string): void {
    const supportedUrls = [
      'chat.openai.com',
      'chatgpt.com',
      'claude.ai',
      'anthropic.com'
    ];

    const shouldInject = supportedUrls.some(supported => url.includes(supported));

    if (shouldInject && this.state.enabled) {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }).catch(console.error);
    }
  }
}

// Initialize service
new BackgroundService();
