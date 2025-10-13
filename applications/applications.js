// Job Applications Tracker Dashboard

class ApplicationsTracker {
  constructor() {
    this.applications = [];
    this.filteredApplications = [];

    this.init();
  }

  async init() {
    try {
      console.log('[Applications] Loading applications data...');
      await this.loadData();
      this.setupEventListeners();
      this.render();
    } catch (error) {
      console.error('[Applications] Initialization error:', error);
    }
  }

  async loadData() {
    const result = await chrome.runtime.sendMessage({ action: 'getJobApplications' });
    this.applications = result.applications || [];
    this.filteredApplications = this.applications;
    console.log('[Applications] Loaded', this.applications.length, 'applications');
  }

  setupEventListeners() {
    // Search filter
    document.getElementById('searchInput').addEventListener('input', () => {
      this.filterApplications();
    });

    // Status filter
    document.getElementById('statusFilter').addEventListener('change', () => {
      this.filterApplications();
    });

    // Work type filter
    document.getElementById('workTypeFilter').addEventListener('change', () => {
      this.filterApplications();
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportToCSV();
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      await this.loadData();
      this.render();
    });
  }

  render() {
    this.renderStats();
    this.renderTable();
  }

  renderStats() {
    const total = this.applications.length;
    const submitted = this.applications.filter(app => app.status === 'submitted').length;
    const draft = this.applications.filter(app => app.status === 'draft').length;
    const failed = this.applications.filter(app => app.status === 'failed').length;

    document.getElementById('totalApplications').textContent = total;
    document.getElementById('submittedApplications').textContent = submitted;
    document.getElementById('draftApplications').textContent = draft;
    document.getElementById('failedApplications').textContent = failed;
  }

  renderTable() {
    const tbody = document.getElementById('applicationsTableBody');

    if (this.filteredApplications.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="no-data">No applications found</td></tr>';
      return;
    }

    // Sort by applied date (newest first)
    const sorted = [...this.filteredApplications].sort((a, b) =>
      new Date(b.appliedDate) - new Date(a.appliedDate)
    );

    tbody.innerHTML = sorted.map(app => {
      const appliedDate = new Date(app.appliedDate);
      const workTypeBadge = this.getWorkTypeBadge(app.workType);
      const statusBadge = this.getStatusBadge(app.status);

      return `
        <tr>
          <td><strong>${this.escapeHtml(app.jobTitle)}</strong></td>
          <td>${this.escapeHtml(app.company)}</td>
          <td>${workTypeBadge}</td>
          <td>${this.formatSalary(app.salary)}</td>
          <td>${this.escapeHtml(app.location)}</td>
          <td>${appliedDate.toLocaleDateString()} ${appliedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
          <td>${statusBadge}</td>
          <td>
            <a href="${app.jobUrl}" target="_blank" class="action-link">View Job</a>
            ${app.status === 'draft' ? `<a href="${app.jobUrl}" target="_blank" class="action-link">Complete</a>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  filterApplications() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const workTypeFilter = document.getElementById('workTypeFilter').value;

    this.filteredApplications = this.applications.filter(app => {
      const matchesSearch = !searchTerm ||
        app.jobTitle.toLowerCase().includes(searchTerm) ||
        app.company.toLowerCase().includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
      const matchesWorkType = workTypeFilter === 'all' || app.workType === workTypeFilter;

      return matchesSearch && matchesStatus && matchesWorkType;
    });

    this.renderTable();
  }

  exportToCSV() {
    const headers = ['Job Title', 'Company', 'Work Type', 'Salary', 'Location', 'Applied Date', 'Status', 'Job URL'];
    const rows = this.filteredApplications.map(app => [
      app.jobTitle,
      app.company,
      app.workType,
      app.salary || '',
      app.location,
      new Date(app.appliedDate).toISOString(),
      app.status,
      app.jobUrl
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-applications-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getWorkTypeBadge(workType) {
    if (!workType) return '<span class="work-type-badge">Unknown</span>';

    const badgeClass = `work-type-${workType.toLowerCase()}`;
    return `<span class="work-type-badge ${badgeClass}">${this.capitalize(workType)}</span>`;
  }

  getStatusBadge(status) {
    const statusClass = `status-${status}`;
    let statusText = status;
    if (status === 'draft') statusText = 'Draft (Cover Letter)';

    return `<span class="status-badge ${statusClass}">${this.capitalize(statusText)}</span>`;
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
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ApplicationsTracker();
});
