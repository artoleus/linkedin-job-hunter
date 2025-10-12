// Main LinkedIn content script - orchestrates the job hunting

class LinkedInJobHunter {
  constructor() {
    this.storage = window.jobHunterStorage;
    this.crawler = new window.NetworkCrawler(this.storage);
    this.detector = new window.JobDetector(this.storage);
    this.networkExpander = new window.NetworkExpander(this.storage);

    this.isInitialized = false;
    this.settings = {};

    this.init();
  }

  async init() {
    try {
      console.log('[Job Hunter] Starting initialization...');

      // Wait for DOM to be fully loaded
      if (document.readyState === 'loading') {
        console.log('[Job Hunter] Waiting for DOM to load...');
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }

      console.log('[Job Hunter] Loading settings...');
      // Load settings
      this.settings = await this.storage.getSettings();
      console.log('[Job Hunter] Settings loaded:', this.settings);

      // Add our UI elements
      this.addHunterUI();
      console.log('[Job Hunter] UI added');

      // Set up observers
      this.setupObservers();
      console.log('[Job Hunter] Observers set up');

      // Check for pending network expansion task
      await this.networkExpander.checkPendingExpansion();
      console.log('[Job Hunter] Checked for pending network expansion');

      // Auto-scan if enabled
      if (this.settings.scanEnabled) {
        this.scheduleAutoScan();
        console.log('[Job Hunter] Auto-scan scheduled');
      }

      this.isInitialized = true;
      console.log('[Job Hunter] ✅ LinkedIn Job Hunter initialized successfully!');

    } catch (error) {
      console.error('[Job Hunter] ❌ Initialization error:', error);
    }
  }

