// Job Applications Tracker Dashboard

class ApplicationsTracker {
  constructor() {
    this.applications = [];
    this.filteredApplications = [];
    this.settings = {};
    this.expanded = new Set();  // application ids with their timeline open

    this.init();
  }

  async init() {
    try {
      console.log('[Applications] Loading applications data...');
      const { settings } = await chrome.runtime.sendMessage({ action: 'getSettings' });
      this.settings = settings || {};
      document.getElementById('followUpDays').value = Pipeline.followUpDays(this.settings);
      this.populateStatusSelect(document.getElementById('addStatus'), 'applied');

      await this.loadData();
      this.setupEventListeners();
      this.render();

      // Show new applications (e.g. from a running Auto Apply) as they arrive
      chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'local') return;
        if (changes.settings) this.settings = changes.settings.newValue || {};
        if (changes.jobApplications || changes.settings) {
          await this.loadData();
          this.render();
        }
      });
    } catch (error) {
      console.error('[Applications] Initialization error:', error);
    }
  }

  async loadData() {
    const result = await chrome.runtime.sendMessage({ action: 'getJobApplications' });
    // Result contains a jobApplications object with applications array
    const jobApps = result.applications || result;
    this.applications = jobApps.applications || [];
    console.log('[Applications] Loaded', this.applications.length, 'applications');
  }

  setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', () => this.renderTable());
    document.getElementById('statusFilter').addEventListener('change', () => this.renderTable());
    document.getElementById('workTypeFilter').addEventListener('change', () => this.renderTable());

    document.getElementById('exportBtn').addEventListener('click', () => this.exportToCSV());

    document.getElementById('importBtn').addEventListener('click', () => {
      this.importFromCSV().catch(error => {
        console.error('[Applications] Import error:', error);
        alert('Import failed: ' + error.message);
      });
    });

    document.getElementById('refreshBtn').addEventListener('click', async () => {
      await this.loadData();
      this.render();
    });

    // Follow-up interval
    document.getElementById('followUpDays').addEventListener('change', (e) => this.saveFollowUpDays(e.target.value));

    // Add an application by hand
    document.getElementById('addBtn').addEventListener('click', () => this.toggleAddPanel(true));
    document.getElementById('cancelAddBtn').addEventListener('click', () => this.toggleAddPanel(false));
    document.getElementById('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addApplication();
    });

    // Table actions (event delegation)
    const tbody = document.getElementById('applicationsTableBody');
    tbody.addEventListener('click', async (e) => {
      const button = e.target.closest('button');
      if (!button) return;
      const appId = button.dataset.appId;
      if (button.classList.contains('delete-btn')) {
        await this.deleteApplication(appId);
      } else if (button.classList.contains('details-btn')) {
        this.expanded.has(appId) ? this.expanded.delete(appId) : this.expanded.add(appId);
        this.renderTable();
      } else if (button.classList.contains('add-note-btn')) {
        const box = tbody.querySelector(`textarea[data-app-id="${CSS.escape(appId)}"]`);
        if (box && box.value.trim()) {
          await this.addEvent(appId, { type: 'note', note: box.value.trim() });
        }
      } else if (button.classList.contains('clear-reminder-btn')) {
        await this.setFollowUpDate(appId, null);
      }
    });
    tbody.addEventListener('change', async (e) => {
      const appId = e.target.dataset.appId;
      if (e.target.classList.contains('status-select')) {
        await this.addEvent(appId, { type: 'status', status: e.target.value });
      } else if (e.target.classList.contains('reminder-input')) {
        await this.setFollowUpDate(appId, e.target.value || null);
      }
    });

    // Follow-up list actions
    document.getElementById('followUpsList').addEventListener('click', async (e) => {
      const button = e.target.closest('button');
      if (!button) return;
      const appId = button.dataset.appId;
      if (button.dataset.action === 'followed-up') {
        await this.addEvent(appId, { type: 'followup', note: 'Followed up' });
      } else if (button.dataset.action === 'snooze') {
        await this.setFollowUpDate(appId, Pipeline.toDateKey(Pipeline.addDays(new Date(), 3)));
      } else if (button.dataset.action === 'show') {
        this.expanded.add(appId);
        document.getElementById('statusFilter').value = 'all';
        document.getElementById('searchInput').value = '';
        this.renderTable();
        document.querySelector(`tr[data-app-id="${CSS.escape(appId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // ---- Changes -----------------------------------------------------------------

  async addEvent(applicationId, event) {
    await chrome.runtime.sendMessage({ action: 'addApplicationEvent', applicationId, event });
    await this.loadData();
    this.render();
  }

  async setFollowUpDate(applicationId, followUpDate) {
    await chrome.runtime.sendMessage({ action: 'updateJobApplication', applicationId, updates: { followUpDate } });
    await this.loadData();
    this.render();
  }

  async saveFollowUpDays(value) {
    const days = Math.max(1, Math.min(60, parseInt(value, 10) || Pipeline.DEFAULT_FOLLOW_UP_DAYS));
    document.getElementById('followUpDays').value = days;
    // Merge onto the latest settings so nothing saved elsewhere is overwritten
    const { settings } = await chrome.runtime.sendMessage({ action: 'getSettings' });
    this.settings = { ...settings, followUpDays: days };
    await chrome.runtime.sendMessage({ action: 'updateSettings', settings: this.settings });
    this.render();
  }

  toggleAddPanel(show) {
    document.getElementById('addPanel').classList.toggle('hidden', !show);
    if (show) {
      document.getElementById('addForm').reset();
      document.getElementById('addDate').value = Pipeline.toDateKey(new Date());
      document.getElementById('addStatus').value = 'applied';
      document.getElementById('addTitle').focus();
    }
  }

  async addApplication() {
    const value = (id) => document.getElementById(id).value.trim();
    const jobTitle = value('addTitle');
    if (!jobTitle) return;

    const date = value('addDate');
    await chrome.runtime.sendMessage({
      action: 'saveJobApplication',
      applicationData: {
        jobTitle,
        company: value('addCompany'),
        location: value('addLocation'),
        workType: value('addWorkType') || null,
        jobUrl: value('addUrl'),
        jobId: value('addUrl') || null,
        status: value('addStatus') || 'applied',
        // Midday local time, so the date doesn't shift across time zones
        appliedDate: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
        matchedRole: TextUtils.matchTargetRole(jobTitle, this.targetRoles()),
        source: 'manual'
      }
    });

    this.toggleAddPanel(false);
    await this.loadData();
    this.render();
  }

  async deleteApplication(appId) {
    if (!confirm('Are you sure you want to delete this application? This cannot be undone.')) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({ action: 'deleteJobApplication', applicationId: appId });
      this.expanded.delete(appId);
      await this.loadData();
      this.render();
    } catch (error) {
      console.error('[Applications] Error deleting application:', error);
      alert('Failed to delete application. Please try again.');
    }
  }

  // ---- Rendering ---------------------------------------------------------------

  render() {
    this.renderStats();
    this.renderFollowUps();
    this.renderTable();
    this.renderInsights();
  }

  followUpDays() {
    return Pipeline.followUpDays(this.settings);
  }

  targetRoles() {
    return this.settings.targetJobRoles || this.settings.targetRoles || [];
  }

  dueFollowUps() {
    return this.applications
      .filter(app => Pipeline.followUpDue(app, this.followUpDays()))
      .sort((a, b) => Pipeline.lastActivity(a) - Pipeline.lastActivity(b));
  }

  renderStats() {
    const count = (status) => this.applications.filter(app => Pipeline.normalizeStatus(app.status) === status).length;
    document.getElementById('totalApplications').textContent = this.applications.length;
    document.getElementById('awaitingApplications').textContent = count('applied');
    document.getElementById('interviewingApplications').textContent = count('interviewing');
    document.getElementById('offerApplications').textContent = count('offer');
    document.getElementById('draftApplications').textContent = count('draft');
    document.getElementById('followUpsDue').textContent = this.dueFollowUps().length;
  }

  renderFollowUps() {
    const list = document.getElementById('followUpsList');
    const due = this.dueFollowUps();
    list.innerHTML = '';

    if (due.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = this.applications.length
        ? 'Nothing to follow up on today.'
        : 'Applications you are waiting to hear back on will appear here when it is time to follow up.';
      list.appendChild(empty);
      return;
    }

    for (const app of due) {
      const row = document.createElement('div');
      row.className = 'follow-up-item';

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = app.jobTitle;
      const company = document.createTextNode(app.company ? ` at ${app.company}` : '');
      const reason = document.createElement('div');
      reason.className = 'meta';
      reason.textContent = Pipeline.followUpReason(app);
      info.append(title, company, reason);

      const actions = document.createElement('div');
      actions.className = 'follow-up-actions';
      const url = this.safeUrl(app.jobUrl);
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'action-link';
        link.textContent = 'View job';
        actions.appendChild(link);
      }
      for (const [action, text, cls] of [
        ['followed-up', '✓ Followed up', 'btn btn-primary small'],
        ['snooze', 'Snooze 3 days', 'btn btn-secondary small'],
        ['show', 'Timeline', 'btn btn-secondary small']
      ]) {
        const button = document.createElement('button');
        button.className = cls;
        button.dataset.action = action;
        button.dataset.appId = app.id;
        button.textContent = text;
        actions.appendChild(button);
      }

      row.append(info, actions);
      list.appendChild(row);
    }
  }

  applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const workTypeFilter = document.getElementById('workTypeFilter').value;

    return this.applications.filter(app => {
      const matchesSearch = !searchTerm ||
        (app.jobTitle || '').toLowerCase().includes(searchTerm) ||
        (app.company || '').toLowerCase().includes(searchTerm);

      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'followup' ? Pipeline.followUpDue(app, this.followUpDays())
                                     : Pipeline.normalizeStatus(app.status) === statusFilter);
      const matchesWorkType = workTypeFilter === 'all' || app.workType === workTypeFilter;

      return matchesSearch && matchesStatus && matchesWorkType;
    });
  }

  renderTable() {
    const tbody = document.getElementById('applicationsTableBody');
    this.filteredApplications = this.applyFilters();

    // Keep half-typed notes across re-renders (e.g. when Auto Apply adds an application)
    const noteDrafts = new Map(Array.from(tbody.querySelectorAll('textarea[data-app-id]'))
      .filter(box => box.value)
      .map(box => [box.dataset.appId, box.value]));

    if (this.filteredApplications.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="no-data">No applications found</td></tr>';
      return;
    }

    // Sort by applied date (newest first)
    const sorted = [...this.filteredApplications].sort((a, b) =>
      new Date(b.appliedDate) - new Date(a.appliedDate)
    );

    tbody.innerHTML = sorted.map(app => {
      const appliedDate = new Date(app.appliedDate);
      const status = Pipeline.normalizeStatus(app.status);
      const jobUrl = this.escapeHtml(this.safeUrl(app.jobUrl));
      const id = this.escapeHtml(app.id);
      const due = Pipeline.followUpDue(app, this.followUpDays());
      const isOpen = this.expanded.has(app.id);

      return `
        <tr data-app-id="${id}" class="${due ? 'follow-up-due' : ''}">
          <td><strong>${this.escapeHtml(app.jobTitle)}</strong>${due ? ' <span class="due-dot" title="Follow-up due">🔔</span>' : ''}</td>
          <td>${this.escapeHtml(app.company)}</td>
          <td>${this.getWorkTypeBadge(app.workType)}</td>
          <td>${this.escapeHtml(this.formatSalary(app.salary))}</td>
          <td>${this.escapeHtml(app.location)}</td>
          <td class="nowrap" title="${this.escapeHtml(appliedDate.toLocaleString('en-GB'))}">${this.escapeHtml(Pipeline.formatShortDate(appliedDate))}</td>
          <td class="nowrap">${this.escapeHtml(Pipeline.formatAgo(Pipeline.lastActivity(app)))}</td>
          <td>${this.statusSelectHtml(app.id, status)}</td>
          <td class="actions-cell">
            <button class="details-btn" data-app-id="${id}" title="Timeline, notes and follow-up reminder">${isOpen ? '▾' : '▸'} Timeline</button>
            ${jobUrl ? `<a href="${jobUrl}" target="_blank" rel="noopener" class="action-link">${status === 'draft' ? 'Complete' : 'View Job'}</a>` : ''}
            <button class="delete-btn" data-app-id="${id}" title="Delete application">Delete</button>
          </td>
        </tr>
        ${isOpen ? `<tr class="details-row"><td colspan="9"></td></tr>` : ''}
      `;
    }).join('');

    // Timelines are built with DOM APIs (notes are free text)
    for (const app of sorted) {
      if (!this.expanded.has(app.id)) continue;
      const cell = tbody.querySelector(`tr[data-app-id="${CSS.escape(app.id)}"] + tr.details-row td`);
      if (!cell) continue;
      cell.appendChild(this.renderDetails(app));
      if (noteDrafts.has(app.id)) cell.querySelector('textarea').value = noteDrafts.get(app.id);
    }
  }

  statusSelectHtml(appId, status) {
    const known = Pipeline.STATUSES.some(s => s.value === status);
    const options = [...Pipeline.STATUSES, ...(known ? [] : [{ value: status, label: Pipeline.label(status) }])]
      .map(s => `<option value="${this.escapeHtml(s.value)}" ${s.value === status ? 'selected' : ''}>${this.escapeHtml(s.label)}</option>`)
      .join('');
    return `<select class="status-select status-${this.escapeHtml(status)}" data-app-id="${this.escapeHtml(appId)}" aria-label="Status">${options}</select>`;
  }

  populateStatusSelect(select, selected) {
    select.innerHTML = '';
    Pipeline.STATUSES.forEach(s => select.appendChild(new Option(s.label, s.value, false, s.value === selected)));
  }

  // Timeline, note box and follow-up reminder for one application
  renderDetails(app) {
    const wrapper = document.createElement('div');
    wrapper.className = 'details';

    const timeline = document.createElement('ul');
    timeline.className = 'timeline';
    // How it started: the status before the first recorded change, if any
    const firstChange = (app.history || []).find(event => event.type === 'status');
    const initialStatus = Pipeline.normalizeStatus(firstChange ? firstChange.from : app.status);
    const firstEntry = app.source === 'manual' ? `Added (${Pipeline.label(initialStatus)})`
      : initialStatus === 'draft' ? 'Saved as draft (needs completion)'
      : 'Applied';

    const entries = [
      { date: app.appliedDate, text: firstEntry },
      ...(app.history || []).map(event => ({
        date: event.date,
        text: event.type === 'status' ? `Status: ${Pipeline.label(event.status)}`
            : event.type === 'followup' ? `Followed up${event.note && event.note !== 'Followed up' ? ': ' + event.note : ''}`
            : event.note
      }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const entry of entries) {
      const item = document.createElement('li');
      const date = document.createElement('span');
      date.className = 'timeline-date';
      date.textContent = Pipeline.formatDate(entry.date);
      const text = document.createElement('span');
      text.textContent = entry.text;
      item.append(date, text);
      timeline.appendChild(item);
    }

    const side = document.createElement('div');
    side.className = 'details-side';

    if (app.notes) {
      const autoNote = document.createElement('p');
      autoNote.className = 'auto-note';
      autoNote.textContent = `Auto Apply: ${app.notes}`;
      side.appendChild(autoNote);
    }

    const noteBox = document.createElement('textarea');
    noteBox.rows = 2;
    noteBox.placeholder = 'Add a note (e.g. phone screen with Sarah, next round Tuesday)';
    noteBox.dataset.appId = app.id;
    const noteBtn = document.createElement('button');
    noteBtn.className = 'btn btn-secondary small add-note-btn';
    noteBtn.dataset.appId = app.id;
    noteBtn.textContent = 'Add note';

    const reminder = document.createElement('label');
    reminder.className = 'reminder';
    reminder.append('Remind me to follow up on ');
    const reminderInput = document.createElement('input');
    reminderInput.type = 'date';
    reminderInput.className = 'reminder-input';
    reminderInput.dataset.appId = app.id;
    reminderInput.value = app.followUpDate || '';
    reminder.appendChild(reminderInput);
    if (app.followUpDate) {
      const clear = document.createElement('button');
      clear.className = 'link-btn clear-reminder-btn';
      clear.dataset.appId = app.id;
      clear.textContent = 'clear';
      reminder.appendChild(clear);
    }

    side.append(noteBox, noteBtn, reminder);
    wrapper.append(timeline, side);
    return wrapper;
  }

  renderInsights() {
    const submitted = this.applications.filter(app => Pipeline.normalizeStatus(app.status) !== 'draft');
    const panel = document.getElementById('insightsPanel');
    panel.classList.toggle('hidden', submitted.length === 0);
    if (submitted.length === 0) return;

    const interviews = submitted.filter(app => Pipeline.reachedInterview(app)).length;
    document.getElementById('insightsHint').textContent =
      `From ${submitted.length} submitted application${submitted.length === 1 ? '' : 's'}: ` +
      `${interviews} reached interview. Update each application's status as you hear back to keep this accurate.` +
      (submitted.length < 20 ? ' (Small numbers, so treat the rates as a rough guide.)' : '');

    const roleOf = (app) => app.matchedRole || TextUtils.matchTargetRole(app.jobTitle, this.targetRoles()) || 'Other';
    const workTypeOf = (app) => app.workType ? this.capitalize(app.workType === 'onsite' ? 'on-site' : app.workType) : 'Unknown';
    this.renderInsightTable('roleInsights', Pipeline.outcomeStats(this.applications, roleOf), 'Role');
    this.renderInsightTable('workTypeInsights', Pipeline.outcomeStats(this.applications, workTypeOf), 'Work type');
  }

  renderInsightTable(tableId, rows, heading) {
    const table = document.getElementById(tableId);
    const percent = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '--');
    table.innerHTML = `
      <thead><tr><th>${heading}</th><th>Applied</th><th>Heard back</th><th>Interviews</th><th>Offers</th><th>Interview rate</th></tr></thead>
      <tbody>${rows.map(row => `
        <tr>
          <td>${this.escapeHtml(row.key)}</td>
          <td>${row.applied}</td>
          <td>${row.heardBack}</td>
          <td>${row.interviews}</td>
          <td>${row.offers}</td>
          <td><span class="rate-bar" style="--rate:${row.applied ? Math.round((row.interviews / row.applied) * 100) : 0}%"></span>${percent(row.interviews, row.applied)}</td>
        </tr>`).join('')}
      </tbody>`;
  }

  // ---- CSV ---------------------------------------------------------------------

  exportToCSV() {
    const headers = ['Job Title', 'Company', 'Work Type', 'Salary', 'Location', 'Applied Date', 'Status', 'Job URL', 'Notes',
                     'Matched Role', 'Follow Up Date', 'History'];
    const rows = this.filteredApplications.map(app => [
      app.jobTitle,
      app.company,
      app.workType,
      app.salary || '',
      app.location,
      new Date(app.appliedDate).toISOString(),
      app.status,
      app.jobUrl,
      app.notes || '',
      app.matchedRole || '',
      app.followUpDate || '',
      app.history && app.history.length ? JSON.stringify(app.history) : ''
    ]);

    CsvUtils.download(CsvUtils.toCsv([headers, ...rows]),
      `job-applications-${new Date().toISOString().split('T')[0]}.csv`);
  }

  // Import applications from a CSV exported by this page (older exports
  // without the newer columns work too). Duplicates are skipped.
  async importFromCSV() {
    const file = await CsvUtils.pickFile();
    if (!file) return;

    const rows = CsvUtils.parseObjects(file.text);
    const applications = [];
    let invalid = 0;

    for (const row of rows) {
      const jobTitle = CsvUtils.column(row, 'job title', 'title');
      const appliedDate = CsvUtils.parseDate(CsvUtils.column(row, 'applied date', 'date'));
      if (!jobTitle || !appliedDate) {
        invalid++;
        continue;
      }

      let history = [];
      try {
        const parsed = JSON.parse(CsvUtils.column(row, 'history') || '[]');
        if (Array.isArray(parsed)) history = parsed;
      } catch {
        // Unreadable history: import the application without it
      }

      applications.push({
        jobTitle,
        company: CsvUtils.column(row, 'company'),
        workType: CsvUtils.column(row, 'work type').toLowerCase().replace('on-site', 'onsite') || null,
        salary: CsvUtils.column(row, 'salary'),
        location: CsvUtils.column(row, 'location'),
        appliedDate: appliedDate.toISOString(),
        status: Pipeline.normalizeStatus(CsvUtils.column(row, 'status')),
        jobUrl: CsvUtils.column(row, 'job url', 'url'),
        notes: CsvUtils.column(row, 'notes'),
        matchedRole: CsvUtils.column(row, 'matched role'),
        followUpDate: CsvUtils.column(row, 'follow up date'),
        history
      });
    }

    if (applications.length === 0) {
      alert(`No applications found in "${file.name}". Please choose a CSV exported from this page.`);
      return;
    }

    if (!confirm(`Import ${applications.length} application(s) from "${file.name}"? Applications you already have will be skipped.`)) {
      return;
    }

    const result = await chrome.runtime.sendMessage({ action: 'importJobApplications', applications });
    if (!result || result.error) {
      alert('Import failed: ' + (result?.error || 'no response from the extension'));
      return;
    }

    await this.loadData();
    this.render();

    const notes = [
      result.skipped ? `${result.skipped} already existed` : '',
      invalid ? `${invalid} row(s) had no title or date` : ''
    ].filter(Boolean).join(', ');
    alert(`Imported ${result.added} application(s)` + (notes ? ` (${notes}).` : '.'));
  }

  // ---- Formatting ----------------------------------------------------------------

  getWorkTypeBadge(workType) {
    if (!workType) return '<span class="work-type-badge">Unknown</span>';

    const badgeClass = `work-type-${this.escapeHtml(workType.toLowerCase())}`;
    return `<span class="work-type-badge ${badgeClass}">${this.escapeHtml(this.capitalize(workType))}</span>`;
  }

  formatSalary(salary) {
    if (!salary) return '--';

    // Format salary range if present
    if (typeof salary === 'object' && salary.min && salary.max) {
      return `£${this.formatNumber(salary.min)} - £${this.formatNumber(salary.max)}`;
    }

    if (typeof salary === 'string') return salary;

    return `£${this.formatNumber(salary)}`;
  }

  formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

  // Only allow http(s) links (blocks javascript: and similar URLs)
  safeUrl(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ApplicationsTracker();
});
