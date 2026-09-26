// Application pipeline: statuses, follow-up reminders and outcome stats.
// Shared by the Applications page and the popup.

const Pipeline = {
  STATUSES: [
    { value: 'draft', label: 'Needs completion' },
    { value: 'applied', label: 'Applied' },
    { value: 'interviewing', label: 'Interviewing' },
    { value: 'offer', label: 'Offer' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'withdrawn', label: 'Withdrawn' }
  ],

  // Statuses that are still in play (a follow-up can make sense)
  OPEN_STATUSES: ['draft', 'applied', 'interviewing', 'offer'],

  DEFAULT_FOLLOW_UP_DAYS: 7,
  DAY_MS: 24 * 60 * 60 * 1000,

  // The job's own page (/jobs/view/<id>/) from a saved link, which may be a
  // search results link with ?currentJobId=<id>; null if there's no job id
  jobViewUrl(app = {}) {
    for (const link of [app.jobUrl, app.jobId]) {
      const match = String(link || '').match(/[?&]currentJobId=(\d+)|\/jobs\/view\/(?:[^/?#]*-)?(\d+)/);
      if (match) return `https://www.linkedin.com/jobs/view/${match[1] || match[2]}/`;
    }
    return null;
  },

  normalizeStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'submitted' || value === '') return 'applied';
    if (value === 'needs completion') return 'draft';
    return value;
  },

  label(status) {
    const value = Pipeline.normalizeStatus(status);
    const known = Pipeline.STATUSES.find(s => s.value === value);
    return known ? known.label : value.charAt(0).toUpperCase() + value.slice(1);
  },

  // The most recent thing that happened: applying, a status change, a note or a follow-up
  lastActivity(app) {
    const dates = [app.appliedDate, ...(app.history || []).map(event => event.date)]
      .map(date => new Date(date))
      .filter(date => !isNaN(date));
    return dates.length ? new Date(Math.max(...dates)) : null;
  },

  daysSince(date, now = new Date()) {
    if (!date) return null;
    return Math.floor((now - new Date(date)) / Pipeline.DAY_MS);
  },

  // YYYY-MM-DD in local time (the format of <input type="date">)
  toDateKey(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  followUpDays(settings = {}) {
    const days = Number(settings.followUpDays);
    return Number.isFinite(days) && days > 0 ? days : Pipeline.DEFAULT_FOLLOW_UP_DAYS;
  },

  // Whether an application needs a follow-up: on the reminder date the user
  // set, or after followUpDays with no update while waiting to hear back
  followUpDue(app, followUpDays = Pipeline.DEFAULT_FOLLOW_UP_DAYS, now = new Date()) {
    const status = Pipeline.normalizeStatus(app.status);
    if (!Pipeline.OPEN_STATUSES.includes(status)) return false;
    if (app.followUpDate) return Pipeline.toDateKey(now) >= app.followUpDate;
    if (status !== 'applied' && status !== 'interviewing') return false;
    const days = Pipeline.daysSince(Pipeline.lastActivity(app), now);
    return days !== null && days >= followUpDays;
  },

  followUpReason(app, now = new Date()) {
    if (app.followUpDate) return `Reminder for ${Pipeline.formatDate(app.followUpDate + 'T12:00:00')}`;
    const days = Pipeline.daysSince(Pipeline.lastActivity(app), now);
    const status = Pipeline.normalizeStatus(app.status);
    return `${status === 'interviewing' ? 'Interviewing' : 'Applied'}, no update for ${days} day${days === 1 ? '' : 's'}`;
  },

  // Got to interview stage at some point (including if later rejected)
  reachedInterview(app) {
    const status = Pipeline.normalizeStatus(app.status);
    if (status === 'interviewing' || status === 'offer') return true;
    return (app.history || []).some(event =>
      event.type === 'status' && ['interviewing', 'offer'].includes(Pipeline.normalizeStatus(event.status)));
  },

  // Heard anything back: an interview, an offer or a rejection
  heardBack(app) {
    return Pipeline.reachedInterview(app) || Pipeline.normalizeStatus(app.status) === 'rejected';
  },

  // Outcome counts for submitted applications, grouped by groupOf(app)
  outcomeStats(apps, groupOf) {
    const groups = new Map();
    for (const app of apps) {
      if (Pipeline.normalizeStatus(app.status) === 'draft') continue;
      const key = groupOf(app) || 'Other';
      if (!groups.has(key)) groups.set(key, { key, applied: 0, heardBack: 0, interviews: 0, offers: 0 });
      const group = groups.get(key);
      group.applied++;
      if (Pipeline.heardBack(app)) group.heardBack++;
      if (Pipeline.reachedInterview(app)) group.interviews++;
      if (Pipeline.normalizeStatus(app.status) === 'offer') group.offers++;
    }
    return [...groups.values()].sort((a, b) => b.applied - a.applied || a.key.localeCompare(b.key));
  },

  formatDate(date) {
    const d = new Date(date);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  // "25 Sept" this year, "25 Sept 2025" otherwise
  formatShortDate(date, now = new Date()) {
    const d = new Date(date);
    if (isNaN(d)) return '';
    return d.getFullYear() === now.getFullYear()
      ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : Pipeline.formatDate(d);
  },

  // Calendar days between two dates (yesterday 23:00 is 1 day ago at 01:00)
  calendarDaysSince(date, now = new Date()) {
    if (!date) return null;
    const start = new Date(date);
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - startDay) / Pipeline.DAY_MS);
  },

  // "today", "3d ago", "2w ago"
  formatAgo(date, now = new Date()) {
    const days = Pipeline.calendarDaysSince(date, now);
    if (days === null) return '--';
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days}d ago`;
    if (days < 60) return `${Math.floor(days / 7)}w ago`;
    return Pipeline.formatDate(date);
  }
};

// globalThis: also loaded by the background service worker, which has no window
globalThis.Pipeline = Pipeline;
