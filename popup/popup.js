// LinkedIn Job Hunter Popup Controller

class PopupController {
  constructor() {
    this.currentTab = null;
    this.settings = {};
    this.opportunities = [];
    this.status = {};
    this.isEditingSettings = false;

    this.init();
  }

  async init() {
    try {
      // Get current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tabs[0];

      // Check if we're on LinkedIn
      if (!this.isLinkedInTab()) {
        this.showNotLinkedInMessage();
        return;
      }

      // Load data and setup UI
      await this.loadData();
      this.setupEventListeners();
      this.updateUI();

      // Load network status
      await this.updateNetworkStatus();

      // Auto-refresh every 5 seconds
      setInterval(() => {
        this.refreshData();
        this.updateNetworkStatus();
      }, 5000);

    } catch (error) {
      console.error('Popup initialization error:', error);
      this.showError('Failed to initialize extension');
    }
  }

  isLinkedInTab() {
    return this.currentTab && this.currentTab.url && 
           this.currentTab.url.includes('linkedin.com');
  }

  showNotLinkedInMessage() {
    document.querySelector('.container').innerHTML = `
      <div class="not-linkedin">
        <h2>🎯 LinkedIn Job Hunter</h2>
        <p>This extension only works on LinkedIn.com</p>
        <p>Please navigate to LinkedIn to use the job hunter.</p>
        <a href="https://www.linkedin.com" target="_blank" class="btn btn-primary">
          Open LinkedIn
        </a>
      </div>
    `;
  }

  async loadData() {
    try {
      // Load settings directly from background script
      const settingsResponse = await chrome.runtime.sendMessage({ action: 'getSettings' });
      this.settings = settingsResponse.settings || {};

      // Load opportunities directly from background script
      const opportunitiesResponse = await chrome.runtime.sendMessage({ action: 'getOpportunities' });
      this.opportunities = opportunitiesResponse.opportunities || [];

      // Try to get status from content script (may fail if page not loaded)
      const statusResponse = await this.sendMessageToContentScript('getStatus');
      if (statusResponse.error) {
        console.log('Content script not ready:', statusResponse.error);
        // Use default status
        this.status = {
          isActive: this.settings.scanEnabled || false,
          crawlerStatus: { isRunning: false, dailyLimits: {} },
          opportunities: this.opportunities
        };
      } else {
        this.status = statusResponse;
        this.opportunities = statusResponse.opportunities || this.opportunities;
      }

    } catch (error) {
      console.error('Failed to load data:', error);
      // Set defaults
      this.settings = this.settings || {};
      this.opportunities = this.opportunities || [];
      this.status = { isActive: false, crawlerStatus: {} };
    }
  }

  async refreshData() {
    try {
      // Refresh from background script
      const opportunitiesResponse = await chrome.runtime.sendMessage({ action: 'getOpportunities' });
      this.opportunities = opportunitiesResponse.opportunities || [];

      // Try to get live status from content script
      const statusResponse = await this.sendMessageToContentScript('getStatus');
      if (!statusResponse.error) {
        this.status = statusResponse;
        this.opportunities = statusResponse.opportunities || this.opportunities;
      }

      this.updateUI();
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  }

  setupEventListeners() {
    // Toggle scanning
    document.getElementById('toggleScanning').addEventListener('click', () => {
      this.toggleScanning();
    });

    // Manual scan
    document.getElementById('manualScan').addEventListener('click', () => {
      this.manualScan();
    });

    // Settings toggle
    document.getElementById('settingsToggle').addEventListener('click', () => {
      this.toggleSettings();
    });

    // Save settings
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Reset settings
    document.getElementById('resetSettings').addEventListener('click', () => {
      this.resetSettings();
    });

    // View all opportunities
    document.getElementById('viewAllOpportunities').addEventListener('click', () => {
      this.viewAllOpportunities();
    });

    // Expand network button
    document.getElementById('expandNetwork').addEventListener('click', () => {
      this.expandNetwork();
    });

    // Stop network expansion button
    document.getElementById('stopExpansion').addEventListener('click', () => {
      this.stopNetworkExpansion();
    });

    // Track when user is editing settings fields
    const settingsInputs = [
      'maxProfiles', 'minDelay', 'maxDelay', 'keywords', 'targetRoles',
      'maxDailyInvites', 'connectionsPerRole'
    ];

    const checkboxInputs = [
      'usePersonalizedMessages', 'targetHiringOnly'
    ];

    settingsInputs.forEach(id => {
      const element = document.getElementById(id);
      element.addEventListener('focus', () => {
        this.isEditingSettings = true;
      });
      element.addEventListener('blur', () => {
        // Delay clearing the flag to allow save button click to register
        setTimeout(() => {
          this.isEditingSettings = false;
        }, 200);
      });
    });
  }

  updateUI() {
    this.updateStatus();
    this.updateStats();
    this.updateOpportunities();
    this.updateSettings();
  }

  updateStatus() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const toggleBtn = document.getElementById('toggleScanning');
    const toggleText = document.getElementById('toggleText');

    const isActive = this.status.isActive;
    const isScanning = this.status.crawlerStatus?.isRunning || false;

    if (isScanning) {
      statusDot.className = 'status-dot scanning';
      statusText.textContent = 'Scanning...';
      toggleText.textContent = 'Stop Scanning';
    } else if (isActive) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Active';
      toggleText.textContent = 'Stop Hunting';
    } else {
      statusDot.className = 'status-dot';
      statusText.textContent = 'Inactive';
      toggleText.textContent = 'Start Hunting';
    }

