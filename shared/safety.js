// Account-safety and messaging rules shared by the content scripts, the
// popup, the analytics page and the background service worker:
// warm-up of the daily invitation limit, the do-not-contact list, the age of
// sent invitations, and the A/B message test.

const Safety = {
  DAY_MS: 24 * 60 * 60 * 1000,

  // ---- Warm-up ---------------------------------------------------------------

  // The daily invitation limit starts at a quarter of the user's limit and
  // rises evenly to the full limit over this many days
  WARM_UP_DAYS: 21,
  WARM_UP_START_SHARE: 0.25,
  WARM_UP_MIN: 5,

  warmUpEnabled(settings = {}) {
    return settings.warmUpEnabled !== false;
  },

  // Whole days since the warm-up started (0 on the first day)
  warmUpDay(startDate, now = new Date()) {
    const start = new Date(startDate);
    if (isNaN(start)) return 0;
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((today - startDay) / Safety.DAY_MS));
  },

  // Today's invitation limit: { limit, max, day, warming }
  inviteLimit(settings = {}, now = new Date()) {
    const max = Math.max(1, Number(settings.maxDailyInvites) || 30);
    if (!Safety.warmUpEnabled(settings) || !settings.warmUpStartDate) {
      return { limit: max, max, day: null, warming: false };
    }
    const day = Safety.warmUpDay(settings.warmUpStartDate, now);
    if (day >= Safety.WARM_UP_DAYS) return { limit: max, max, day, warming: false };

    const share = Safety.WARM_UP_START_SHARE + (1 - Safety.WARM_UP_START_SHARE) * day / Safety.WARM_UP_DAYS;
    const limit = Math.min(max, Math.max(Safety.WARM_UP_MIN, Math.round(max * share)));
    return { limit, max, day, warming: limit < max };
  },

  // ---- Do-not-contact list ---------------------------------------------------

  // One entry per line (commas also separate entries)
  parseList(text) {
    return [...new Set(String(text || '')
      .split(/[\n,]/)
      .map(line => line.trim())
      .filter(line => line.length >= 2))];
  },

  // The part of a LinkedIn profile link that identifies the person
  profileSlug(url) {
    const match = String(url || '').match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]).toLowerCase();
    } catch (error) {
      return match[1].toLowerCase();
    }
  },

  normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ' ').trim();
  },

  // The do-not-contact entry that matches this person, or null.
  // A profile link matches that profile only; any other entry matches as a
  // whole word or phrase in the person's name or card text (headline,
  // company), so "Acme" skips everyone at Acme.
  blockedBy(entries = [], person = {}) {
    const slug = Safety.profileSlug(person.profileUrl);
    const haystack = ` ${Safety.normalize(`${person.fullName || ''} ${person.text || ''}`)} `;

    for (const entry of entries || []) {
      const entrySlug = Safety.profileSlug(entry);
      if (entrySlug) {
        if (slug && entrySlug === slug) return entry;
        continue;
      }
      const needle = Safety.normalize(entry);
      if (needle && haystack.includes(` ${needle} `)) return entry;
    }
    return null;
  },

  // ---- Sent invitations ------------------------------------------------------

  // Days since an invitation was sent, from LinkedIn's "Sent 3 weeks ago"
  // style text; null when the text has no age
  sentAgeDays(text) {
    const t = String(text || '').toLowerCase().replace(/\s+/g, ' ');
    if (/\bsent today\b/.test(t)) return 0;
    if (/\bsent yesterday\b/.test(t)) return 1;
    const age = /(\d+|an?|one) (minute|hour|day|week|month|year)s? ago/;
    // Prefer "Sent 3 weeks ago" over any other "... ago" on the card (e.g. in a headline)
    const match = t.match(new RegExp(`\\bsent ${age.source}`)) || t.match(age);
    if (!match) return /\btoday\b/.test(t) ? 0 : /\byesterday\b/.test(t) ? 1 : null;
    const count = /^\d+$/.test(match[1]) ? parseInt(match[1], 10) : 1;
    const unitDays = { minute: 0, hour: 0, day: 1, week: 7, month: 30, year: 365 }[match[2]];
    return count * unitDays;
  },

  // ---- Message test (A/B) ----------------------------------------------------

  MESSAGE_MODES: ['off', 'test', 'A', 'B'],

  messageTest(settings = {}) {
    const test = settings.messageTest || {};
    return {
      mode: Safety.MESSAGE_MODES.includes(test.mode) ? test.mode : 'off',
      a: String(test.a || '').trim(),
      b: String(test.b || '').trim()
    };
  },

  // Which wording to use for the next invitation: 'A', 'B', or null for the
  // built-in wordings
  chooseVariant(settings = {}, random = Math.random) {
    const test = Safety.messageTest(settings);
    if (test.mode === 'test' && test.a && test.b) return random() < 0.5 ? 'A' : 'B';
    if (test.mode === 'A' && test.a) return 'A';
    if (test.mode === 'B' && test.b) return 'B';
    return null;
  },

  // Fill {first}, {role} and {field}; trims at a word boundary to fit LinkedIn's
  // note limit
  fillMessage(template, profile = {}, maxLength = 300) {
    const text = String(template || '')
      .replace(/\{first\}/gi, () => profile.firstName || 'there')
      .replace(/\{role\}/gi, () => profile.role || 'your field')
      .replace(/\{field\}/gi, () => profile.industry || 'your field')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length <= maxLength) return text;
    const cut = text.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  },

  // Sent / accepted / rate for each wording, and a plain-English verdict
  MIN_PER_VARIANT: 20,

  messageTestResults(requests = []) {
    const stats = {};
    for (const variant of ['A', 'B']) {
      const sent = requests.filter(r => r.messageVariant === variant);
      const accepted = sent.filter(r => r.status === 'accepted').length;
      stats[variant] = { sent: sent.length, accepted, rate: sent.length ? accepted / sent.length : 0 };
    }

    const { A, B } = stats;
    const pct = (s) => `${Math.round(s.rate * 100)}%`;
    let verdict;
    let winner = null;

    if (A.sent < Safety.MIN_PER_VARIANT || B.sent < Safety.MIN_PER_VARIANT) {
      verdict = `Too early to tell: aim for at least ${Safety.MIN_PER_VARIANT} invitations with each wording ` +
                `(so far A ${A.sent}, B ${B.sent}).`;
    } else {
      // Two-proportion z-test
      const pooled = (A.accepted + B.accepted) / (A.sent + B.sent);
      const se = Math.sqrt(pooled * (1 - pooled) * (1 / A.sent + 1 / B.sent));
      const z = se > 0 ? (A.rate - B.rate) / se : 0;
      if (Math.abs(z) >= 1.96) {
        winner = z > 0 ? 'A' : 'B';
        const loser = winner === 'A' ? 'B' : 'A';
        verdict = `Wording ${winner} is doing better (${pct(stats[winner])} accepted vs ${pct(stats[loser])}), ` +
                  'and the gap is big enough to trust.';
      } else {
        verdict = `No clear winner yet (A ${pct(A)}, B ${pct(B)}). The difference could be down to chance; keep testing.`;
      }
    }
    return { ...stats, verdict, winner };
  }
};

// globalThis: also loaded by the background service worker, which has no window
globalThis.Safety = Safety;
