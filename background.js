// Background service worker for LinkedIn Job Hunter

class BackgroundService {
  constructor() {
    console.log('[Background] Service worker starting...');
    // Serialises read-modify-write storage operations so concurrent messages
    // (e.g. several connection requests saved in quick succession) can't
    // overwrite each other's changes.
    this.writeQueue = Promise.resolve();
    this.init();
  }

  // Run fn after all previously queued writes have finished
  withLock(fn) {
    const result = this.writeQueue.then(fn);
    this.writeQueue = result.catch(() => {});
    return result;
  }

  generateId() {
    return Date.now().toString() + Math.random().toString(36).slice(2, 8);
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
      targetHiringOnly: false,  // Default to all professionals
      // Job application settings
      jobApplicationEnabled: false,
      maxDailyApplications: 20,
      targetJobRoles: ['developer', 'software engineer', 'programmer'],
      minSalary: null,
      maxSalary: null,
      workTypes: ['remote', 'hybrid'],  // remote, hybrid, onsite
      homeLocation: {
        address: '',  // User's home location
        lat: null,
        lng: null
      },
      maxHybridDistance: 75,  // miles
      autoFillName: '',
      autoFillEmail: '',
      autoFillPhone: ''
    };

    await chrome.storage.local.set({
      settings: defaultSettings,
      opportunities: [],
      scanStats: {
        profilesScanned: 0,
        opportunitiesFound: 0,
        lastScanDate: null
      },
      connectionAnalytics: {
        requests: [],
        stats: {
          totalSent: 0,
          totalAccepted: 0,
          totalDeclined: 0,
          totalPending: 0,
          acceptanceRate: 0,
          avgResponseTime: 0
        }
      },
      jobApplications: {
        applications: [],
        searchCriteria: {
          targetRoles: ['developer', 'software engineer'],
          minSalary: null,
          maxSalary: null,
          workTypes: ['remote', 'hybrid'],
          homeLocation: {
            address: '',
            lat: null,
            lng: null
          },
          maxHybridDistance: 75
        }
      }
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'saveOpportunity':
          await this.withLock(() => this.saveOpportunity(request.opportunity));
          sendResponse({ success: true });
          break;

        case 'getOpportunities':
          const opportunities = await this.getOpportunities();
          sendResponse({ opportunities });
          break;

        case 'updateScanStats':
          await this.withLock(() => this.updateScanStats(request.stats));
          sendResponse({ success: true });
          break;

        case 'getSettings':
          const settings = await this.getSettings();
          sendResponse({ settings });
          break;

        case 'updateSettings':
          await this.withLock(() => this.updateSettings(request.settings));
          sendResponse({ success: true });
          break;

        case 'saveConnectionRequest':
          await this.withLock(() => this.saveConnectionRequest(request.requestData));
          sendResponse({ success: true });
          break;

        case 'updateConnectionStatus':
          await this.withLock(() => this.updateConnectionStatus(request.requestId, request.status));
          sendResponse({ success: true });
          break;

        case 'getConnectionAnalytics':
          const analytics = await this.getConnectionAnalytics();
          sendResponse({ analytics });
          break;

        case 'resetAcceptedToPending':
          await this.withLock(() => this.resetAcceptedToPending());
          sendResponse({ success: true });
          break;

        case 'recalculateStats':
          await this.withLock(() => this.recalculateConnectionStats());
          sendResponse({ success: true });
          break;

        case 'saveJobApplication':
          await this.withLock(() => this.saveJobApplication(request.applicationData));
          sendResponse({ success: true });
          break;

        case 'updateJobApplication':
          await this.withLock(() => this.updateJobApplication(request.applicationId, request.updates));
          sendResponse({ success: true });
          break;

        case 'getJobApplications':
          const applications = await this.getJobApplications();
          sendResponse({ applications });
          break;

        case 'importJobApplications':
          sendResponse({
            success: true,
            ...await this.withLock(() => this.importJobApplications(request.applications))
          });
          break;

        case 'importConnectionRequests':
          sendResponse({
            success: true,
            ...await this.withLock(() => this.importConnectionRequests(request.requests))
          });
          break;

        case 'deleteJobApplication':
          await this.withLock(() => this.deleteJobApplication(request.applicationId));
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

    opportunity.id = this.generateId();
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

  // Connection Analytics Methods
  async saveConnectionRequest(requestData) {
    console.log('[Background] Saving connection request:', requestData.fullName);
    const result = await chrome.storage.local.get(['connectionAnalytics']);
    const analytics = result.connectionAnalytics || { requests: [], stats: {} };

    const request = {
      id: this.generateId(),
      targetRole: requestData.targetRole,
      fullName: requestData.fullName,
      profileUrl: requestData.profileUrl,
      sentDate: new Date().toISOString(),
      status: 'pending',
      responseDate: null,
      messageTemplate: requestData.messageTemplate || null,
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay()
    };

    analytics.requests.push(request);
    analytics.stats = this.computeConnectionStats(analytics.requests);

    await chrome.storage.local.set({ connectionAnalytics: analytics });
    console.log('[Background] Connection request saved. Total sent:', analytics.stats.totalSent);
  }

  async updateConnectionStatus(requestId, status) {
    console.log('[Background] Updating connection status:', requestId, status);
    const result = await chrome.storage.local.get(['connectionAnalytics']);
    const analytics = result.connectionAnalytics || { requests: [], stats: {} };

    const request = analytics.requests.find(r => r.id === requestId);
    if (!request) {
      console.log('[Background] Request not found:', requestId);
      return;
    }

    if (request.status === status) {
      return;
    }

    request.status = status;
    request.responseDate = status === 'pending' ? null : new Date().toISOString();
    analytics.stats = this.computeConnectionStats(analytics.requests);

    await chrome.storage.local.set({ connectionAnalytics: analytics });
    console.log('[Background] Connection status updated. Acceptance rate:',
                Math.round(analytics.stats.acceptanceRate * 100) + '%');
  }

  // Merge connection requests imported from a CSV export, skipping any that
  // already exist (same person, sent in the same minute)
  async importConnectionRequests(imported = []) {
    const result = await chrome.storage.local.get(['connectionAnalytics']);
    const analytics = result.connectionAnalytics || { requests: [], stats: {} };
    const keyOf = (r) => `${(r.fullName || '').toLowerCase()}|${new Date(r.sentDate).toISOString().slice(0, 16)}`;
    const seen = new Set(analytics.requests.map(keyOf));

    let added = 0;
    for (const item of imported) {
      const sent = new Date(item.sentDate);
      if (!item.fullName || isNaN(sent)) continue;

      const status = ['pending', 'accepted', 'declined'].includes(item.status) ? item.status : 'pending';
      const responded = item.responseDate ? new Date(item.responseDate) : null;
      const request = {
        id: this.generateId(),
        targetRole: item.targetRole || 'Unknown',
        fullName: String(item.fullName),
        profileUrl: item.profileUrl || null,
        sentDate: sent.toISOString(),
        status,
        responseDate: status !== 'pending' && responded && !isNaN(responded) ? responded.toISOString() : null,
        messageTemplate: item.messageTemplate || null,
        timeOfDay: sent.getHours(),
        dayOfWeek: sent.getDay()
      };

      const key = keyOf(request);
      if (seen.has(key)) continue;
      seen.add(key);
      analytics.requests.push(request);
      added++;
    }

    analytics.stats = this.computeConnectionStats(analytics.requests);
    await chrome.storage.local.set({ connectionAnalytics: analytics });
    console.log('[Background] Imported', added, 'connection requests');
    return { added, skipped: imported.length - added };
  }

  async getConnectionAnalytics() {
    const result = await chrome.storage.local.get(['connectionAnalytics']);
    return result.connectionAnalytics || { requests: [], stats: {} };
  }

  async resetAcceptedToPending() {
    console.log('[Background] Resetting all accepted connections to pending...');
    const result = await chrome.storage.local.get(['connectionAnalytics']);
    const analytics = result.connectionAnalytics || { requests: [], stats: {} };

    let resetCount = 0;

    // Reset all accepted requests to pending
    analytics.requests.forEach(request => {
      if (request.status === 'accepted') {
        request.status = 'pending';
        request.responseDate = null;
        resetCount++;
      }
    });

    // Persist the reset (previously the changes were discarded because stats
    // were recalculated from a fresh storage read before saving)
    analytics.stats = this.computeConnectionStats(analytics.requests);
    await chrome.storage.local.set({ connectionAnalytics: analytics });

    console.log('[Background] Reset complete:', resetCount, 'connections reset to pending');
  }

  async recalculateConnectionStats() {
    console.log('[Background] Recalculating connection statistics...');
    const result = await chrome.storage.local.get(['connectionAnalytics']);
    const analytics = result.connectionAnalytics || { requests: [], stats: {} };

    analytics.stats = this.computeConnectionStats(analytics.requests);

    await chrome.storage.local.set({ connectionAnalytics: analytics });
    console.log('[Background] Stats recalculated. Acceptance rate:',
                Math.round(analytics.stats.acceptanceRate * 100) + '%');
  }

  // Derive all connection stats from the request list so they can never drift
  computeConnectionStats(requests) {
    const countBy = (status) => requests.filter(r => r.status === status).length;
    const totalSent = requests.length;
    const totalAccepted = countBy('accepted');

    // Average response time (accepted/declined requests only)
    const responded = requests.filter(r => r.responseDate && r.status !== 'pending');
    const totalResponseTime = responded.reduce(
      (sum, r) => sum + (new Date(r.responseDate) - new Date(r.sentDate)), 0);

    return {
      totalSent,
      totalAccepted,
      totalDeclined: countBy('declined'),
      totalPending: countBy('pending'),
      // Acceptance rate is accepted / total sent
      acceptanceRate: totalSent > 0 ? totalAccepted / totalSent : 0,
      avgResponseTime: responded.length > 0 ? totalResponseTime / responded.length : 0
    };
  }

  // Job Application Methods
  async saveJobApplication(applicationData) {
    console.log('[Background] Saving job application:', applicationData.jobTitle);
    const result = await chrome.storage.local.get(['jobApplications']);
    const jobApps = result.jobApplications || { applications: [] };

    const application = {
      id: this.generateId(),
      jobId: applicationData.jobId,
      jobTitle: applicationData.jobTitle,
      company: applicationData.company,
      location: applicationData.location,
      salary: applicationData.salary,
      workType: applicationData.workType,
      distance: applicationData.distance,
      appliedDate: new Date().toISOString(),
      status: applicationData.status || 'applied',
      requiresCoverLetter: applicationData.requiresCoverLetter || false,
      notes: applicationData.notes || '',
      jobUrl: applicationData.jobUrl
    };

    jobApps.applications.push(application);
    await chrome.storage.local.set({ jobApplications: jobApps });
    console.log('[Background] Job application saved. Total:', jobApps.applications.length);
  }

  async updateJobApplication(applicationId, updates) {
    console.log('[Background] Updating job application:', applicationId);
    const result = await chrome.storage.local.get(['jobApplications']);
    const jobApps = result.jobApplications || { applications: [] };

    const application = jobApps.applications.find(app => app.id === applicationId);
    if (!application) {
      console.log('[Background] Application not found:', applicationId);
      return;
    }

    Object.assign(application, updates);
    await chrome.storage.local.set({ jobApplications: jobApps });
    console.log('[Background] Job application updated:', applicationId);
  }

  // Merge applications imported from a CSV export, skipping any that already
  // exist (same title and company, applied in the same minute)
  async importJobApplications(imported = []) {
    const result = await chrome.storage.local.get(['jobApplications']);
    const jobApps = result.jobApplications || { applications: [] };
    const keyOf = (app) => [
      (app.jobTitle || '').toLowerCase(),
      (app.company || '').toLowerCase(),
      new Date(app.appliedDate).toISOString().slice(0, 16)
    ].join('|');
    const seen = new Set(jobApps.applications.map(keyOf));

    let added = 0;
    for (const item of imported) {
      const applied = new Date(item.appliedDate);
      if (!item.jobTitle || isNaN(applied)) continue;

      const application = {
        id: this.generateId(),
        jobId: item.jobUrl || null,
        jobTitle: String(item.jobTitle),
        company: item.company || '',
        location: item.location || '',
        salary: item.salary || null,
        workType: item.workType || null,
        distance: null,
        appliedDate: applied.toISOString(),
        status: item.status || 'applied',
        requiresCoverLetter: item.requiresCoverLetter === true,
        notes: item.notes || '',
        jobUrl: item.jobUrl || ''
      };

      const key = keyOf(application);
      if (seen.has(key)) continue;
      seen.add(key);
      jobApps.applications.push(application);
      added++;
    }

    await chrome.storage.local.set({ jobApplications: jobApps });
    console.log('[Background] Imported', added, 'job applications');
    return { added, skipped: imported.length - added };
  }

  async getJobApplications() {
    const result = await chrome.storage.local.get(['jobApplications']);
    return result.jobApplications || { applications: [] };
  }

  async deleteJobApplication(applicationId) {
    console.log('[Background] Deleting job application:', applicationId);
    const result = await chrome.storage.local.get(['jobApplications']);
    const jobApps = result.jobApplications || { applications: [] };

    // Filter out the application to delete
    jobApps.applications = jobApps.applications.filter(app => app.id !== applicationId);

    await chrome.storage.local.set({ jobApplications: jobApps });
    console.log('[Background] Job application deleted. Remaining:', jobApps.applications.length);
  }
}

// Initialize background service
new BackgroundService();