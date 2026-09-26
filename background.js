// Background service worker for JobTrail

importScripts('shared/terms.js');

// A welcome message still "sending" after this long has failed
const WELCOME_TIMEOUT_MS = 3 * 60 * 1000;

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
    chrome.runtime.onInstalled.addListener(async (details) => {
      console.log('[Background] Extension installed/updated:', details.reason);
      if (details.reason === 'install') {
        await this.setupDefaultSettings();
      }
      // First install, or updated terms: show the welcome page to accept them
      const settings = await this.getSettings();
      if (!Terms.isAccepted(settings)) {
        chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/welcome.html') });
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

        case 'updateConnectionRequest':
          await this.withLock(() => this.updateConnectionRequest(request.requestId, request.updates));
          sendResponse({ success: true });
          break;

        case 'startWelcomeMessage':
          await this.withLock(() => this.startWelcomeMessage(request.requestId, request.message, sender.tab?.id));
          sendResponse({ success: true });
          break;

        case 'getPendingWelcome':
          sendResponse({ task: await this.withLock(() => this.claimPendingWelcome(sender.tab?.id)) });
          break;

        case 'welcomeMessageResult':
          await this.withLock(() => this.finishWelcomeMessage(request.requestId, request));
          sendResponse({ success: true });
          break;

        case 'cancelPendingWelcome':
          await this.withLock(() => this.cancelPendingWelcome());
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

        case 'addApplicationEvent':
          sendResponse({
            application: await this.withLock(() => this.addApplicationEvent(request.applicationId, request.event))
          });
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

        case 'recordUnansweredQuestions':
          await this.withLock(() => this.recordUnansweredQuestions(request.questions, request.job));
          sendResponse({ success: true });
          break;

        case 'getUnansweredQuestions':
          sendResponse({ questions: await this.getUnansweredQuestions() });
          break;

        case 'removeUnansweredQuestions':
          await this.withLock(() => this.removeUnansweredQuestions(request.keys));
          sendResponse({ success: true });
          break;

        case 'addCustomAnswer':
          await this.withLock(() => this.addCustomAnswer(request.match, request.answer, request.key));
          sendResponse({ success: true });
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

  // Welcome-message fields the Connection Analytics page may change
  async updateConnectionRequest(requestId, updates = {}) {
    const result = await chrome.storage.local.get(['connectionAnalytics']);
    const analytics = result.connectionAnalytics || { requests: [], stats: {} };
    const request = analytics.requests.find(r => r.id === requestId);
    if (!request) return;

    if ('welcomeDraft' in updates) request.welcomeDraft = updates.welcomeDraft ? String(updates.welcomeDraft).slice(0, 2000) : null;
    if ('welcomeVariant' in updates) request.welcomeVariant = Number(updates.welcomeVariant) || 0;
    if ('welcomeStatus' in updates) {
      const status = updates.welcomeStatus;
      request.welcomeStatus = ['sent', 'skipped'].includes(status) ? status : null;
      request.welcomeError = null;
      if (status === 'sent') request.welcomeSentAt = new Date().toISOString();
    }
    await chrome.storage.local.set({ connectionAnalytics: analytics });
  }

  // Send a welcome message: open the person's profile (or search your
  // connections for them) in a new tab; the content script there picks up
  // the task, types the message and reports back
  async startWelcomeMessage(requestId, message, returnTabId) {
    if (!Terms.isAccepted(await this.getSettings())) {
      throw new Error('Please accept the Terms of Use first (open the extension popup)');
    }

    const { pendingWelcome } = await chrome.storage.local.get(['pendingWelcome']);
    if (pendingWelcome && Date.now() - pendingWelcome.startedAt < WELCOME_TIMEOUT_MS) {
      throw new Error('Another welcome message is still being sent - wait for it to finish');
    }

    const result = await chrome.storage.local.get(['connectionAnalytics']);
    const analytics = result.connectionAnalytics || { requests: [], stats: {} };
    const request = analytics.requests.find(r => r.id === requestId);
    if (!request) throw new Error('Connection not found');

    const text = String(message || '').trim().slice(0, 2000);
    if (!text) throw new Error('The message is empty');

    const profileUrl = /^https:\/\/([a-z]+\.)?linkedin\.com\/in\/[^/?#]+/.test(request.profileUrl || '') ? request.profileUrl : null;
    const url = profileUrl ||
      `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(request.fullName)}&network=%5B%22F%22%5D`;

    // Create the tab first so the task can be tied to it before LinkedIn loads
    const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    await chrome.storage.local.set({
      pendingWelcome: {
        requestId,
        fullName: request.fullName,
        message: text,
        stage: profileUrl ? 'profile' : 'search',
        tabId: tab.id,
        returnTabId: returnTabId || null,
        startedAt: Date.now(),
        claimed: false
      }
    });

    request.welcomeDraft = text;
    request.welcomeStatus = 'sending';
    request.welcomeError = null;
    await chrome.storage.local.set({ connectionAnalytics: analytics });

    await chrome.tabs.update(tab.id, { url });
  }

  // Hand the pending welcome message to the content script in its tab, once
  // (so a page reload mid-way can't send it twice)
  async claimPendingWelcome(tabId) {
    const { pendingWelcome } = await chrome.storage.local.get(['pendingWelcome']);
    if (!pendingWelcome || !tabId || pendingWelcome.tabId !== tabId) return null;

    if (Date.now() - pendingWelcome.startedAt > WELCOME_TIMEOUT_MS) {
      await this.finishWelcomeMessage(pendingWelcome.requestId, { success: false, error: 'Timed out before the message could be sent' });
      return null;
    }
    if (pendingWelcome.claimed) return null;

    await chrome.storage.local.set({ pendingWelcome: { ...pendingWelcome, claimed: true } });
    const { requestId, fullName, message, stage } = pendingWelcome;
    return { requestId, fullName, message, stage };
  }

  async finishWelcomeMessage(requestId, outcome = {}) {
    const stored = await chrome.storage.local.get(['connectionAnalytics', 'pendingWelcome']);
    const analytics = stored.connectionAnalytics || { requests: [], stats: {} };
    const pending = stored.pendingWelcome;
    const request = analytics.requests.find(r => r.id === requestId);

    if (request) {
      request.welcomeStatus = outcome.success ? 'sent' : 'failed';
      request.welcomeError = outcome.success ? null : String(outcome.error || 'Not sent').slice(0, 300);
      if (outcome.success) {
        request.welcomeSentAt = new Date().toISOString();
        request.welcomeMessage = outcome.message || request.welcomeDraft || null;
      }
      await chrome.storage.local.set({ connectionAnalytics: analytics });
    }

    if (pending && pending.requestId === requestId) {
      await chrome.storage.local.remove('pendingWelcome');
      // On success, tidy up: close the LinkedIn tab and return to the analytics page
      if (outcome.success && pending.tabId) {
        setTimeout(() => {
          chrome.tabs.remove(pending.tabId).catch(() => {});
          if (pending.returnTabId) chrome.tabs.update(pending.returnTabId, { active: true }).catch(() => {});
        }, 2500);
      }
    }
    console.log('[Background] Welcome message', outcome.success ? 'sent' : 'failed', outcome.error || '');
  }

  async cancelPendingWelcome() {
    const { pendingWelcome } = await chrome.storage.local.get(['pendingWelcome']);
    if (pendingWelcome) {
      await this.finishWelcomeMessage(pendingWelcome.requestId, { success: false, error: 'Cancelled' });
    }
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
        dayOfWeek: sent.getDay(),
        ...(['sent', 'skipped'].includes(item.welcomeStatus) ? {
          welcomeStatus: item.welcomeStatus,
          welcomeSentAt: item.welcomeSentAt && !isNaN(new Date(item.welcomeSentAt)) ? new Date(item.welcomeSentAt).toISOString() : null
        } : {})
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

  // Application questions the saved answers didn't cover, keyed by their
  // normalised text, shown on the Application Answers page to answer once
  async recordUnansweredQuestions(questions = [], job = {}) {
    const result = await chrome.storage.local.get(['unansweredQuestions']);
    const waiting = result.unansweredQuestions || {};
    const now = new Date().toISOString();

    for (const q of questions) {
      if (!q || !q.key || !q.question) continue;
      const existing = waiting[q.key];
      waiting[q.key] = {
        key: q.key,
        question: String(q.question).slice(0, 500),
        type: q.type || 'text',
        options: [...new Set([...(existing?.options || []), ...(q.options || [])])].slice(0, 40),
        count: (existing?.count || 0) + 1,
        firstSeen: existing?.firstSeen || now,
        lastSeen: now,
        lastJob: [job.jobTitle, job.company].filter(Boolean).join(' at ')
      };
    }

    // Keep the most recent 200
    const entries = Object.values(waiting).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, 200);
    await chrome.storage.local.set({ unansweredQuestions: Object.fromEntries(entries.map(e => [e.key, e])) });
  }

  async getUnansweredQuestions() {
    const result = await chrome.storage.local.get(['unansweredQuestions']);
    return Object.values(result.unansweredQuestions || {})
      .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen));
  }

  async removeUnansweredQuestions(keys = []) {
    const result = await chrome.storage.local.get(['unansweredQuestions']);
    const waiting = result.unansweredQuestions || {};
    keys.forEach(key => delete waiting[key]);
    await chrome.storage.local.set({ unansweredQuestions: waiting });
  }

  // Save an answer to one question (from the Application Answers page)
  async addCustomAnswer(match, answer, key) {
    const settings = await this.getSettings();
    const bank = settings.answerBank || {};
    const customAnswers = (bank.customAnswers || []).filter(rule => rule.match !== match);
    customAnswers.push({ match, answer });
    await chrome.storage.local.set({ settings: { ...settings, answerBank: { ...bank, customAnswers } } });
    if (key) await this.removeUnansweredQuestions([key]);
  }

  // Job Application Methods
  async saveJobApplication(applicationData) {
    console.log('[Background] Saving job application:', applicationData.jobTitle);
    const result = await chrome.storage.local.get(['jobApplications']);
    const jobApps = result.jobApplications || { applications: [] };

    // Applications added by hand can have an earlier applied date
    const givenDate = applicationData.appliedDate ? new Date(applicationData.appliedDate) : null;

    const application = {
      id: this.generateId(),
      jobId: applicationData.jobId,
      jobTitle: applicationData.jobTitle,
      company: applicationData.company,
      location: applicationData.location,
      salary: applicationData.salary,
      workType: applicationData.workType,
      distance: applicationData.distance,
      appliedDate: givenDate && !isNaN(givenDate) ? givenDate.toISOString() : new Date().toISOString(),
      status: applicationData.status || 'applied',
      requiresCoverLetter: applicationData.requiresCoverLetter || false,
      notes: applicationData.notes || '',
      jobUrl: applicationData.jobUrl,
      matchedRole: applicationData.matchedRole || null,
      source: applicationData.source || 'auto-apply',
      history: [],
      followUpDate: null
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
        jobUrl: item.jobUrl || '',
        matchedRole: item.matchedRole || null,
        source: item.source || 'import',
        history: this.sanitizeHistory(item.history),
        followUpDate: /^\d{4}-\d{2}-\d{2}$/.test(item.followUpDate || '') ? item.followUpDate : null
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

  // Record something that happened to an application: a status change, a
  // note, or a follow-up. Returns the updated application.
  async addApplicationEvent(applicationId, event = {}) {
    const result = await chrome.storage.local.get(['jobApplications']);
    const jobApps = result.jobApplications || { applications: [] };
    const app = jobApps.applications.find(a => a.id === applicationId);
    if (!app) return null;

    const entry = { date: new Date().toISOString(), type: event.type };

    if (event.type === 'status') {
      const status = String(event.status || '').trim().toLowerCase();
      if (!status || status === app.status) return app;
      entry.status = status;
      entry.from = app.status;
      app.status = status;
      // A closed application needs no reminder
      if (status === 'rejected' || status === 'withdrawn') app.followUpDate = null;
    } else if (event.type === 'note') {
      const note = String(event.note || '').trim().slice(0, 2000);
      if (!note) return app;
      entry.note = note;
    } else if (event.type === 'followup') {
      entry.note = String(event.note || 'Followed up').slice(0, 2000);
      app.followUpDate = null;
    } else {
      return app;
    }

    app.history = [...(app.history || []), entry];
    await chrome.storage.local.set({ jobApplications: jobApps });
    return app;
  }

  // Keep only well-formed timeline entries (e.g. from an imported CSV)
  sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .filter(e => e && ['status', 'note', 'followup'].includes(e.type) && !isNaN(new Date(e.date)))
      .map(e => ({
        date: new Date(e.date).toISOString(),
        type: e.type,
        ...(e.status ? { status: String(e.status).toLowerCase() } : {}),
        ...(e.from ? { from: String(e.from).toLowerCase() } : {}),
        ...(e.note ? { note: String(e.note).slice(0, 2000) } : {})
      }))
      .slice(0, 200);
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