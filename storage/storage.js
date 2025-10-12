// Storage utility for LinkedIn Job Hunter

class StorageManager {
  constructor() {
    this.cache = new Map();
  }

  // Send message to background service worker
  async sendMessage(action, data = {}) {
    return new Promise((resolve) => {
      // Check if extension context is valid
      if (!chrome.runtime?.id) {
        console.error('[Storage] Extension context invalidated');
        resolve({ error: 'Extension context invalid' });
        return;
      }

      try {
        chrome.runtime.sendMessage({ action, ...data }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Storage] Message error:', chrome.runtime.lastError.message);
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || {});
          }
        });
      } catch (error) {
        console.error('[Storage] Send message failed:', error);
        resolve({ error: error.message });
      }
    });
  }

  async saveOpportunity(opportunity) {
    return await this.sendMessage('saveOpportunity', { opportunity });
  }

  async getOpportunities() {
    const response = await this.sendMessage('getOpportunities');
    return response.opportunities || [];
  }

  async updateScanStats(stats) {
    return await this.sendMessage('updateScanStats', { stats });
  }

  async getSettings() {
    if (this.cache.has('settings')) {
      console.log('[Storage] Returning cached settings');
      return this.cache.get('settings');
    }

    console.log('[Storage] Fetching settings from background...');
    const response = await this.sendMessage('getSettings');

    if (response.error) {
      console.error('[Storage] Failed to get settings:', response.error);
      // Return default settings on error
      const defaultSettings = {
        scanEnabled: false,
        maxProfilesPerDay: 80,
        minDelay: 2000,
        maxDelay: 8000,
        keywords: ['hiring', 'looking for', 'open position', 'join our team'],
        excludeKeywords: ['not hiring', 'position filled'],
        targetRoles: ['developer', 'engineer', 'programmer', 'software']
      };
      this.cache.set('settings', defaultSettings);
      return defaultSettings;
    }

    if (response.settings) {
      console.log('[Storage] Settings received:', response.settings);
      this.cache.set('settings', response.settings);
      return response.settings;
    }

    return {};
  }

  async updateSettings(settings) {
    this.cache.set('settings', settings);
    return await this.sendMessage('updateSettings', { settings });
  }

  // Clear cache when settings are updated
  clearCache() {
    this.cache.clear();
  }
}

// Global storage instance
window.jobHunterStorage = new StorageManager();