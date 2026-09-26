// Sends a welcome message to a new connection, started from the Connection
// Analytics page. The background opens the person's profile (or a search of
// your connections) in a new tab; this script picks up the task there.

class WelcomeMessenger {
  constructor(storage) {
    this.storage = storage;
    this.busy = false;
  }

  // Called on every LinkedIn page load. Returns the welcome message task if
  // this tab was opened to send one, otherwise null.
  async claimTask() {
    if (this.busy) return null;
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getPendingWelcome' });
      return response?.task || null;
    } catch (error) {
      return null;
    }
  }

  async run(task) {
    if (!task || this.busy) return;
    this.busy = true;
    console.log('[Welcome] 💬 Sending welcome message to', task.fullName);
    let outcome;
    try {
      outcome = await this.send(task);
    } catch (error) {
      outcome = { success: false, error: error.message };
    } finally {
      this.busy = false;
    }

    console.log('[Welcome]', outcome.success ? '✅ Sent to ' + task.fullName : '⚠️ Not sent: ' + outcome.error);
    await chrome.runtime.sendMessage({ action: 'welcomeMessageResult', requestId: task.requestId, ...outcome });
  }

  async send(task) {
    // Give the page time to load, as a person would
    await this.humanDelay(2500, 4500);

    const found = await this.waitFor(() => this.findMessageButton(task), 15000);
    if (!found || found.error) {
      return {
        success: false,
        error: found?.error || (task.stage === 'search'
          ? `Couldn't find ${task.fullName} among your connections`
          : 'No Message button on their profile - are you connected yet?')
      };
    }

    await this.humanDelay(800, 1800);
    found.button.click();

    // Wait for this person's conversation to open (another one may already be open)
    const compose = await this.waitFor(() => {
      const found = this.findComposeBox(task);
      return found && found.nameVerified ? found : null;
    }, 10000);
    if (!compose) {
      // Never type into a conversation with someone else
      return {
        success: false,
        error: this.findComposeBox(task)
          ? `The message window that opened isn't for ${task.fullName}, so nothing was sent`
          : "LinkedIn's message box didn't open"
      };
    }

    await this.humanDelay(800, 1600);
    await this.typeMessage(compose.box, task.message);
    await this.humanDelay(1000, 2200);

    const sendButton = await this.waitFor(() => {
      const button = this.findSendButton(compose.container);
      return button && !button.disabled ? button : null;
    }, 5000);
    if (!sendButton) {
      return { success: false, error: "LinkedIn's Send button stayed disabled" };
    }
    sendButton.click();

    // LinkedIn clears the message box once the message is sent
    const cleared = await this.waitFor(() => compose.box.textContent.trim() === '', 8000);
    return cleared
      ? { success: true, message: task.message }
      : { success: false, error: "Couldn't confirm it was sent - check your conversation with them on LinkedIn" };
  }

  // ---- Finding things on the page -------------------------------------------

  isVisible(el) {
    return !!el && el.getClientRects().length > 0;
  }

  inMessaging(el) {
    return !!el.closest('#msg-overlay, .msg-overlay-container, [class*="msg-overlay"]');
  }

  isMessageControl(el) {
    const label = (el.getAttribute('aria-label') || '').trim();
    const text = el.textContent.trim();
    return /^message\b/i.test(label) || /^message$/i.test(text) ||
           (el.tagName === 'A' && /\/messaging\/compose/.test(el.getAttribute('href') || ''));
  }

  // Returns { button } or { error }; null while the page is still loading
  findMessageButton(task) {
    const controls = Array.from(document.querySelectorAll('main button, main a'))
      .filter(el => this.isVisible(el) && !this.inMessaging(el) && !el.closest('aside') && this.isMessageControl(el));

    if (task.stage === 'profile') {
      // Ignore buttons labelled for someone else (e.g. "People also viewed")
      const named = controls.filter(el => {
        const label = (el.getAttribute('aria-label') || '').replace(/^message\s*/i, '').trim();
        return !label || TextUtils.namesMatch(label, task.fullName);
      });
      return named.length ? { button: named[0] } : null;
    }

    // Search results: exactly one result for this person, with a Message button
    const results = Array.from(document.querySelectorAll('main li'))
      .filter(li => controls.some(el => li.contains(el)))
      .filter(li => {
        // The visible name only: the link also holds hidden "View X's profile" text
        const nameEl = li.querySelector('a[href*="/in/"] span[aria-hidden="true"]') ||
                       li.querySelector('[data-anonymize="person-name"]') ||
                       li.querySelector('a[href*="/in/"]');
        return nameEl && TextUtils.namesMatch(TextUtils.dedupeRepeatedText(nameEl.textContent), task.fullName);
      });

    if (results.length > 1) {
      return { error: `Found ${results.length} connections called ${task.fullName} - message them from their profile instead` };
    }
    if (results.length === 0) return null;
    return { button: controls.find(el => results[0].contains(el)) };
  }

  // The conversation box, and whether its header names this person
  findComposeBox(task) {
    const boxes = Array.from(document.querySelectorAll(
      '.msg-form__contenteditable[contenteditable="true"], [role="textbox"][contenteditable="true"]'))
      .filter(box => this.isVisible(box));
    if (boxes.length === 0) return null;

    const candidates = boxes.map(box => {
      const container = box.closest('.msg-overlay-conversation-bubble, [class*="msg-overlay-conversation"], .msg-convo-wrapper, .msg-thread, [role="dialog"]') ||
                        box.closest('form')?.parentElement || document.body;
      const header = container.querySelector('.msg-overlay-bubble-header__title, [class*="bubble-header__title"], .msg-entity-lockup__entity-title, h2, h3');
      const headerText = TextUtils.dedupeRepeatedText(header ? header.textContent : '');
      return { box, container, nameVerified: TextUtils.namesMatch(headerText, task.fullName) };
    });

    // Prefer the conversation with this person; the newest box is last
    return candidates.reverse().find(c => c.nameVerified) || candidates[0];
  }

  findSendButton(container) {
    const buttons = Array.from(container.querySelectorAll('button')).filter(btn => this.isVisible(btn));
    return buttons.find(btn => btn.classList.contains('msg-form__send-button')) ||
           buttons.find(btn => btn.type === 'submit' && /send/i.test(btn.textContent)) ||
           buttons.find(btn => btn.textContent.trim().toLowerCase() === 'send') ||
           null;
  }

  // ---- Typing -----------------------------------------------------------------

  async typeMessage(box, message) {
    box.focus();

    // Clear anything already in the box
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    for (const char of message) {
      // insertText fires the input events LinkedIn's editor listens for
      const typed = char === '\n'
        ? document.execCommand('insertLineBreak', false, null)
        : document.execCommand('insertText', false, char);
      if (!typed) break;

      await new Promise(resolve => setTimeout(resolve, 40 + Math.random() * 90));
      if (Math.random() < 0.08) {
        await new Promise(resolve => setTimeout(resolve, 250 + Math.random() * 500));
      }
    }

    // Fall back to setting the text directly if typing didn't land
    const normalise = (text) => text.replace(/\s+/g, ' ').trim();
    if (normalise(box.textContent) !== normalise(message)) {
      box.innerHTML = '';
      for (const line of message.split('\n')) {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        box.appendChild(paragraph);
      }
      box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  // ---- Helpers ------------------------------------------------------------------

  async waitFor(check, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 150));
    }
    return check() || null;
  }

  humanDelay(minMs, maxMs) {
    return new Promise(resolve => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)));
  }
}

// Export for use in main content script
window.WelcomeMessenger = WelcomeMessenger;