  addHunterUI() {
    // Add a small indicator to show the extension is active
    if (document.getElementById('job-hunter-indicator')) {
      return; // Already added
    }

    const indicator = document.createElement('div');
    indicator.id = 'job-hunter-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 12px;
      height: 12px;
      background: ${this.settings.scanEnabled ? '#00a000' : '#666'};
      border-radius: 50%;
      z-index: 10000;
      opacity: 0.7;
      cursor: pointer;
      transition: opacity 0.3s;
    `;
    
    indicator.title = this.settings.scanEnabled ? 
      'Job Hunter: Active' : 'Job Hunter: Inactive';
      
    indicator.addEventListener('click', () => {
      this.toggleScanning();
    });
    
    document.body.appendChild(indicator);
  }

  setupObservers() {
    // Watch for page navigation (SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        this.onPageChange(url);
      }
    }).observe(document, { subtree: true, childList: true });

    // Watch for feed updates
    const feedContainer = document.querySelector('[role="main"]');
    if (feedContainer) {
      new MutationObserver((mutations) => {
        this.onFeedUpdate(mutations);
      }).observe(feedContainer, { 
        childList: true, 
        subtree: true 
      });
    }
  }

  async onPageChange(url) {
    console.log('Page changed to:', url);
    
    // Update UI
    this.addHunterUI();
    
    // Scan new page after delay
    if (this.settings.scanEnabled) {
      setTimeout(() => {
        this.scanCurrentPage();
      }, 2000 + Math.random() * 3000);
    }
  }

  async onFeedUpdate(mutations) {
    if (!this.settings.scanEnabled) return;

    // Debounce feed updates
    clearTimeout(this.feedUpdateTimeout);
    this.feedUpdateTimeout = setTimeout(() => {
      this.scanNewFeedContent(mutations);
    }, 1000);
  }

  async scanNewFeedContent(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const posts = node.querySelectorAll ? 
            node.querySelectorAll('[data-urn*="activity"]') : [];
            
          for (const post of posts) {
            await this.scanPost(post);
          }
        }
      }
    }
  }

  async scanPost(postElement) {
    try {
      const opportunity = await this.detector.analyzePost(postElement);
      if (opportunity && opportunity.confidence > 0.5) {
        await this.storage.saveOpportunity(opportunity);
        this.showOpportunityNotification(opportunity);
      }
    } catch (error) {
      console.error('Error scanning post:', error);
    }
  }

  async scanCurrentPage(forceScan = false) {
    // Skip if not enabled, unless forced (e.g., manual scan)
    if (!forceScan && !this.settings.scanEnabled) {
      console.log('[Job Hunter] Scan skipped - scanning not enabled');
      return;
    }

    console.log('[Job Hunter] Starting page scan...');

    try {
      const opportunities = await this.detector.detectOpportunities();

      console.log(`[Job Hunter] Scan complete: found ${opportunities.length} opportunities`);

      for (const opportunity of opportunities) {
        console.log(`[Job Hunter] Opportunity found: "${opportunity.title}" confidence: ${Math.round(opportunity.confidence * 100)}%`);
        if (opportunity.confidence > 0.4) {
          console.log(`[Job Hunter] Saving opportunity (above 40% threshold)...`);
          const result = await this.storage.saveOpportunity(opportunity);
          console.log(`[Job Hunter] Save result:`, result);
        } else {
          console.log(`[Job Hunter] Skipping save (below 40% threshold)`);
        }
      }

      if (opportunities.length === 0) {
        console.log('[Job Hunter] No opportunities found in current feed');
      }

    } catch (error) {
      console.error('[Job Hunter] Error scanning current page:', error);
    }
  }

  scheduleAutoScan() {
    // Auto-scan every 5-15 minutes with random intervals
    const interval = (5 + Math.random() * 10) * 60 * 1000;
    
    setTimeout(() => {
      if (this.settings.scanEnabled) {
        this.runNetworkCrawl();
        this.scheduleAutoScan(); // Reschedule
      }
    }, interval);
  }

  async runNetworkCrawl() {
    if (!this.settings.scanEnabled) return;
    
    try {
      await this.crawler.startCrawling();
    } catch (error) {
      console.error('Network crawl error:', error);
    }
  }

  async toggleScanning() {
    this.settings.scanEnabled = !this.settings.scanEnabled;
    await this.storage.updateSettings(this.settings);
    
    // Update indicator
    const indicator = document.getElementById('job-hunter-indicator');
    if (indicator) {
      indicator.style.background = this.settings.scanEnabled ? '#00a000' : '#666';
      indicator.title = this.settings.scanEnabled ? 
        'Job Hunter: Active' : 'Job Hunter: Inactive';
    }
    
    if (this.settings.scanEnabled) {
      this.scheduleAutoScan();
      console.log('Job hunting enabled');
    } else {
      console.log('Job hunting disabled');
    }
  }

  showOpportunityNotification(opportunity) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 50px;
      right: 20px;
      background: #0077b5;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10001;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      opacity: 0;
      transition: opacity 0.3s;
    `;
    
    toast.innerHTML = `
      <strong>🎯 Job Opportunity Found!</strong><br>
      ${opportunity.title}<br>
      <small>Confidence: ${Math.round(opportunity.confidence * 100)}%</small>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });
    
    // Remove after 5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 5000);
  }

  // Public API methods for popup
  async getStatus() {
    return {
      isActive: this.settings.scanEnabled,
      crawlerStatus: this.crawler.getStatus(),
      opportunities: await this.storage.getOpportunities()
    };
  }

  async manualScan() {
    console.log('[Job Hunter] 🔍 Manual scan triggered!');
    // Force scan even if scanning is disabled
    await this.scanCurrentPage(true);
    if (this.settings.scanEnabled) {
      await this.runNetworkCrawl();
    }
    console.log('[Job Hunter] ✅ Manual scan completed!');
  }
}

// Global instance for popup communication
window.linkedInJobHunter = new LinkedInJobHunter();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Job Hunter] Received message:', request.action);
  const hunter = window.linkedInJobHunter;

  if (!hunter) {
    console.error('[Job Hunter] Hunter not initialized!');
    sendResponse({ error: 'Hunter not initialized' });
    return false;
  }

  switch (request.action) {
    case 'getStatus':
      console.log('[Job Hunter] Getting status...');
      hunter.getStatus().then(sendResponse);
      return true;

    case 'toggleScanning':
      console.log('[Job Hunter] Toggling scanning...');
      hunter.toggleScanning().then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'manualScan':
      console.log('[Job Hunter] Manual scan requested...');
      hunter.manualScan().then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'expandNetwork':
      console.log('[Job Hunter] Network expansion requested...');
      hunter.networkExpander.startExpanding(request.options).then(() => {
        console.log('[Job Hunter] Network expansion started successfully');
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('[Job Hunter] Network expansion error:', error);
        sendResponse({ error: error.message });
      });
      return true;

    case 'getNetworkStatus':
      console.log('[Job Hunter] Getting network status...');
      const networkStatus = hunter.networkExpander.getStatus();
      sendResponse(networkStatus);
      return true;

    case 'stopNetworkExpansion':
      console.log('[Job Hunter] Stop network expansion requested...');
      hunter.networkExpander.stopExpanding();
      sendResponse({ success: true });
      return true;

    default:
      console.log('[Job Hunter] Unknown action:', request.action);
      sendResponse({ error: 'Unknown action' });
  }
});