// Connection Status Monitor - finds out which invitations were accepted.
//
// "Check Accepted Connections" opens your sent invitations (anyone still
// listed there is still pending), then your connections page (anyone listed
// there accepted). People are recognised by their profile link (/in/...),
// which every LinkedIn layout has, falling back to an exact name match on
// that person's own link - never by searching the page's text, which also
// contains suggestions such as "People you may know".

const CONNECTION_CHECK_KEY = 'connectionCheckPending';
const SENT_PAGE_URL = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';
const CONNECTIONS_PAGE_URL = 'https://www.linkedin.com/mynetwork/invite-connect/connections/';

class ConnectionMonitor {
  constructor(storage) {
    this.storage = storage;
    this.isMonitoring = false;
    this.init();
  }

  async init() {
    // Withdrawing old invitations also works on the sent page; don't navigate away from it
    if (window.InviteWithdrawer?.hasPendingTask()) return;
    // Only as part of a check the user started: don't scroll pages they're just browsing
    if (!this.checkRequested()) return;

    if (location.pathname.startsWith('/mynetwork/invitation-manager/sent')) {
      await this.checkSentInvitations();
    } else if (location.pathname.startsWith('/mynetwork/invite-connect/connections')) {
      await this.checkConnectionsPage();
    }
  }

  // A check started with "Check Accepted Connections" (in the last 5 minutes)
  checkRequested() {
    try {
      const task = JSON.parse(localStorage.getItem(CONNECTION_CHECK_KEY) || 'null');
      return !!task && Date.now() - task.timestamp < 5 * 60 * 1000;
    } catch (error) {
      return false;
    }
  }

  async pendingRequests() {
    const result = await chrome.runtime.sendMessage({ action: 'getConnectionAnalytics' });
    return (result?.analytics?.requests || []).filter(req => req.status === 'pending');
  }

  // ---- Reading people off the page ------------------------------------------

  isVisible(el) {
    return !!el && el.getClientRects().length > 0;
  }

  // The page plus LinkedIn's shadow-DOM layer and same-origin "/preload/" frame
  queryAllDeep(selector) {
    const roots = [document];
    const interop = document.querySelector('#interop-outlet');
    if (interop?.shadowRoot) roots.push(interop.shadowRoot);
    for (const frame of document.querySelectorAll('iframe[src*="/preload/"]')) {
      try {
        if (frame.contentDocument) roots.push(frame.contentDocument);
      } catch (error) {
        // Not same-origin: nothing we can reach
      }
    }
    return roots.flatMap(root => Array.from(root.querySelectorAll(selector)));
  }

  // Everyone listed on the page: [{ slug, name }], one per profile.
  // Sidebars, the header and messaging are left out.
  listedPeople() {
    const people = new Map();
    const links = this.queryAllDeep('a[href*="/in/"]')
      .filter(a => this.isVisible(a) &&
                   !a.closest('aside, header, nav, footer, #msg-overlay, [class*="msg-overlay"], [role="dialog"]'));

    for (const link of links) {
      const slug = Safety.profileSlug(link.href);
      if (!slug) continue;
      const name = this.nameFromLink(link);
      const known = people.get(slug);
      if (!known) people.set(slug, { slug, name });
      else if (!known.name && name) known.name = name;
    }
    return Array.from(people.values());
  }

