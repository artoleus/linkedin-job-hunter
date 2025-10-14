// Connection Analytics Dashboard

class AnalyticsDashboard {
  constructor() {
    this.analytics = null;
    this.charts = {};
    this.filteredRequests = [];

    this.init();
  }

  async init() {
    try {
      console.log('[Analytics] Loading analytics data...');
      await this.loadData();
      this.setupEventListeners();
      this.render();
    } catch (error) {
      console.error('[Analytics] Initialization error:', error);
    }
  }

  async loadData() {
    const result = await chrome.runtime.sendMessage({ action: 'getConnectionAnalytics' });
    this.analytics = result.analytics || { requests: [], stats: {} };
    this.filteredRequests = this.analytics.requests;
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

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      await this.loadData();
      this.render();
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

    // Add test data button (for demonstration)
    document.getElementById('addTestDataBtn').addEventListener('click', async () => {
      if (confirm('Add test data to analytics? (This will add sample connection requests for demonstration)')) {
        await this.addTestData();
        await this.loadData();
        this.render();
      }
    });
  }

  render() {
    this.renderStats();
    this.renderCharts();
    this.renderTable();
    this.populateRoleFilter();
  }

  renderStats() {
    const stats = this.analytics.stats || {};

    document.getElementById('totalSent').textContent = stats.totalSent || 0;
    document.getElementById('totalAccepted').textContent = stats.totalAccepted || 0;
    document.getElementById('totalPending').textContent = stats.totalPending || 0;
    document.getElementById('totalDeclined').textContent = stats.totalDeclined || 0;

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
    const acceptanceRates = roles.map(role => {
      const total = roleStats[role].accepted + roleStats[role].declined;
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
          backgroundColor: '#0077b5',
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
          borderColor: '#0077b5',
          backgroundColor: 'rgba(0, 119, 181, 0.1)',
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
        labels: ['Accepted', 'Pending', 'Declined'],
        datasets: [{
          data: [
            stats.totalAccepted || 0,
            stats.totalPending || 0,
            stats.totalDeclined || 0
          ],
          backgroundColor: [
            '#00a000',
            '#ff9800',
            '#d93025'
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
      tbody.innerHTML = '<tr><td colspan="6" class="no-data">No requests found</td></tr>';
      return;
    }

    // Sort by sent date (newest first)
    const sorted = [...this.filteredRequests].sort((a, b) =>
      new Date(b.sentDate) - new Date(a.sentDate)
    );

    tbody.innerHTML = sorted.map(req => {
      const sentDate = new Date(req.sentDate);
      const responseTime = req.responseDate ?
        this.formatResponseTime(new Date(req.sentDate), new Date(req.responseDate)) :
        '--';

      return `
        <tr>
          <td><strong>${this.escapeHtml(req.fullName)}</strong></td>
          <td>${this.escapeHtml(req.targetRole)}</td>
          <td>${sentDate.toLocaleDateString()} ${sentDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
          <td><span class="status-badge status-${req.status}">${this.capitalize(req.status)}</span></td>
          <td>${responseTime}</td>
          <td>${this.formatTimeOfDay(req.timeOfDay)}</td>
        </tr>
      `;
    }).join('');
  }

  populateRoleFilter() {
    const roles = [...new Set(this.analytics.requests.map(r => r.targetRole))].filter(Boolean);
    const roleFilter = document.getElementById('roleFilter');

    roleFilter.innerHTML = '<option value="all">All Roles</option>' +
      roles.map(role => `<option value="${role}">${role}</option>`).join('');
  }

  filterRequests() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const roleFilter = document.getElementById('roleFilter').value;

    this.filteredRequests = this.analytics.requests.filter(req => {
      const matchesSearch = !searchTerm ||
        req.fullName.toLowerCase().includes(searchTerm) ||
        req.targetRole.toLowerCase().includes(searchTerm);

      const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
      const matchesRole = roleFilter === 'all' || req.targetRole === roleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });

    this.renderTable();
  }

  exportToCSV() {
    const headers = ['Name', 'Role', 'Sent Date', 'Status', 'Response Date', 'Response Time (hours)', 'Time of Day'];
    const rows = this.filteredRequests.map(req => [
      req.fullName,
      req.targetRole,
      new Date(req.sentDate).toISOString(),
      req.status,
      req.responseDate ? new Date(req.responseDate).toISOString() : '',
      req.responseDate ? Math.round((new Date(req.responseDate) - new Date(req.sentDate)) / (1000 * 60 * 60)) : '',
      req.timeOfDay
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `connection-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async addTestData() {
    const roles = ['developer', 'software engineer', 'programmer', 'tech lead', 'engineering manager'];
    const names = [
      'John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis', 'David Wilson',
      'Jennifer Taylor', 'James Anderson', 'Lisa Martinez', 'Robert Thomas', 'Mary Garcia',
      'Christopher Lee', 'Patricia White', 'Daniel Harris', 'Linda Clark', 'Matthew Lewis'
    ];
    const statuses = ['accepted', 'pending', 'declined'];

    // Generate 15 sample connection requests with varied timestamps
    const testRequests = [];
    const now = Date.now();

    for (let i = 0; i < 15; i++) {
      const sentDate = new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000); // Last 7 days
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      let responseDate = null;
      if (status !== 'pending') {
        // Response within 1-4 days after sent
        responseDate = new Date(sentDate.getTime() + (1 + Math.random() * 3) * 24 * 60 * 60 * 1000);
      }

      const requestData = {
        targetRole: roles[Math.floor(Math.random() * roles.length)],
        fullName: names[i],
        profileUrl: `https://linkedin.com/in/test-profile-${i}`,
        messageTemplate: status === 'accepted' ? 'Personalized message' : null
      };

      // Save via background script
      await chrome.runtime.sendMessage({
        action: 'saveConnectionRequest',
        requestData
      });

      // If not pending, update status
      if (status !== 'pending') {
        // Get the request ID (it will be the timestamp)
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
        const result = await chrome.runtime.sendMessage({ action: 'getConnectionAnalytics' });
        const savedRequest = result.analytics.requests[result.analytics.requests.length - 1];

        if (savedRequest) {
          await chrome.runtime.sendMessage({
            action: 'updateConnectionStatus',
            requestId: savedRequest.id,
            status: status
          });
        }
      }
    }

    alert('Test data added! Refresh to see the results.');
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new AnalyticsDashboard();
});
