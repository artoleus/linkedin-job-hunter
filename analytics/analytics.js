// Connection Analytics Dashboard

class AnalyticsDashboard {
  constructor() {
    this.analytics = null;
    this.charts = {};
    this.filteredRequests = [];
    this.settings = {};
    this.pendingWelcome = null;

    this.init();
  }

  async init() {
    try {
      console.log('[Analytics] Loading analytics data...');
      await this.loadData();
      document.getElementById('welcomeDelayDays').value = WelcomeMessages.delayDays(this.settings);
      this.setupEventListeners();
      this.render();

      // Keep the page current while welcome messages are sent and
      // acceptances are found in LinkedIn tabs
      chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'local') return;
        if (changes.connectionAnalytics || changes.pendingWelcome || changes.settings) {
          await this.loadData();
          this.render();
          this.filterRequests();
        }
      });
    } catch (error) {
      console.error('[Analytics] Initialization error:', error);
    }
  }

  async loadData() {
    const result = await chrome.runtime.sendMessage({ action: 'getConnectionAnalytics' });
    this.analytics = result.analytics || { requests: [], stats: {} };
    this.filteredRequests = this.analytics.requests;

    const { settings } = await chrome.runtime.sendMessage({ action: 'getSettings' });
    this.settings = settings || {};
    const stored = await chrome.storage.local.get(['pendingWelcome']);
    this.pendingWelcome = stored.pendingWelcome || null;
    console.log('[Analytics] Loaded', this.analytics.requests.length, 'connection requests');
  }

  setupEventListeners() {
    // Search filter
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.filterRequests();
    });

    // Status filter
    document.getElementById('statusFilter').addEventListener('change', (e) => {
      this.filterRequests();
    });

    // Role filter
    document.getElementById('roleFilter').addEventListener('change', (e) => {
      this.filterRequests();
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportToCSV();
    });

    // Import button
    document.getElementById('importBtn').addEventListener('click', () => {
      this.importFromCSV().catch(error => {
        console.error('[Analytics] Import error:', error);
        alert('Import failed: ' + error.message);
      });
    });

    // Welcome message waiting time
    document.getElementById('welcomeDelayDays').addEventListener('change', (e) => this.saveWelcomeDelay(e.target.value));

    // Message test
    this.populateMessageTest();
    document.getElementById('saveTestBtn').addEventListener('click', () => this.saveMessageTest());
    for (const id of ['testA', 'testB']) {
      document.getElementById(id).addEventListener('input', () => {
        this.testEdited = true;
        this.updateCharCounts();
        document.getElementById('testStatus').textContent = 'Not saved yet';
        document.getElementById('testStatus').className = '';
      });
    }
    document.querySelectorAll('input[name="testMode"]').forEach(radio =>
      radio.addEventListener('change', () => { this.testEdited = true; }));

    // "Don't contact" on a row adds the person to the do-not-contact list
    document.getElementById('requestsTableBody').addEventListener('click', async (e) => {
      const button = e.target.closest('.block-btn');
      if (!button || button.disabled) return;
      const req = this.analytics.requests.find(r => r.id === button.dataset.requestId);
      if (!req) return;
      if (!confirm(`Never send ${req.fullName} a connection request or welcome message again?`)) return;
      button.disabled = true;
      await chrome.runtime.sendMessage({ action: 'addDoNotContact', entry: this.contactEntry(req) });
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      await this.loadData();
      this.render();
    });

    // Recalculate stats button
    document.getElementById('recalculateStatsBtn').addEventListener('click', async () => {
      const btn = document.getElementById('recalculateStatsBtn');
      btn.disabled = true;
      btn.textContent = 'Recalculating...';

      try {
        await chrome.runtime.sendMessage({ action: 'recalculateStats' });
        await this.loadData();
        this.render();
        alert('Statistics recalculated successfully!');
      } catch (error) {
        console.error('[Analytics] Error recalculating stats:', error);
        alert('Error: Could not recalculate stats. ' + error.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Recalculate Stats';
      }
    });

    // Reset accepted button
    document.getElementById('resetAcceptedBtn').addEventListener('click', async () => {
      if (!confirm('This will reset all accepted connections back to pending status. Are you sure?')) {
        return;
      }

      const btn = document.getElementById('resetAcceptedBtn');
      btn.disabled = true;
      btn.textContent = 'Resetting...';

      try {
        await chrome.runtime.sendMessage({ action: 'resetAcceptedToPending' });
        alert('All accepted connections have been reset to pending. Click "Refresh Data" to see the changes.');
        await this.loadData();
        this.render();
      } catch (error) {
        console.error('[Analytics] Error resetting accepted connections:', error);
        alert('Error: Could not reset connections. ' + error.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Reset Accepted to Pending';
      }
    });

    // Check connections button
    document.getElementById('checkConnectionsBtn').addEventListener('click', async () => {
      const btn = document.getElementById('checkConnectionsBtn');
      btn.disabled = true;
      btn.textContent = 'Checking...';

      try {
        // Look for any LinkedIn tab (not just active)
        const tabs = await chrome.tabs.query({ url: 'https://*.linkedin.com/*' });

        let linkedInTab = tabs.length > 0 ? tabs[0] : null;

        if (!linkedInTab) {
          // No LinkedIn tab found, create one
          console.log('[Analytics] No LinkedIn tab found, creating new tab...');
          linkedInTab = await chrome.tabs.create({
            url: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
            active: true
          });

          // Wait for tab to load
          await new Promise(resolve => setTimeout(resolve, 3000));

          alert('LinkedIn tab opened. Please wait for the page to load, then click "Check Accepted Connections" again.');
          btn.disabled = false;
          btn.textContent = 'Check Accepted Connections';
          return;
        }

        // LinkedIn tab exists, switch to it and send message
        console.log('[Analytics] Found LinkedIn tab:', linkedInTab.id);
        await chrome.tabs.update(linkedInTab.id, { active: true });

        // Send message to content script
        await chrome.tabs.sendMessage(linkedInTab.id, { action: 'checkAcceptedConnections' });

        alert('Navigating to check connections... This will check your sent invitations and update accepted connections. Please wait a moment, then refresh this page.');

      } catch (error) {
        console.error('[Analytics] Error checking connections:', error);
        alert('Error: Could not check connections. ' + error.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Check Accepted Connections';
      }
    });
  }

  render() {
    this.renderStats();
    this.renderWelcomeMessages();
    this.renderMessageTest();
    this.renderCharts();
    this.renderTable();
    this.populateRoleFilter();
  }

  // ---- Welcome messages ---------------------------------------------------------

  renderWelcomeMessages() {
    const list = document.getElementById('welcomeList');
    const now = new Date();
    const requests = this.analytics.requests;

    // Keep what's being typed across refreshes
    const typing = new Map(Array.from(list.querySelectorAll('textarea[data-request-id]'))
      .filter(box => box === document.activeElement || box.dataset.edited === 'true')
      .map(box => [box.dataset.requestId, box.value]));

    const candidates = requests.filter(req => WelcomeMessages.isCandidate(req, this.settings));
    const ready = candidates
      .filter(req => WelcomeMessages.isReady(req, this.settings, now) || req.welcomeStatus === 'sending' || req.welcomeStatus === 'failed')
      .sort((a, b) => WelcomeMessages.readyAt(a, this.settings) - WelcomeMessages.readyAt(b, this.settings));
    const upcoming = candidates.length - ready.length;
    const sent = requests.filter(req => req.welcomeStatus === 'sent').length;

    const hint = [];
    if (ready.length) hint.push(`${ready.length} ready to send. Check or edit each message, then send it; it's typed into LinkedIn for you in a new tab.`);
    else hint.push('No new connections waiting for a welcome message.');
    if (upcoming) hint.push(`${upcoming} more will be suggested once the waiting time passes.`);
    if (sent) hint.push(`${sent} sent so far.`);
    hint.push('Use "Check Accepted Connections" below to find new acceptances.');
    document.getElementById('welcomeHint').textContent = hint.join(' ');

    list.innerHTML = '';
    for (const req of ready) {
      list.appendChild(this.renderWelcomeItem(req, typing.get(req.id)));
    }
  }

  renderWelcomeItem(req, typedText) {
    const item = document.createElement('div');
    item.className = 'welcome-item';
    const sending = req.welcomeStatus === 'sending';

    const header = document.createElement('div');
    header.className = 'welcome-header';
    const name = document.createElement(req.profileUrl && /linkedin\.com\/in\//.test(req.profileUrl) ? 'a' : 'strong');
    name.textContent = req.fullName;
    if (name.tagName === 'A') {
      name.href = req.profileUrl;
      name.target = '_blank';
      name.rel = 'noopener';
    }
    const meta = document.createElement('span');
    meta.className = 'welcome-meta';
    const acceptedDays = Math.max(0, Math.floor((Date.now() - new Date(req.responseDate || req.sentDate)) / WelcomeMessages.DAY_MS));
    meta.textContent = ` · found via "${req.targetRole || 'Unknown'}" · accepted ${acceptedDays === 0 ? 'today' : acceptedDays + ' day' + (acceptedDays === 1 ? '' : 's') + ' ago'}`;
    header.append(name, meta);

    const box = document.createElement('textarea');
    box.rows = 3;
    box.dataset.requestId = req.id;
    box.value = typedText ?? WelcomeMessages.draft(req, this.settings);
    box.disabled = sending;
    box.addEventListener('input', () => { box.dataset.edited = 'true'; });
    box.addEventListener('change', () => this.updateRequest(req.id, { welcomeDraft: box.value.trim() }));

    const actions = document.createElement('div');
    actions.className = 'welcome-actions';
    const button = (text, cls, onClick) => {
      const btn = document.createElement('button');
      btn.className = cls;
      btn.textContent = text;
      btn.addEventListener('click', onClick);
      actions.appendChild(btn);
      return btn;
    };

    if (sending) {
      const status = document.createElement('span');
      status.className = 'welcome-status';
      status.textContent = '⏳ Sending in a LinkedIn tab…';
      actions.appendChild(status);
      button('Cancel', 'btn btn-secondary small', () => chrome.runtime.sendMessage({ action: 'cancelPendingWelcome' }));
    } else {
      button('Send via LinkedIn', 'btn btn-primary small', () => this.sendWelcome(req, box.value.trim()));
      button('New wording', 'btn btn-secondary small', () =>
        this.updateRequest(req.id, { welcomeDraft: null, welcomeVariant: (req.welcomeVariant || 0) + 1 }));
      button('Skip', 'btn btn-secondary small', () => this.updateRequest(req.id, { welcomeStatus: 'skipped' }));
      if (req.welcomeStatus === 'failed') {
        const error = document.createElement('span');
        error.className = 'welcome-error';
        error.textContent = `Not sent: ${req.welcomeError || 'unknown problem'}`;
        actions.appendChild(error);
        button('Mark as sent', 'btn btn-secondary small', () => this.updateRequest(req.id, { welcomeStatus: 'sent' }));
      }
    }

    item.append(header, box, actions);
    return item;
  }

  async updateRequest(requestId, updates) {
    await chrome.runtime.sendMessage({ action: 'updateConnectionRequest', requestId, updates });
  }

  async sendWelcome(req, message) {
    if (!message) {
      alert('The message is empty.');
      return;
    }
    const result = await chrome.runtime.sendMessage({ action: 'startWelcomeMessage', requestId: req.id, message });
    if (result?.error) alert('Could not start sending: ' + result.error);
  }

  async saveWelcomeDelay(value) {
    const days = Math.max(0, Math.min(14, parseInt(value, 10)));
    const delay = Number.isFinite(days) ? days : WelcomeMessages.DEFAULT_DELAY_DAYS;
    document.getElementById('welcomeDelayDays').value = delay;
    const { settings } = await chrome.runtime.sendMessage({ action: 'getSettings' });
    await chrome.runtime.sendMessage({ action: 'updateSettings', settings: { ...settings, welcomeDelayDays: delay } });
  }

  renderStats() {
    const stats = this.analytics.stats || {};

    document.getElementById('totalSent').textContent = stats.totalSent || 0;
    document.getElementById('totalAccepted').textContent = stats.totalAccepted || 0;
    document.getElementById('totalPending').textContent = stats.totalPending || 0;
    document.getElementById('totalDeclined').textContent = stats.totalDeclined || 0;
    document.getElementById('totalWithdrawn').textContent =
      stats.totalWithdrawn ?? this.analytics.requests.filter(r => r.status === 'withdrawn').length;

    const acceptanceRate = stats.acceptanceRate || 0;
    document.getElementById('acceptanceRate').textContent =
      Math.round(acceptanceRate * 100) + '%';

    const avgResponseTime = stats.avgResponseTime || 0;
    if (avgResponseTime > 0) {
      const days = Math.floor(avgResponseTime / (1000 * 60 * 60 * 24));
      const hours = Math.floor((avgResponseTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      document.getElementById('avgResponseTime').textContent =
        days > 0 ? `${days}d ${hours}h` : `${hours}h`;
    } else {
      document.getElementById('avgResponseTime').textContent = '--';
    }
  }

  renderCharts() {
    this.renderRoleChart();
    this.renderTimeChart();
    this.renderDayChart();
    this.renderStatusChart();
  }

  renderRoleChart() {
    const requests = this.analytics.requests;
    const roleStats = {};

    // Aggregate by role
    requests.forEach(req => {
      const role = req.targetRole || 'Unknown';
      if (!roleStats[role]) {
        roleStats[role] = { total: 0, accepted: 0, declined: 0, pending: 0 };
      }
      roleStats[role].total++;
      if (req.status === 'accepted') roleStats[role].accepted++;
      if (req.status === 'declined') roleStats[role].declined++;
      if (req.status === 'pending') roleStats[role].pending++;
    });

    const roles = Object.keys(roleStats);
    // Same definition as the headline stat: accepted / total sent
    const acceptanceRates = roles.map(role => {
      const total = roleStats[role].total;
      return total > 0 ? (roleStats[role].accepted / total * 100) : 0;
    });

    const ctx = document.getElementById('roleChart').getContext('2d');

    // Destroy existing chart if it exists
    if (this.charts.roleChart) {
      this.charts.roleChart.destroy();
    }

    this.charts.roleChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: roles,
        datasets: [{
          label: 'Acceptance Rate (%)',
          data: acceptanceRates,
          backgroundColor: '#0f766e',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const role = roles[context.dataIndex];
                const stats = roleStats[role];
                return [
                  `Acceptance Rate: ${Math.round(context.parsed.y)}%`,
                  `Accepted: ${stats.accepted}`,
                  `Declined: ${stats.declined}`,
                  `Pending: ${stats.pending}`
                ];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => value + '%'
            }
          }
        }
      }
    });
  }

  renderTimeChart() {
    const requests = this.analytics.requests;
    const timeStats = Array(24).fill(0);

    requests.forEach(req => {
      const hour = req.timeOfDay || 0;
      timeStats[hour]++;
    });

    const ctx = document.getElementById('timeChart').getContext('2d');

    if (this.charts.timeChart) {
      this.charts.timeChart.destroy();
    }

    this.charts.timeChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({length: 24}, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Requests Sent',
          data: timeStats,
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15, 118, 110, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }

  renderDayChart() {
    const requests = this.analytics.requests;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayStats = Array(7).fill(0);

    requests.forEach(req => {
      const day = req.dayOfWeek || 0;
      dayStats[day]++;
    });

    const ctx = document.getElementById('dayChart').getContext('2d');

    if (this.charts.dayChart) {
      this.charts.dayChart.destroy();
    }

    this.charts.dayChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dayNames,
        datasets: [{
          label: 'Requests Sent',
          data: dayStats,
          backgroundColor: '#00a000',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }

  renderStatusChart() {
    const stats = this.analytics.stats || {};
    const ctx = document.getElementById('statusChart').getContext('2d');

    if (this.charts.statusChart) {
      this.charts.statusChart.destroy();
    }

    this.charts.statusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Accepted', 'Pending', 'Declined', 'Withdrawn'],
        datasets: [{
          data: [
            stats.totalAccepted || 0,
            stats.totalPending || 0,
            stats.totalDeclined || 0,
            stats.totalWithdrawn || 0
          ],
          backgroundColor: [
            '#00a000',
            '#ff9800',
            '#d93025',
            '#9ca3af'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  renderTable() {
    const tbody = document.getElementById('requestsTableBody');

    if (this.filteredRequests.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="no-data">No requests found</td></tr>';
      return;
    }

    // Sort by sent date (newest first)
    const sorted = [...this.filteredRequests].sort((a, b) =>
      new Date(b.sentDate) - new Date(a.sentDate)
    );

    const doNotContact = this.settings.doNotContact || [];
    tbody.innerHTML = sorted.map(req => {
      const sentDate = new Date(req.sentDate);
      const blocked = Safety.blockedBy(doNotContact, { fullName: req.fullName, profileUrl: req.profileUrl });
      const responseTime = req.responseDate ?
        this.formatResponseTime(new Date(req.sentDate), new Date(req.responseDate)) :
        '--';

      return `
        <tr>
          <td><strong>${this.escapeHtml(req.fullName)}</strong></td>
          <td>${this.escapeHtml(req.targetRole)}</td>
          <td>${sentDate.toLocaleDateString()} ${sentDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
          <td><span class="status-badge status-${this.escapeHtml(req.status)}">${this.escapeHtml(this.capitalize(req.status))}</span></td>
          <td>${responseTime}</td>
          <td>${this.formatTimeOfDay(req.timeOfDay)}</td>
          <td>${this.escapeHtml(this.welcomeLabel(req))}</td>
          <td>${req.fullName && req.fullName !== 'Unknown'
            ? `<button class="block-btn" data-request-id="${this.escapeHtml(req.id)}" ${blocked ? 'disabled title="On your do-not-contact list"' : 'title="Never contact this person again"'}>${blocked ? '🚫 Not contacted' : '🚫 Don\'t contact'}</button>`
            : ''}</td>
        </tr>
      `;
    }).join('');
  }

  populateRoleFilter() {
    const roles = [...new Set(this.analytics.requests.map(r => r.targetRole))].filter(Boolean);
    const roleFilter = document.getElementById('roleFilter');
    const selected = roleFilter.value;

    roleFilter.innerHTML = '<option value="all">All Roles</option>' +
      roles.map(role => `<option value="${this.escapeHtml(role)}">${this.escapeHtml(role)}</option>`).join('');
    // Keep the chosen role when the page refreshes itself
    if (roles.includes(selected)) roleFilter.value = selected;
  }

  filterRequests() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const roleFilter = document.getElementById('roleFilter').value;

    this.filteredRequests = this.analytics.requests.filter(req => {
      const matchesSearch = !searchTerm ||
        (req.fullName || '').toLowerCase().includes(searchTerm) ||
        (req.targetRole || '').toLowerCase().includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
      const matchesRole = roleFilter === 'all' || req.targetRole === roleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });

    this.renderTable();
  }

  exportToCSV() {
    const headers = ['Name', 'Role', 'Sent Date', 'Status', 'Response Date', 'Response Time (hours)', 'Time of Day', 'Profile URL', 'Message',
                     'Welcome', 'Welcome Sent', 'Message Test'];
    const rows = this.filteredRequests.map(req => [
      req.fullName,
      req.targetRole,
      new Date(req.sentDate).toISOString(),
      req.status,
      req.responseDate ? new Date(req.responseDate).toISOString() : '',
      req.responseDate ? Math.round((new Date(req.responseDate) - new Date(req.sentDate)) / (1000 * 60 * 60)) : '',
      req.timeOfDay,
      req.profileUrl || '',
      req.messageTemplate || '',
      ['sent', 'skipped'].includes(req.welcomeStatus) ? req.welcomeStatus : '',
      req.welcomeSentAt || '',
      req.messageVariant || ''
    ]);

    CsvUtils.download(CsvUtils.toCsv([headers, ...rows]),
      `connection-analytics-${new Date().toISOString().split('T')[0]}.csv`);
  }

  // Import connection requests from a CSV exported by this page (older
  // exports without Profile URL/Message work too). Duplicates are skipped.
  async importFromCSV() {
    const file = await CsvUtils.pickFile();
    if (!file) return;

    const rows = CsvUtils.parseObjects(file.text);
    const requests = [];
    let invalid = 0;

    for (const row of rows) {
      const fullName = CsvUtils.column(row, 'name', 'full name');
      const sentDate = CsvUtils.parseDate(CsvUtils.column(row, 'sent date', 'date'));
      if (!fullName || !sentDate) {
        invalid++;
        continue;
      }

      const responseDate = CsvUtils.parseDate(CsvUtils.column(row, 'response date'));
      requests.push({
        fullName,
        targetRole: CsvUtils.column(row, 'role', 'target role'),
        sentDate: sentDate.toISOString(),
        status: CsvUtils.column(row, 'status').toLowerCase() || 'pending',
        responseDate: responseDate ? responseDate.toISOString() : null,
        profileUrl: CsvUtils.column(row, 'profile url'),
        messageTemplate: CsvUtils.column(row, 'message'),
        welcomeStatus: CsvUtils.column(row, 'welcome').toLowerCase(),
        welcomeSentAt: CsvUtils.column(row, 'welcome sent'),
        messageVariant: CsvUtils.column(row, 'message test').toUpperCase()
      });
    }

    if (requests.length === 0) {
      alert(`No connection requests found in "${file.name}". Please choose a CSV exported from this page.`);
      return;
    }

    if (!confirm(`Import ${requests.length} connection request(s) from "${file.name}"? Requests you already have will be skipped.`)) {
      return;
    }

    const result = await chrome.runtime.sendMessage({ action: 'importConnectionRequests', requests });
    if (!result || result.error) {
      alert('Import failed: ' + (result?.error || 'no response from the extension'));
      return;
    }

    await this.loadData();
    this.render();
    this.filterRequests();

    const notes = [
      result.skipped ? `${result.skipped} already existed` : '',
      invalid ? `${invalid} row(s) had no name or date` : ''
    ].filter(Boolean).join(', ');
    alert(`Imported ${result.added} connection request(s)` + (notes ? ` (${notes}).` : '.'));
  }

  // ---- Message test -------------------------------------------------------------

  // Suggestions to start from when no wordings are saved yet
  static SAMPLE_WORDINGS = {
    a: 'Hi {first}, I\'m exploring my next move in {field} and would value connecting with people in {role} roles. Would be great to connect.',
    b: 'Hi {first}, your work as {role} caught my eye. I\'m looking for new opportunities in {field} and would love to connect.'
  };

  populateMessageTest() {
    const test = Safety.messageTest(this.settings);
    document.getElementById('testA').value = test.a || AnalyticsDashboard.SAMPLE_WORDINGS.a;
    document.getElementById('testB').value = test.b || AnalyticsDashboard.SAMPLE_WORDINGS.b;
    const radio = document.querySelector(`input[name="testMode"][value="${test.mode}"]`);
    if (radio) radio.checked = true;
    this.testEdited = false;
    this.updateCharCounts();
    if (location.hash === '#messageTest') document.getElementById('messageTest').scrollIntoView();
  }

  updateCharCounts() {
    // Length with typical values filled in
    const sample = { firstName: 'Alexandra', role: 'Information Security Manager', industry: 'cyber security' };
    for (const [id, countId] of [['testA', 'testACount'], ['testB', 'testBCount']]) {
      const filled = Safety.fillMessage(document.getElementById(id).value, sample, 10000);
      const count = document.getElementById(countId);
      count.textContent = `About ${filled.length} characters once filled in` +
        (filled.length > 300 ? ' - too long, LinkedIn allows 300' : filled.length > 200 ? ' - may be cut on free accounts (200)' : '');
      count.className = 'char-count' + (filled.length > 300 ? ' over' : filled.length > 200 ? ' warn' : '');
    }
  }

  async saveMessageTest(modeOverride) {
    const status = document.getElementById('testStatus');
    const mode = modeOverride || document.querySelector('input[name="testMode"]:checked')?.value || 'off';
    const a = document.getElementById('testA').value.trim();
    const b = document.getElementById('testB').value.trim();

    const problem = (mode === 'test' && (!a || !b)) ? 'Write both wordings to run a test'
      : (mode === 'A' && !a) ? 'Wording A is empty'
      : (mode === 'B' && !b) ? 'Wording B is empty'
      : [a, b].some(t => t.length > 600) ? 'Keep each wording under 300 characters'
      : null;
    if (problem) {
      status.textContent = problem;
      status.className = 'error';
      return;
    }

    const { settings } = await chrome.runtime.sendMessage({ action: 'getSettings' });
    await chrome.runtime.sendMessage({ action: 'updateSettings', settings: { ...settings, messageTest: { mode, a, b } } });
    this.testEdited = false;
    status.textContent = mode === 'test' ? 'Saved ✓ The next invitations will use A or B at random.'
      : mode === 'off' ? 'Saved ✓ Invitations use the built-in wordings.'
      : `Saved ✓ Invitations will use wording ${mode}.`;
    status.className = 'saved';
    if (settings.usePersonalizedMessages === false && mode !== 'off') {
      status.textContent += ' Note: "Use Personalized Messages" is off in Settings, so no notes are sent.';
    }
  }

  renderMessageTest() {
    // Pick up changes saved elsewhere unless something is being edited here
    if (!this.testEdited) {
      const test = Safety.messageTest(this.settings);
      const radio = document.querySelector(`input[name="testMode"][value="${test.mode}"]`);
      if (radio) radio.checked = true;
    }

    const results = Safety.messageTestResults(this.analytics.requests);
    const table = document.getElementById('testResults');
    const hasData = results.A.sent + results.B.sent > 0;
    table.innerHTML = hasData ? `<tr><th>Wording</th><th>Sent</th><th>Accepted</th><th>Acceptance rate</th></tr>` +
      ['A', 'B'].map(v => `<tr class="${results.winner === v ? 'winner' : ''}"><td>${v}${results.winner === v ? ' 🏆' : ''}</td>` +
        `<td>${results[v].sent}</td><td>${results[v].accepted}</td><td>${Math.round(results[v].rate * 100)}%</td></tr>`).join('') : '';
    document.getElementById('testVerdict').textContent = hasData ? results.verdict : 'No invitations sent with a test wording yet.';

    const winnerBox = document.getElementById('testWinner');
    winnerBox.innerHTML = '';
    if (results.winner && Safety.messageTest(this.settings).mode === 'test') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary small';
      btn.textContent = `Use wording ${results.winner} from now on`;
      btn.addEventListener('click', async () => {
        document.querySelector(`input[name="testMode"][value="${results.winner}"]`).checked = true;
        await this.saveMessageTest(results.winner);
      });
      winnerBox.appendChild(btn);
    }
  }

  // What to add to the do-not-contact list for a person: their profile link
  // if known, otherwise their name
  contactEntry(req) {
    return Safety.profileSlug(req.profileUrl) ? req.profileUrl.split('?')[0] : req.fullName;
  }

  welcomeLabel(req) {
    switch (req.welcomeStatus) {
      case 'sent': return req.welcomeSentAt ? `Sent ${new Date(req.welcomeSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Sent';
      case 'skipped': return 'Skipped';
      case 'sending': return 'Sending…';
      case 'failed': return 'Not sent';
      default: return req.status === 'accepted' ? 'To do' : '';
    }
  }

  formatResponseTime(sentDate, responseDate) {
    const diffMs = responseDate - sentDate;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return '< 1h';
    }
  }

  formatTimeOfDay(hour) {
    if (hour === undefined || hour === null) return '--';
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${period}`;
  }

  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new AnalyticsDashboard();
});