  // The person's name from their profile link: its visible name, else the
  // first line of its text, else its label ("View Jane Doe's profile")
  nameFromLink(link) {
    const clean = (text) => TextUtils.dedupeRepeatedText(text || '').trim();
    const visible = link.querySelector('span[aria-hidden="true"], [data-anonymize="person-name"]');
    const firstLine = (link.innerText || link.textContent || '').split('\n').map(line => line.trim()).find(Boolean);
    const label = (link.getAttribute('aria-label') || '').replace(/^view\s+/i, '').replace(/[’']s\s+profile.*$/i, '');
    return [visible?.textContent, firstLine, label].map(clean)
      .find(text => text.length >= 3 && text.length <= 80 && !/^(message|connect|follow|pending|withdraw)$/i.test(text)) || '';
  }

  // Whether a pending request is one of the listed people
  isListed(request, people) {
    const slug = Safety.profileSlug(request.profileUrl);
    if (slug) return people.some(person => person.slug === slug);
    // No profile link saved: an exact name match on someone's own link
    const name = Safety.normalize(request.fullName);
    return !!name && name !== 'unknown' && people.some(person => Safety.normalize(person.name) === name);
  }

  // Wait for the list to appear, then scroll and press "Show more" until
  // everyone we need has loaded or nothing more loads
  async loadPeople(isDone, maxRounds = 15) {
    await this.waitFor(() => this.listedPeople().length > 0, 20000);
    let people = this.listedPeople();

    for (let round = 0; round < maxRounds && !isDone(people); round++) {
      const before = people.length;
      window.scrollTo(0, document.body.scrollHeight);
      for (const scroller of document.querySelectorAll('main, .scaffold-finite-scroll, [class*="scaffold-layout__main"]')) {
        scroller.scrollTop = scroller.scrollHeight;
      }
      const more = this.queryAllDeep('button')
        .find(btn => this.isVisible(btn) && !btn.disabled && /^(show|load|see) more/i.test(btn.textContent.trim()));
      if (more) more.click();
      await this.pause(1500, 3000);
      people = this.listedPeople();
      if (people.length === before && !more) break;
    }
    window.scrollTo(0, 0);
    return people;
  }

  // ---- Sent invitations -------------------------------------------------------

  // Anyone still listed here is still pending; the rest may have accepted,
  // which the connections page confirms
  async checkSentInvitations() {
    try {
      const pending = await this.pendingRequests();
      if (pending.length === 0) {
        console.log('[Connection Monitor] No pending requests to check');
        this.finishCheck({ pending: 0, accepted: 0 });
        return;
      }

      const people = await this.loadPeople(() => false);
      const notListed = pending.filter(request => !this.isListed(request, people));
      console.log(`[Connection Monitor] Sent invitations page lists ${people.length} people; ` +
                  `${pending.length - notListed.length} of ${pending.length} pending requests still waiting`);

      if (people.length === 0) {
        console.warn('[Connection Monitor] ⚠️ No invitations found on the sent page - LinkedIn may have changed it. Checking connections anyway.');
      }

      // Only move on to the connections page as part of a check the user started
      if (this.checkRequested() && notListed.length > 0) {
        console.log('[Connection Monitor] 🔗 Checking your connections for', notListed.length, 'people...');
        localStorage.setItem(CONNECTION_CHECK_KEY, JSON.stringify({ timestamp: Date.now(), stage: 'connections' }));
        location.href = CONNECTIONS_PAGE_URL;
      } else if (this.checkRequested()) {
        this.finishCheck({ pending: pending.length, accepted: 0 });
      }
    } catch (error) {
      console.error('[Connection Monitor] Error checking sent invitations:', error);
    }
  }

  // ---- Connections ------------------------------------------------------------

  async checkConnectionsPage() {
    try {
      const pending = await this.pendingRequests();
      if (pending.length === 0) {
        console.log('[Connection Monitor] No pending requests to check for acceptance');
        this.finishCheck({ pending: 0, accepted: 0 });
        return;
      }

      // Newest connections come first, so keep loading until every pending
      // person is found or the list ends
      const people = await this.loadPeople(list => pending.every(request => this.isListed(request, list)));
      const accepted = pending.filter(request => this.isListed(request, people));

      for (const request of accepted) {
        console.log('[Connection Monitor] ✅', request.fullName, 'is now a connection');
        await chrome.runtime.sendMessage({ action: 'updateConnectionStatus', requestId: request.id, status: 'accepted' });
      }

      if (people.length === 0) {
        console.warn('[Connection Monitor] ⚠️ No connections found on the page - LinkedIn may have changed it. Page summary:', this.describePage());
      }
      console.warn(`[Connection Monitor] Checked ${people.length} connections: ${accepted.length} of ${pending.length} pending requests accepted`);
      this.finishCheck({ pending: pending.length, accepted: accepted.length, checked: people.length });
    } catch (error) {
      console.error('[Connection Monitor] Error checking connections page:', error);
    }
  }

  // For the console when nothing is found
  describePage() {
    const links = this.queryAllDeep('a[href*="/in/"]');
    return `url=${location.pathname} | profile links=${links.length} (visible ${links.filter(a => this.isVisible(a)).length}) | ` +
           `main=${!!document.querySelector('main')} | sample="${(links[0]?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)}"`;
  }

  finishCheck(summary) {
    localStorage.removeItem(CONNECTION_CHECK_KEY);
    chrome.runtime.sendMessage({ action: 'saveConnectionCheckSummary', summary }).catch(() => {});
  }

  // ---- Starting a check ---------------------------------------------------------

  // "Check Accepted Connections": start at the sent invitations page
  async checkAllPendingConnections() {
    console.log('[Connection Monitor] 🔍 Checking all pending connections...');
    localStorage.setItem(CONNECTION_CHECK_KEY, JSON.stringify({ timestamp: Date.now(), stage: 'sent' }));
    if (location.pathname.startsWith('/mynetwork/invitation-manager/sent')) {
      await this.checkSentInvitations();
    } else {
      location.href = SENT_PAGE_URL;
    }
  }

  async checkAcceptedConnections() {
    await this.checkAllPendingConnections();
  }

  namesMatch(text, fullName) {
    return TextUtils.namesMatch(text, fullName);
  }

  async waitFor(check, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100));
    }
    return check() || null;
  }

  pause(minMs, maxMs) {
    return new Promise(resolve => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)));
  }
}

// Export for use in main content script
window.ConnectionMonitor = ConnectionMonitor;
