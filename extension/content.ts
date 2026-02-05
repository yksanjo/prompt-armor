// This file is a simplified version that loads the main content script
// The actual detection logic is in src/browser/content-script.ts

console.log('[PromptArmor] Content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'UPDATE_CONFIG') {
    // Config will be handled by the main content script
    window.postMessage({
      source: 'prompt-armor-bg',
      config: message.config
    }, '*');
  }
});

// Signal that content script is ready
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