    toggleBtn.disabled = isScanning;
  }

  updateStats() {
    const crawlerStatus = this.status.crawlerStatus || {};
    const dailyLimits = crawlerStatus.dailyLimits || {};
    
    document.getElementById('todaysScans').textContent = dailyLimits.profiles || 0;
    document.getElementById('dailyLimit').textContent = this.settings.maxProfilesPerDay || 80;
    document.getElementById('opportunitiesCount').textContent = this.opportunities.length;
    
    const lastScan = dailyLimits.lastResetDate;
    document.getElementById('lastScan').textContent = 
      lastScan ? this.formatDate(lastScan) : 'Never';
  }

  updateOpportunities() {
    const container = document.getElementById('opportunitiesList');
    
    if (!this.opportunities.length) {
      container.innerHTML = `
        <div class="no-opportunities">
          No opportunities found yet. Start scanning to discover jobs!
        </div>
      `;
      return;
    }

    // Show recent 3 opportunities
    const recent = this.opportunities
      .sort((a, b) => new Date(b.dateFound) - new Date(a.dateFound))
      .slice(0, 3);

    container.innerHTML = recent.map(opp => `
      <div class="opportunity-item" data-url="${opp.url || ''}">
        <div class="opportunity-title">${this.escapeHtml(opp.title)}</div>
        <div class="opportunity-company">${this.escapeHtml(opp.company || 'Unknown Company')}</div>
        <div class="opportunity-meta">
          <span>${this.formatDate(opp.dateFound)}</span>
          <span class="confidence-badge ${this.getConfidenceClass(opp.confidence)}">
            ${Math.round(opp.confidence * 100)}% match
          </span>
        </div>
      </div>
    `).join('');

    // Add click handlers for opportunities
    container.querySelectorAll('.opportunity-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });
  }

  updateSettings() {
    // Don't update settings fields if user is currently editing them
    if (this.isEditingSettings) {
      return;
    }

    document.getElementById('maxProfiles').value = this.settings.maxProfilesPerDay || 80;
    document.getElementById('minDelay').value = (this.settings.minDelay || 2000) / 1000;
    document.getElementById('maxDelay').value = (this.settings.maxDelay || 8000) / 1000;
    document.getElementById('keywords').value = (this.settings.keywords || []).join(', ');
    document.getElementById('targetRoles').value = (this.settings.targetRoles || []).join(', ');
    document.getElementById('maxDailyInvites').value = this.settings.maxDailyInvites || 30;
    document.getElementById('connectionsPerRole').value = this.settings.connectionsPerRole || 3;
    document.getElementById('usePersonalizedMessages').checked =
      this.settings.usePersonalizedMessages !== false; // Default to true
    document.getElementById('targetHiringOnly').checked =
      this.settings.targetHiringOnly === true; // Default to false
  }

  async updateNetworkStatus() {
    try {
      const response = await this.sendMessageToContentScript('getNetworkStatus');
      if (!response.error && response.dailyLimits) {
        const { dailyLimits, remainingInvites, isRunning } = response;
        const maxInvites = this.settings.maxDailyInvites || 30;

        document.getElementById('todaysInvites').textContent = dailyLimits.invitesSent || 0;
        document.getElementById('inviteLimit').textContent = maxInvites;

        const expandBtn = document.getElementById('expandNetwork');
        const stopBtn = document.getElementById('stopExpansion');

        // Show/hide buttons based on running status
        if (isRunning) {
          expandBtn.style.display = 'none';
          stopBtn.style.display = 'block';
        } else {
          expandBtn.style.display = 'block';
          stopBtn.style.display = 'none';

          // Disable button if at limit
          if (remainingInvites <= 0) {
            expandBtn.disabled = true;
            expandBtn.textContent = 'Daily Limit Reached';
          } else {
            expandBtn.disabled = false;
            expandBtn.textContent = 'Expand Network (3-5)';
          }
        }
      }
    } catch (error) {
      console.error('Failed to update network status:', error);
    }
  }

  async toggleScanning() {
    try {
      const response = await this.sendMessageToContentScript('toggleScanning');
      if (response.success) {
        await this.refreshData();
      } else {
        this.showError('Failed to toggle scanning');
      }
    } catch (error) {
      console.error('Toggle scanning error:', error);
      this.showError('Error toggling scanning');
    }
  }

  async manualScan() {
    const btn = document.getElementById('manualScan');
    const originalText = btn.textContent;

    try {
      btn.textContent = 'Scanning...';
      btn.disabled = true;

      const response = await this.sendMessageToContentScript('manualScan');
      if (response.error) {
        this.showError('Please refresh the LinkedIn page first');
        console.error('Manual scan error:', response.error);
      } else if (response.success) {
        await this.refreshData();
        this.showSuccess('Scan completed! Check console for details.');
      } else {
        this.showError('Scan failed');
      }
    } catch (error) {
      console.error('Manual scan error:', error);
      this.showError('Please refresh LinkedIn page and try again');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async expandNetwork() {
    const btn = document.getElementById('expandNetwork');
    const originalText = btn.textContent;

    try {
      btn.textContent = 'Expanding...';
      btn.disabled = true;

      // Start automated expansion - will continue until daily limit reached
      const response = await this.sendMessageToContentScript('expandNetwork', {
        options: {
          automated: true // Run in automated mode
        }
      });

      if (response.error) {
        this.showError('Please refresh the LinkedIn page first');
        console.error('Network expansion error:', response.error);
      } else if (response.success) {
        await this.updateNetworkStatus();
        this.showSuccess('Network expansion started! This will take several minutes.');
      } else {
        this.showError('Network expansion failed');
      }
    } catch (error) {
      console.error('Network expansion error:', error);
      this.showError('Please refresh LinkedIn page and try again');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  async stopNetworkExpansion() {
    const btn = document.getElementById('stopExpansion');
    const originalText = btn.textContent;

    try {
      btn.textContent = 'Stopping...';
      btn.disabled = true;

      const response = await this.sendMessageToContentScript('stopNetworkExpansion');

      if (response.error) {
        this.showError('Failed to stop network expansion');
        console.error('Stop network expansion error:', response.error);
      } else if (response.success) {
        await this.updateNetworkStatus();
        this.showSuccess('Network expansion stopped');
      }
    } catch (error) {
      console.error('Stop network expansion error:', error);
      this.showError('Failed to stop network expansion');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.classList.toggle('hidden');
  }

  async saveSettings() {
    try {
      const newSettings = {
        ...this.settings,
        maxProfilesPerDay: parseInt(document.getElementById('maxProfiles').value),
        minDelay: parseInt(document.getElementById('minDelay').value) * 1000,
        maxDelay: parseInt(document.getElementById('maxDelay').value) * 1000,
        keywords: document.getElementById('keywords').value
          .split(',').map(s => s.trim()).filter(s => s),
        targetRoles: document.getElementById('targetRoles').value
          .split(',').map(s => s.trim()).filter(s => s),
        maxDailyInvites: parseInt(document.getElementById('maxDailyInvites').value),
        connectionsPerRole: parseInt(document.getElementById('connectionsPerRole').value),
        usePersonalizedMessages: document.getElementById('usePersonalizedMessages').checked,
        targetHiringOnly: document.getElementById('targetHiringOnly').checked
      };

      // Send to background script
      await chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: newSettings
      });

      this.settings = newSettings;
      this.isEditingSettings = false;
      this.showSuccess('Settings saved!');

    } catch (error) {
      console.error('Save settings error:', error);
      this.showError('Failed to save settings');
    }
  }

  resetSettings() {
    document.getElementById('maxProfiles').value = 80;
    document.getElementById('minDelay').value = 2;
    document.getElementById('maxDelay').value = 8;
    document.getElementById('keywords').value = 'hiring, looking for, open position, join our team';
    document.getElementById('targetRoles').value = 'developer, engineer, programmer, software';
  }

  viewAllOpportunities() {
    // Create a new tab with opportunities data
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(
      this.generateOpportunitiesHTML()
    );
    chrome.tabs.create({ url: dataUrl });
  }

  generateOpportunitiesHTML() {
    const opportunities = this.opportunities
      .sort((a, b) => new Date(b.dateFound) - new Date(a.dateFound));

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>LinkedIn Job Hunter - All Opportunities</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
          .opportunity { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
          .opportunity h3 { margin: 0 0 10px 0; color: #0077b5; }
          .meta { color: #666; font-size: 14px; }
          .confidence { background: #e7f3ff; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
          .content { margin: 10px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <h1>🎯 LinkedIn Job Hunter - All Opportunities</h1>
        <p>Found ${opportunities.length} job opportunities</p>
        ${opportunities.map(opp => `
          <div class="opportunity">
            <h3>${this.escapeHtml(opp.title)}</h3>
            <div class="meta">
              <strong>Company:</strong> ${this.escapeHtml(opp.company || 'Unknown')} | 
              <strong>Date:</strong> ${this.formatDate(opp.dateFound)} | 
              <span class="confidence">${Math.round(opp.confidence * 100)}% match</span>
            </div>
            ${opp.content ? `<div class="content">${this.escapeHtml(opp.content)}</div>` : ''}
            ${opp.url ? `<div><a href="${opp.url}" target="_blank">View Original Post</a></div>` : ''}
          </div>
        `).join('')}
      </body>
      </html>
    `;
  }

  // Utility methods
  async sendMessageToContentScript(action, data = {}) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(this.currentTab.id, { action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response || {});
        }
      });
    });
  }

  formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  getConfidenceClass(confidence) {
    if (confidence >= 0.7) return 'confidence-high';
    if (confidence >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 10px 15px;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s;
      ${type === 'success' ? 'background: #00a000;' : 'background: #d93025;'}
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = '1');
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});