// Main LinkedIn content script - orchestrates the job hunting

class LinkedInJobHunter {
  constructor() {
    this.storage = window.jobHunterStorage;
    this.crawler = new window.NetworkCrawler(this.storage);
    this.detector = new window.JobDetector(this.storage);
    this.networkExpander = new window.NetworkExpander(this.storage);
    this.connectionMonitor = new window.ConnectionMonitor(this.storage);
    this.jobApplicator = new window.JobApplicator(this.storage);
    this.welcomeMessenger = new window.WelcomeMessenger(this.storage);
    this.inviteWithdrawer = new window.InviteWithdrawer(this.storage);

    this.isInitialized = false;
    this.settings = {};
    this.autoScanTimeout = null;
    this.pendingFeedNodes = [];
    this.scannedPosts = new WeakSet();

    // Keep every component in sync when settings change (e.g. saved from the popup)
    this.storage.onSettingsChanged((settings) => {
      this.settings = settings;
      for (const component of [this.crawler, this.detector, this.networkExpander, this.jobApplicator, this.inviteWithdrawer]) {
        component.settings = settings;
      }
      this.updateIndicator();
    });

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

      // A profile opened in the background to view it before connecting:
      // just read it, nothing else
      const { visit } = await chrome.runtime.sendMessage({ action: 'isProfileVisitTab' }) || {};
      if (visit) {
        console.log('[Job Hunter] Viewing this profile before connecting');
        this.isInitialized = true;
        await this.browseProfile();
        return;
      }

      // Add our UI elements
      this.addHunterUI();
      console.log('[Job Hunter] UI added');

      // Set up observers
      this.setupObservers();
      console.log('[Job Hunter] Observers set up');

      // A tab opened to send a welcome message does only that: the pending
      // network expansion task is shared by all LinkedIn tabs and must not
      // take this one over
      const welcomeTask = await this.welcomeMessenger.claimTask();
      const { task: draftTask } = welcomeTask ? {} : await chrome.runtime.sendMessage({ action: 'claimDraftCompletion' }) || {};
      if (welcomeTask) {
        this.welcomeMessenger.run(welcomeTask).catch(error => {
          console.error('[Job Hunter] Welcome message error:', error);
        });
      } else if (draftTask) {
        // A tab opened to complete saved drafts does only that
        this.jobApplicator.completeDraft(draftTask).catch(error => {
          console.error('[Job Hunter] Draft completion error:', error);
        });
      } else if (JobApplicator.hasPendingTask()) {
        // Auto Apply carrying on after going to the job search or the next page
        this.jobApplicator.checkPendingApplying().catch(error => {
          console.error('[Job Hunter] Auto Apply error:', error);
        });
      } else if (InviteWithdrawer.hasPendingTask()) {
        this.inviteWithdrawer.checkPending().catch(error => {
          console.error('[Job Hunter] Withdrawal error:', error);
        });
      } else {
        // Check for pending network expansion task
        await this.networkExpander.checkPendingExpansion();
      }
      console.log('[Job Hunter] Checked for pending network expansion');

      // Auto-scan if enabled
      if (this.settings.scanEnabled) {
        this.scheduleAutoScan();
        console.log('[Job Hunter] Auto-scan scheduled');
      }

      this.isInitialized = true;
      console.log('[Job Hunter] ✅ JobTrail initialized successfully!');

    } catch (error) {
      console.error('[Job Hunter] ❌ Initialization error:', error);
    }
  }

  // Scroll slowly through a profile, as a person reading it would, until the
  // search page closes this tab
  async browseProfile() {
    const pause = (min, max) => new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));
    await pause(1500, 3000);
    for (let i = 0; i < 6; i++) {
      window.scrollBy({ top: 250 + Math.random() * 450, behavior: 'smooth' });
      await pause(1500, 3500);
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
      border-radius: 50%;
      z-index: 10000;
      opacity: 0.7;
      cursor: pointer;
      transition: opacity 0.3s;
    `;

    indicator.addEventListener('click', () => {
      this.toggleScanning();
    });

    document.body.appendChild(indicator);
    this.updateIndicator();
  }

  updateIndicator() {
    const indicator = document.getElementById('job-hunter-indicator');
    if (indicator) {
      indicator.style.background = this.settings.scanEnabled ? '#00a000' : '#666';
      indicator.title = this.settings.scanEnabled ?
        'JobTrail: Active' : 'JobTrail: Inactive';
    }
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

    // Collect added nodes across mutation batches (previously only the last
    // batch was scanned). Throttle rather than debounce: the feed mutates
    // constantly, so a debounce might never fire while nodes pile up.
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          this.pendingFeedNodes.push(node);
        }
      }
    }

    if (this.feedUpdateTimeout) return;
    this.feedUpdateTimeout = setTimeout(() => {
      this.feedUpdateTimeout = null;
      const nodes = this.pendingFeedNodes;
      this.pendingFeedNodes = [];
      this.scanNewFeedContent(nodes);
    }, 1000);
  }

  async scanNewFeedContent(nodes) {
    for (const node of nodes) {
      if (!node.isConnected) continue;

      const posts = node.matches('[data-urn*="activity"]') ?
        [node] : node.querySelectorAll('[data-urn*="activity"]');

      for (const post of posts) {
        await this.scanPost(post);
      }
    }
  }

  async scanPost(postElement) {
    // Avoid re-scanning (and re-notifying about) the same post
    if (this.scannedPosts.has(postElement)) return;
    this.scannedPosts.add(postElement);

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

      // Records the time of this scan for the popup's "Last Scan"
      await this.storage.updateScanStats({});

    } catch (error) {
      console.error('[Job Hunter] Error scanning current page:', error);
    }
  }

  scheduleAutoScan() {
    // Only ever keep one pending auto-scan (toggling on/off/on used to stack timers)
    clearTimeout(this.autoScanTimeout);

    // Auto-scan every 5-15 minutes with random intervals
    const interval = (5 + Math.random() * 10) * 60 * 1000;

    this.autoScanTimeout = setTimeout(() => {
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
    // Start from the latest stored settings so we don't overwrite changes
    // saved elsewhere (e.g. the popup) with a stale copy
    const latest = await this.storage.getSettings();
    this.settings = { ...latest, scanEnabled: !latest.scanEnabled };
    await this.storage.updateSettings(this.settings);

    this.updateIndicator();

    if (this.settings.scanEnabled) {
      this.scheduleAutoScan();
      console.log('Job hunting enabled');
    } else {
      clearTimeout(this.autoScanTimeout);
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
      background: #0f766e;
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
    
    // Build with textContent: the title comes from arbitrary post text, so
    // inserting it as HTML would let a crafted post inject markup into the page
    const heading = document.createElement('strong');
    heading.textContent = '🎯 Job Opportunity Found!';
    const title = document.createElement('div');
    title.textContent = opportunity.title;
    const confidence = document.createElement('small');
    confidence.textContent = `Confidence: ${Math.round(opportunity.confidence * 100)}%`;
    toast.append(heading, title, confidence);

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

  // Nothing automated starts until the Terms of Use have been accepted
  const starts = ['manualScan', 'expandNetwork', 'startJobApplication', 'checkAcceptedConnections', 'withdrawOldInvites'];
  const startsScanning = request.action === 'toggleScanning' && !hunter.settings.scanEnabled;
  if ((starts.includes(request.action) || startsScanning) && !Terms.isAccepted(hunter.settings)) {
    sendResponse({ error: 'Please accept the Terms of Use first (open the extension popup)' });
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
      console.log('[Job Hunter] Network expansion requested with options:', request.options);
      console.log('[Job Hunter] networkExpander exists?', !!hunter.networkExpander);
      if (!hunter.networkExpander) {
        console.error('[Job Hunter] networkExpander not initialized!');
        sendResponse({ error: 'Network expander not initialized' });
        return false;
      }
      // Send response immediately before starting expansion (which may navigate away)
      sendResponse({ success: true });
      // Start expansion asynchronously (don't wait for it)
      hunter.networkExpander.startExpanding(request.options).catch((error) => {
        console.error('[Job Hunter] Network expansion error:', error);
      });
      return false; // Response already sent

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

    case 'startJobApplication':
      console.log('[Job Hunter] ✅ Job application requested...');
      if (!hunter.jobApplicator) {
        console.error('[Job Hunter] ❌ jobApplicator not initialized!');
        sendResponse({ error: 'Job applicator not initialized' });
        return false;
      }
      console.log('[Job Hunter] ✅ Job applicator exists, calling startApplying()...');
      sendResponse({ success: true });
      hunter.jobApplicator.startApplying().catch((error) => {
        console.error('[Job Hunter] ❌ Job application error:', error);
      });
      return false;

    case 'stopJobApplication':
      console.log('[Job Hunter] Stop job application requested...');
      hunter.jobApplicator.stopApplying();
      sendResponse({ success: true });
      return true;

    case 'getJobApplicationStatus':
      console.log('[Job Hunter] Getting job application status...');
      const jobStatus = hunter.jobApplicator.getStatus();
      sendResponse(jobStatus);
      return true;

    case 'withdrawOldInvites':
      if (hunter.inviteWithdrawer.isRunning) {
        sendResponse({ error: 'Already withdrawing invitations' });
        return false;
      }
      // Respond first: this may navigate to the sent invitations page
      sendResponse({ success: true });
      hunter.inviteWithdrawer.start().catch((error) => {
        console.error('[Job Hunter] Withdrawal error:', error);
      });
      return false;

    case 'stopWithdrawing':
      hunter.inviteWithdrawer.stop();
      sendResponse({ success: true });
      return false;

    case 'getWithdrawStatus':
      sendResponse(hunter.inviteWithdrawer.getStatus());
      return false;

    case 'checkAcceptedConnections':
      console.log('[Job Hunter] Checking for accepted connections...');
      if (!hunter.connectionMonitor) {
        console.error('[Job Hunter] connectionMonitor not initialized!');
        sendResponse({ error: 'Connection monitor not initialized' });
        return false;
      }
      sendResponse({ success: true, message: 'Navigating to check connections...' });
      hunter.connectionMonitor.checkAllPendingConnections().catch((error) => {
        console.error('[Job Hunter] Error checking connections:', error);
      });
      return false;

    default:
      console.log('[Job Hunter] Unknown action:', request.action);
      sendResponse({ error: 'Unknown action' });
  }
});