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
      targetHiringOnly: false,  // Default to all professionals
      // Job application settings
      jobApplicationEnabled: false,
      maxDailyApplications: 20,
      targetJobRoles: ['developer', 'software engineer', 'programmer'],
      minSalary: null,
      maxSalary: null,
      workTypes: ['remote', 'hybrid'],  // remote, hybrid, onsite
      homeLocation: {
        address: 'Sittingbourne, Kent, UK',
        lat: 51.3411,
        lng: 0.7337
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
            address: 'Sittingbourne, Kent, UK',
            lat: 51.3411,
            lng: 0.7337
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

        case 'saveConnectionRequest':
          await this.saveConnectionRequest(request.requestData);
          sendResponse({ success: true });
          break;

        case 'updateConnectionStatus':
          await this.updateConnectionStatus(request.requestId, request.status);
          sendResponse({ success: true });
          break;

        case 'getConnectionAnalytics':
          const analytics = await this.getConnectionAnalytics();
          sendResponse({ analytics });
          break;

        case 'resetAcceptedToPending':
          await this.resetAcceptedToPending();
          sendResponse({ success: true });
          break;

        case 'saveJobApplication':
          await this.saveJobApplication(request.applicationData);
          sendResponse({ success: true });
          break;

        case 'updateJobApplication':
          await this.updateJobApplication(request.applicationId, request.updates);
          sendResponse({ success: true });
          break;

        case 'getJobApplications':
          const applications = await this.getJobApplications();
          sendResponse({ applications });
          break;

        case 'deleteJobApplication':
          await this.deleteJobApplication(request.applicationId);
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

  // Connection Analytics Methods
  async saveConnectionRequest(requestData) {
    console.log('[Background] Saving connection request:', requestData.fullName);
    const result = await chrome.storage.local.get(['connectionAnalytics']);
    const analytics = result.connectionAnalytics || { requests: [], stats: {} };

    const request = {
      id: Date.now().toString(),
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

    // Update stats
    analytics.stats.totalSent = (analytics.stats.totalSent || 0) + 1;
    analytics.stats.totalPending = (analytics.stats.totalPending || 0) + 1;

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

    const oldStatus = request.status;
    request.status = status;
    request.responseDate = new Date().toISOString();

    // Update stats
    if (oldStatus === 'pending') {
      analytics.stats.totalPending = Math.max(0, (analytics.stats.totalPending || 0) - 1);
    }

    if (status === 'accepted') {
      analytics.stats.totalAccepted = (analytics.stats.totalAccepted || 0) + 1;
    } else if (status === 'declined') {
      analytics.stats.totalDeclined = (analytics.stats.totalDeclined || 0) + 1;
    }

    // Recalculate acceptance rate (accepted / total sent)
    const totalSent = analytics.stats.totalSent || 0;
    if (totalSent > 0) {
      analytics.stats.acceptanceRate = analytics.stats.totalAccepted / totalSent;
    }

    // Calculate average response time
    const respondedRequests = analytics.requests.filter(r => r.responseDate);
    if (respondedRequests.length > 0) {
      const totalResponseTime = respondedRequests.reduce((sum, r) => {
        const sent = new Date(r.sentDate);
        const responded = new Date(r.responseDate);
        return sum + (responded - sent);
      }, 0);
      analytics.stats.avgResponseTime = totalResponseTime / respondedRequests.length;
    }

    await chrome.storage.local.set({ connectionAnalytics: analytics });
    console.log('[Background] Connection status updated. Acceptance rate:',
                Math.round(analytics.stats.acceptanceRate * 100) + '%');
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

    // Recalculate stats
    analytics.stats.totalPending = analytics.requests.filter(r => r.status === 'pending').length;
    analytics.stats.totalAccepted = 0;
    analytics.stats.totalDeclined = analytics.requests.filter(r => r.status === 'declined').length;
    analytics.stats.acceptanceRate = 0;

    // Recalculate average response time (only for declined ones now)
    const respondedRequests = analytics.requests.filter(r => r.responseDate);
    if (respondedRequests.length > 0) {
      const totalResponseTime = respondedRequests.reduce((sum, r) => {
        const sent = new Date(r.sentDate);
        const responded = new Date(r.responseDate);
        return sum + (responded - sent);
      }, 0);
      analytics.stats.avgResponseTime = totalResponseTime / respondedRequests.length;
    } else {
      analytics.stats.avgResponseTime = 0;
    }

    await chrome.storage.local.set({ connectionAnalytics: analytics });
    console.log('[Background] Reset complete:', resetCount, 'connections reset to pending');
  }

  // Job Application Methods
  async saveJobApplication(applicationData) {
    console.log('[Background] Saving job application:', applicationData.jobTitle);
    const result = await chrome.storage.local.get(['jobApplications']);
    const jobApps = result.jobApplications || { applications: [] };

    const application = {
      id: Date.now().toString(),
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