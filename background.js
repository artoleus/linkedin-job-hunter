// Background service worker for LinkedIn Job Hunter

class BackgroundService {
  constructor() {
    console.log('[Background] Service worker starting...');
    this.init();
  }

  init() {
    // Listen for extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('[Background] Extension installed/updated:', details.reason);
      if (details.reason === 'install') {
        this.setupDefaultSettings();
      }
    });

    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('[Background] Message received:', request.action, 'from', sender.tab?.url);
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    console.log('[Background] Service worker initialized');
  }

  async setupDefaultSettings() {
    const defaultSettings = {
      scanEnabled: false,
      maxProfilesPerDay: 80,
      minDelay: 2000,
      maxDelay: 8000,
      keywords: [
        'hiring',
        'looking for',
        'open position',
        'join our team',
        'we are hiring',
        'career opportunity',
        'job opening'
      ],
      excludeKeywords: [
        'not hiring',
        'position filled',
        'closed'
      ],
      targetRoles: [
        'developer',
        'engineer',
        'programmer',
        'software'
      ],
      // Network expansion settings
      networkExpansionEnabled: false,
      maxDailyInvites: 30,  // 25-30 per day recommended
      maxDailyProfileViews: 60,
      connectionsPerRole: 3,  // Connections per role before switching
      usePersonalizedMessages: true,
      targetHiringOnly: false  // Default to all professionals
    };

    await chrome.storage.local.set({ 
      settings: defaultSettings,
      opportunities: [],
      scanStats: {
        profilesScanned: 0,
        opportunitiesFound: 0,
        lastScanDate: null
      }
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'saveOpportunity':
          await this.saveOpportunity(request.opportunity);
          sendResponse({ success: true });
          break;

        case 'getOpportunities':
          const opportunities = await this.getOpportunities();
          sendResponse({ opportunities });
          break;

        case 'updateScanStats':
          await this.updateScanStats(request.stats);
          sendResponse({ success: true });
          break;

        case 'getSettings':
          const settings = await this.getSettings();
          sendResponse({ settings });
          break;

        case 'updateSettings':
          await this.updateSettings(request.settings);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background service error:', error);
      sendResponse({ error: error.message });
    }
  }

  async saveOpportunity(opportunity) {
    console.log('[Background] Attempting to save opportunity:', opportunity.title);
    const result = await chrome.storage.local.get(['opportunities']);
    const opportunities = result.opportunities || [];

    // Check for duplicates
    const exists = opportunities.find(op =>
      op.url === opportunity.url ||
      (op.title === opportunity.title && op.company === opportunity.company)
    );

    if (exists) {
      console.log('[Background] Duplicate opportunity, not saving');
      return;
    }

    opportunity.id = Date.now().toString();
    opportunity.dateFound = new Date().toISOString();
    opportunity.status = 'new';
    opportunities.push(opportunity);

    await chrome.storage.local.set({ opportunities });
    console.log('[Background] ✅ Saved new opportunity:', opportunity.title, 'Total:', opportunities.length);
  }

  async getOpportunities() {
    const result = await chrome.storage.local.get(['opportunities']);
    return result.opportunities || [];
  }

  async updateScanStats(newStats) {
    const result = await chrome.storage.local.get(['scanStats']);
    const stats = result.scanStats || {};
    
    const updatedStats = {
      ...stats,
      ...newStats,
      lastScanDate: new Date().toISOString()
    };

    await chrome.storage.local.set({ scanStats: updatedStats });
  }

  async getSettings() {
    const result = await chrome.storage.local.get(['settings']);
    console.log('[Background] getSettings result:', result.settings ? 'found' : 'not found');

    // If no settings, set up defaults
    if (!result.settings) {
      console.log('[Background] No settings found, setting up defaults');
      await this.setupDefaultSettings();
      const newResult = await chrome.storage.local.get(['settings']);
      return newResult.settings || {};
    }

    return result.settings;
  }

  async updateSettings(newSettings) {
    await chrome.storage.local.set({ settings: newSettings });
  }
}

// Initialize background service
new BackgroundService();