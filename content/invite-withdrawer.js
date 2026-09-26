// Withdraws connection invitations that have been waiting too long.
// LinkedIn caps how many invitations can be pending, and a large backlog of
// unanswered ones counts against the account, so old ones are cleared out
// from the "Sent" invitations page, oldest first.

const WITHDRAW_TASK_KEY = 'inviteWithdrawalPending';
const SENT_INVITATIONS_URL = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';

class InviteWithdrawer {
  constructor(storage) {
    this.storage = storage;
    this.settings = {};
    this.isRunning = false;
    this.progress = null;
  }

  // A withdrawal run was started and this page load should carry it out
  // (the connection monitor also works on the sent page and stands aside)
  static hasPendingTask() {
    try {
      const task = JSON.parse(localStorage.getItem(WITHDRAW_TASK_KEY) || 'null');
      return !!task && Date.now() - task.timestamp < 120000;
    } catch (error) {
      return false;
    }
  }

  isOnSentPage() {
    return location.pathname.startsWith('/mynetwork/invitation-manager/sent');
  }

  async start() {
    if (this.isRunning) return;
    localStorage.setItem(WITHDRAW_TASK_KEY, JSON.stringify({ timestamp: Date.now() }));
    if (!this.isOnSentPage()) {
      console.log('[Invite Withdrawer] Opening your sent invitations...');
      location.href = SENT_INVITATIONS_URL;
      return;
    }
    await this.checkPending();
  }

  // Called on page load: run a pending task once
  async checkPending() {
    if (!InviteWithdrawer.hasPendingTask()) {
      localStorage.removeItem(WITHDRAW_TASK_KEY);
      return false;
    }
    if (!this.isOnSentPage()) return false;
    localStorage.removeItem(WITHDRAW_TASK_KEY);
    await this.run();
    return true;
  }

  withdrawAfterDays() {
    const days = parseInt(this.settings.withdrawAfterDays, 10);
    return Number.isFinite(days) ? Math.min(180, Math.max(7, days)) : 21;
  }

  async run() {
    this.settings = await this.storage.getSettings();
    const afterDays = this.withdrawAfterDays();
    const maxPerRun = Math.max(1, parseInt(this.settings.maxWithdrawalsPerRun, 10) || 25);
    const summary = { afterDays, checked: 0, eligible: 0, withdrawn: 0, failed: 0, unknownAge: 0, oldestDays: null, stoppedReason: null };
    this.isRunning = true;
    this.progress = summary;
    console.log(`[Invite Withdrawer] Withdrawing invitations older than ${afterDays} days (at most ${maxPerRun})`);

    try {
      await this.humanDelay(2000, 4000);
      await this.waitFor(() => this.findWithdrawButtons().length > 0, 20000);
      await this.loadAllInvitations();

      const invitations = this.findWithdrawButtons().map(button => this.describeInvitation(button));
      summary.checked = invitations.length;
      summary.unknownAge = invitations.filter(inv => inv.ageDays === null).length;
      const ages = invitations.map(inv => inv.ageDays).filter(age => age !== null);
      summary.oldestDays = ages.length ? Math.max(...ages) : null;

      const old = invitations
        .filter(inv => inv.ageDays !== null && inv.ageDays >= afterDays)
        .sort((a, b) => b.ageDays - a.ageDays)
        .slice(0, maxPerRun);
      summary.eligible = old.length;
      console.log(`[Invite Withdrawer] ${invitations.length} pending invitations, ${old.length} to withdraw` +
                  (summary.unknownAge ? ` (${summary.unknownAge} with no date shown)` : ''));

      for (const invitation of old) {
        if (!this.isRunning) {
          summary.stoppedReason = 'Stopped';
          break;
        }
        if (await this.withdraw(invitation)) {
          summary.withdrawn++;
          const { matched } = await chrome.runtime.sendMessage({
            action: 'markInvitationWithdrawn',
            person: { fullName: invitation.fullName, profileUrl: invitation.profileUrl }
          }) || {};
          console.log(`[Invite Withdrawer] ✅ Withdrew ${invitation.fullName || 'an invitation'} (${invitation.ageDays} days old)` +
                      (matched ? '' : ' - not in your analytics'));
        } else {
          summary.failed++;
          // Something about the page isn't as expected: don't keep clicking
          if (summary.failed >= 3) {
            summary.stoppedReason = 'LinkedIn did not confirm three withdrawals in a row';
            break;
          }
        }
        await this.humanDelay(4000, 9000);
      }
    } catch (error) {
      console.error('[Invite Withdrawer] Error:', error);
      summary.stoppedReason = error.message;
    } finally {
      this.isRunning = false;
      console.log('[Invite Withdrawer] Done:', summary);
      await chrome.runtime.sendMessage({ action: 'saveWithdrawalSummary', summary }).catch(() => {});
    }
    return summary;
  }

  isVisible(el) {
    return !!el && el.getClientRects().length > 0;
  }

  inDialog(el) {
    return !!el.closest('[role="dialog"], [role="alertdialog"], .artdeco-modal, #msg-overlay, [class*="msg-overlay"]');
  }

  // The "Withdraw" button on each invitation card (not the one in the
  // confirmation pop-up)
  findWithdrawButtons() {
    return Array.from(document.querySelectorAll('main button, [role="main"] button'))
      .filter(btn => this.isVisible(btn) && !this.inDialog(btn) && !btn.disabled &&
                     /^withdraw\b/i.test((btn.getAttribute('aria-label') || btn.textContent).trim()));
  }

  cardFor(button) {
    const item = button.closest('li, [role="listitem"]');
    if (item) return item;
    // Newer layouts: climb to the smallest block holding a profile link
    let el = button.parentElement;
    while (el && el !== document.body && !el.querySelector('a[href*="/in/"]')) el = el.parentElement;
    return el || button.parentElement;
  }

  describeInvitation(button) {
    const card = this.cardFor(button);
    const label = (button.getAttribute('aria-label') || '').trim();
    const fromLabel = label.match(/^withdraw\s+(?:invitation\s+)?(?:sent\s+)?to\s+(.+)$/i);
    const link = card.querySelector('a[href*="/in/"]');
    const linkName = card.querySelector('a[href*="/in/"] span[aria-hidden="true"], [class*="name"]') || link;
    const fullName = TextUtils.dedupeRepeatedText(fromLabel ? fromLabel[1] : linkName?.textContent || '').trim();
    return {
      button,
      card,
      fullName,
      profileUrl: link ? link.href.split('?')[0] : null,
      ageDays: Safety.sentAgeDays(card.textContent)
    };
  }

  // The sent page shows invitations in batches; scroll and press
  // "Load more" until all of them are on the page (the oldest are last)
  async loadAllInvitations() {
    for (let round = 0; round < 15; round++) {
      const before = this.findWithdrawButtons().length;
      window.scrollTo(0, document.body.scrollHeight);
      const more = Array.from(document.querySelectorAll('main button, [role="main"] button'))
        .find(btn => this.isVisible(btn) && !btn.disabled && /^(show|load|see) more/i.test(btn.textContent.trim()));
      if (more) more.click();
      await this.humanDelay(1500, 3000);
      if (!more && this.findWithdrawButtons().length === before) break;
    }
    window.scrollTo(0, 0);
  }

  findConfirmButton() {
    return Array.from(document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button, .artdeco-modal button'))
      .find(btn => this.isVisible(btn) && !btn.closest('#msg-overlay, [class*="msg-overlay"]') &&
                   /^withdraw\b/i.test((btn.textContent.trim() || btn.getAttribute('aria-label') || '')));
  }

  async withdraw(invitation) {
    const { button } = invitation;
    button.scrollIntoView({ block: 'center' });
    await this.humanDelay(800, 1800);
    button.click();

    const confirm = await this.waitFor(() => this.findConfirmButton(), 6000);
    if (!confirm) {
      console.log('[Invite Withdrawer] ⚠️ No confirmation pop-up for', invitation.fullName);
      const dismiss = document.querySelector('[role="dialog"] button[aria-label="Dismiss"], .artdeco-modal__dismiss');
      if (dismiss) dismiss.click();
      return false;
    }
    await this.humanDelay(600, 1400);
    confirm.click();

    // Done once the pop-up has closed and the card's button has gone
    const done = await this.waitFor(() => !this.findConfirmButton() &&
      (!document.contains(button) || !this.isVisible(button) || /withdrawn/i.test(invitation.card.textContent)), 8000);
    if (!done) console.log('[Invite Withdrawer] ⚠️ LinkedIn did not confirm the withdrawal of', invitation.fullName);
    return !!done;
  }

  async waitFor(check, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 100));
    }
    return check() || null;
  }

  humanDelay(minMs, maxMs) {
    return new Promise(resolve => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)));
  }

  stop() {
    this.isRunning = false;
    localStorage.removeItem(WITHDRAW_TASK_KEY);
  }

  getStatus() {
    return { isRunning: this.isRunning, progress: this.progress };
  }
}

window.InviteWithdrawer = InviteWithdrawer;
