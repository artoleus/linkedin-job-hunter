// Network expansion with human-like behavior

class NetworkExpander {
  constructor(storage) {
    this.storage = storage;
    this.settings = {};
    this.dailyLimits = {
      invitesSent: 0,
      profilesViewed: 0,
      lastResetDate: null
    };
    this.isRunning = false;

    // Settings load asynchronously; the expansion flow awaits this
    this.ready = this.init();
  }

  async init() {
    this.settings = await this.storage.getSettings();
    await this.loadDailyLimits();
    this.currentTargetRole = null; // Track current role for analytics
  }

  async loadDailyLimits() {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('networkExpanderLimits');

    if (stored) {
      this.dailyLimits = JSON.parse(stored);

      // Reset if it's a new day
      if (this.dailyLimits.lastResetDate !== today) {
        this.dailyLimits = {
          invitesSent: 0,
          profilesViewed: 0,
          lastResetDate: today,
          lastRoleIndex: -1  // Reset role rotation
        };
        this.saveDailyLimits();
      }
    } else {
      this.dailyLimits.lastResetDate = today;
      this.dailyLimits.lastRoleIndex = -1;
      this.saveDailyLimits();
    }
  }

  // Get next target role in rotation
  getNextTargetRole() {
    const targetRoles = this.settings.targetRoles || ['developer'];

    if (targetRoles.length === 0) {
      return 'developer';
    }

    // Get the last used role index (-1 = none yet today, so we start at role 0)
    const lastIndex = this.dailyLimits.lastRoleIndex ?? -1;

    // Move to next role (cycle back to 0 if at end)
    const nextIndex = (lastIndex + 1) % targetRoles.length;

    // Save the new index
    this.dailyLimits.lastRoleIndex = nextIndex;
    this.saveDailyLimits();

    const selectedRole = targetRoles[nextIndex];
    console.log(`[Network Expander] Selected role: "${selectedRole}" (${nextIndex + 1}/${targetRoles.length})`);

    return selectedRole;
  }

  saveDailyLimits() {
    localStorage.setItem('networkExpanderLimits', JSON.stringify(this.dailyLimits));
  }

  // Save connection request to analytics
  async saveConnectionAnalytics(fullName, profileUrl, message) {
    try {
      const requestData = {
        targetRole: this.currentTargetRole || 'Unknown',
        fullName: fullName,
        profileUrl: profileUrl || window.location.href,
        messageTemplate: message ? message.substring(0, 100) : null
      };

      await chrome.runtime.sendMessage({
        action: 'saveConnectionRequest',
        requestData
      });

      console.log('[Network Expander] Saved connection to analytics:', fullName);
    } catch (error) {
      console.error('[Network Expander] Error saving analytics:', error);
    }
  }

  // Generate personalized connection message based on profile info
  // maxLength: LinkedIn caps invitation notes (300 chars, lower on some free
  // accounts); longer text is silently truncated by the textarea
  generatePersonalizedMessage(profileData, maxLength = 300) {
    // Different templates for hiring managers vs general networking
    const isHiringFocused = this.settings.targetHiringOnly;
    // Just the job title from the headline, e.g. "Senior IT Manager"
    const role = this.shortRole(profileData.title);

    let templates;

    if (isHiringFocused) {
      // Templates for people who are actively hiring - clearly shows you're job seeking
      templates = [
        `Hi ${profileData.firstName}, I'm currently exploring new career opportunities in ${profileData.industry || 'the field'} and noticed you're hiring. I would appreciate the chance to connect and discuss potential roles with you.`,

        `Hello ${profileData.firstName}, I noticed you're recruiting in ${profileData.industry || 'your area'}. I'm actively seeking new opportunities and would value the chance to connect and discuss roles you may have available.`,

        `Hi ${profileData.firstName}, I'm reaching out to hiring managers in ${profileData.industry || 'the industry'} as I explore my next career move. I would be delighted to connect and learn more about opportunities you may have.`,

        `Hello ${profileData.firstName}, I came across your profile while researching professionals in the recruiting field. I'm currently exploring new career opportunities and would appreciate the chance to connect with you.`,

        `Hi ${profileData.firstName}, I noticed you're hiring ${role ? 'for ' + role + ' roles' : 'in the sector'}. I'm actively seeking new opportunities and would value the chance to connect and discuss openings you may have.`
      ];
    } else {
      // Templates for general professional networking - shows you're open to opportunities
      templates = [
        `Hi ${profileData.firstName}, I'm currently expanding my professional network in ${profileData.industry || 'the field'} and exploring new opportunities. I would appreciate the chance to connect and engage with you.`,

        `Hello ${profileData.firstName}, I'm connecting with professionals in ${profileData.industry || 'similar fields'} as I explore my career path. I would value the opportunity to connect and learn from your experience.`,

        `Hi ${profileData.firstName}, I'm building my network with professionals in ${profileData.industry || 'the industry'} and am open to new opportunities. I would be delighted to connect and engage with you.`,

        `Hello ${profileData.firstName}, I've been reaching out to ${role ? 'people in ' + role + ' roles' : 'professionals'} to build connections as I explore my next career move. It would be great to connect with you.`,

        `Hi ${profileData.firstName}, I'm connecting with talented professionals in ${profileData.industry || 'this field'} and exploring new opportunities. I would appreciate the chance to connect and learn about your work.`
      ];
    }

    // Headlines can be long, so only use templates that fit within the limit
    const fitting = templates.filter(t => t.length <= maxLength);
    if (fitting.length === 0) {
      return templates.reduce((a, b) => (a.length <= b.length ? a : b)).substring(0, maxLength);
    }

    // Randomly select a template
    return fitting[Math.floor(Math.random() * fitting.length)];
  }

  // "Senior IT Manager at Acme Ltd | ISO 27001" -> "Senior IT Manager".
  // Returns '' when the headline doesn't reduce to a short job title.
  shortRole(headline) {
    const role = (headline || '').split(/\s+(?:at|@)\s+|\s*[|,•·–—/]\s*|\s+-\s+/i)[0].trim();
    return role.length > 0 && role.length <= 40 ? role : '';
  }

  containsWord(text, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
  }

  guessIndustry(title, company) {
    // Checked in order, most specific first ("Security Engineer" is
    // cybersecurity, not software; "AI Governance" is AI, not GRC)
    const keywords = [
      ['AI', ['ai', 'artificial intelligence', 'machine learning', 'ml']],
      ['cybersecurity', ['security', 'cyber', 'ciso', 'grc', 'governance', 'risk', 'compliance', '27001', 'infosec']],
      ['IT', ['it', 'infrastructure', 'linux', 'sysadmin', 'systems administrator', 'devops', 'cloud', 'automation']],
      ['software', ['developer', 'engineer', 'programmer', 'software', 'tech']],
      ['marketing', ['marketing', 'growth', 'brand', 'digital marketing']],
      ['sales', ['sales', 'account', 'business development']],
      ['design', ['designer', 'ux', 'ui', 'creative']],
      ['product', ['product', 'pm', 'product manager']],
      ['data', ['data', 'analyst', 'analytics', 'scientist']]
    ];

    const combined = `${title} ${company}`.toLowerCase();
    // Short keywords must be whole words ("it" shouldn't match "security")
    const matches = word => word.length <= 3 ? this.containsWord(combined, word) : combined.includes(word);

    for (const [industry, words] of keywords) {
      if (words.some(matches)) {
        return industry;
      }
    }

    return 'the field';
  }

  // Check if we've reached daily limits
  hasReachedDailyLimit() {
    const maxInvites = this.settings.maxDailyInvites || 30; // Conservative default
    const maxProfileViews = this.settings.maxDailyProfileViews || 60;

    return this.dailyLimits.invitesSent >= maxInvites ||
           this.dailyLimits.profilesViewed >= maxProfileViews ||
           this.dailyLimits.linkedInLimitHit === true;
  }

  // Human-like delay
  async humanDelay(minMs = 3000, maxMs = 10000) {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    console.log(`[Network Expander] Waiting ${Math.round(delay/1000)}s...`);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // Fisher-Yates shuffle algorithm for randomizing array order
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Find all Connect buttons on the page
  findAllConnectButtons() {
    const buttons = [];

    // Primary selector: buttons with "Invite to connect" aria-label
    let found = document.querySelectorAll('button[aria-label*="Invite"][aria-label*="connect"]');
    if (found.length > 0) {
      console.log(`[Network Expander] Found ${found.length} buttons with Invite...connect aria-label`);
      return Array.from(found);
    }

    // Fallback: buttons with "Connect" aria-label
    found = document.querySelectorAll('button[aria-label*="Connect"]');
    if (found.length > 0) {
      console.log(`[Network Expander] Found ${found.length} buttons with Connect aria-label`);
      return Array.from(found);
    }

    // Last resort: find buttons containing span with "Connect" text
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const span = btn.querySelector('span.artdeco-button__text');
      if (span && span.textContent.trim() === 'Connect') {
        buttons.push(btn);
      }
    }

    console.log(`[Network Expander] Found ${buttons.length} buttons via span text search`);
    return buttons;
  }

  // Poll until check() returns something truthy, or give up after timeoutMs.
  // LinkedIn renders pop-ups asynchronously, so fixed delays alone are unreliable.
  async waitFor(check, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 100));
    }
    return check() || null;
  }

  // Search the page plus LinkedIn's shadow-DOM modal layer (used by newer pages)
  queryAllDeep(selector) {
    const roots = [document];
    const interop = document.querySelector('#interop-outlet');
    if (interop?.shadowRoot) roots.push(interop.shadowRoot);
    return roots.flatMap(root => Array.from(root.querySelectorAll(selector)));
  }

  isVisible(el) {
    return !!el && el.getClientRects().length > 0;
  }

  // The messaging panel and search-filter pop-overs also use role="dialog",
  // and messaging has its own "Send" button, so never treat them as the invite
  isOutsideInvite(el) {
    return !!el.closest('#msg-overlay, .msg-overlay-container, [class*="msg-overlay"], [class*="msg-form"]');
  }

  // Find the visible invitation pop-up by the controls only it contains
  findInviteDialog() {
    const markers = this.queryAllDeep(
      'button[aria-label*="Add a note"], button[aria-label*="Send without a note"], ' +
      'textarea#custom-message, textarea[name="message"], ' +
      'button[aria-label*="Send invitation"], button[aria-label*="Send now"]');

    for (const marker of markers) {
      if (!this.isVisible(marker) || this.isOutsideInvite(marker)) continue;
      return marker.closest('[role="dialog"], [role="alertdialog"], .artdeco-modal') ||
             marker.closest('#artdeco-modal-outlet') ||
             marker.parentElement;
    }
    return null;
  }

  findNoteBox() {
    return this.queryAllDeep('textarea#custom-message, textarea[name="message"]')
      .find(el => this.isVisible(el) && !this.isOutsideInvite(el)) || null;
  }

  // Visible buttons inside the invite pop-up
  dialogButtons(dialog) {
    return Array.from(dialog.querySelectorAll('button')).filter(btn => this.isVisible(btn));
  }

  findAddNoteButton(dialog) {
    return this.dialogButtons(dialog).find(btn =>
      (btn.getAttribute('aria-label') || btn.textContent).trim().toLowerCase().startsWith('add a note'));
  }

  // withNote: the note's "Send" button; otherwise "Send without a note"/"Send now"
  findSendButton(dialog, withNote) {
    const buttons = this.dialogButtons(dialog);
    const label = btn => (btn.getAttribute('aria-label') || '').toLowerCase();
    const text = btn => btn.textContent.trim().toLowerCase();

    if (withNote) {
      return buttons.find(btn => label(btn).startsWith('send') && !label(btn).includes('without')) ||
             buttons.find(btn => text(btn) === 'send');
    }
    return buttons.find(btn => label(btn).includes('send without a note')) ||
           buttons.find(btn => text(btn) === 'send without a note') ||
           buttons.find(btn => ['send now', 'send invitation'].some(l => label(btn).includes(l))) ||
           buttons.find(btn => text(btn) === 'send');
  }

  // Detect LinkedIn's invitation-limit warning so we stop instead of retrying
  detectInvitationLimit() {
    return this.queryAllDeep('[role="dialog"], [role="alertdialog"], .artdeco-modal')
      .some(el => this.isVisible(el) && !this.isOutsideInvite(el) &&
                  /invitation limit|weekly limit|reached the (weekly|monthly) limit/i.test(el.textContent));
  }

  // Close an unfinished invite pop-up so it doesn't block the next profile
  dismissInviteDialog(dialog = this.findInviteDialog()) {
    const dismissBtn = dialog && Array.from(dialog.querySelectorAll('button[aria-label="Dismiss"], .artdeco-modal__dismiss'))
      .find(btn => this.isVisible(btn));
    if (dismissBtn) {
      dismissBtn.click();
      console.log('[Network Expander] Closed unfinished invite pop-up');
    }
  }

  // Send connection request using the button element directly
  async sendConnectionRequestByButton(connectBtn, withMessage = true) {
    try {
      // Try to find the profile container to get more info
      const listItem = connectBtn.closest('li');
      let title = '';
      let company = '';
      let profileUrl = null;

      if (listItem) {
        const titleElem = listItem.querySelector('[class*="entity-result__primary-subtitle"]');
        title = titleElem ? titleElem.textContent.trim() : '';

        const companyElem = listItem.querySelector('[class*="entity-result__secondary-subtitle"]');
        company = companyElem ? companyElem.textContent.trim() : '';

        const profileLink = listItem.querySelector('a[href*="/in/"]');
        profileUrl = profileLink ? profileLink.href.split('?')[0] : null;
      }

      // Extract name from aria-label, falling back to the card's name element
      const ariaLabel = connectBtn.getAttribute('aria-label') || '';
      const match = ariaLabel.match(/Invite (.+?) to connect/);
      const nameElem = listItem?.querySelector('[data-anonymize="person-name"], a[href*="/in/"] span[aria-hidden="true"]');
      const fullName = (match ? match[1] : nameElem?.textContent || '').trim();
      // Greet by first name when known; analytics records 'Unknown' otherwise
      // (a placeholder like "there" would later fuzzy-match unrelated page text)
      const firstName = fullName ? fullName.split(' ')[0] : 'there';
      const displayName = fullName || '(unknown name)';

      console.log('[Network Expander] Preparing to connect with:', displayName);

      const industry = this.guessIndustry(title, company);
      const profileInfo = { fullName, firstName, title, company, industry };

      console.log('[Network Expander] Profile info:', profileInfo);

      // Click connect and wait for the invitation pop-up to render
      connectBtn.click();
      let dialog = await this.waitFor(() => this.findInviteDialog(), 8000);

      if (!dialog) {
        // Some accounts send the invite immediately, with no pop-up
        const nowPending = /pending/i.test(`${connectBtn.textContent} ${connectBtn.getAttribute('aria-label') || ''}`);
        if (nowPending) {
          console.log('[Network Expander] ✅ Sent request (no pop-up shown) to:', displayName);
          this.dailyLimits.invitesSent++;
          this.saveDailyLimits();
          await this.saveConnectionAnalytics(fullName || 'Unknown', profileUrl, null);
          return true;
        }

        if (this.detectInvitationLimit()) {
          console.log('[Network Expander] 🛑 LinkedIn reports an invitation limit - stopping for today');
          this.dailyLimits.linkedInLimitHit = true;
          this.saveDailyLimits();
          this.stopExpanding('LinkedIn invitation limit');
        } else {
          console.log('[Network Expander] ⚠️ Invite pop-up did not appear for', displayName, '- skipping');
        }
        return false;
      }

      // Pause as a person would while reading the pop-up
      await this.humanDelay(800, 1800);

      let message = null;

      // Treat a missing setting as "on", matching the checkbox default in the popup
      if (withMessage && this.settings.usePersonalizedMessages !== false) {
        const addNoteBtn = this.findAddNoteButton(dialog);

        if (addNoteBtn) {
          addNoteBtn.click();
          const messageBox = await this.waitFor(() => this.findNoteBox(), 6000);

          if (messageBox) {
            const maxLength = messageBox.maxLength > 0 ? messageBox.maxLength : 300;
            message = this.generatePersonalizedMessage(profileInfo, maxLength);

            await this.humanDelay(500, 1200);
            console.log('[Network Expander] ✍️ Typing note to', displayName);

            // Type message character by character (more human-like)
            await this.typeMessage(messageBox, message);

            await this.humanDelay(1000, 2000);
          } else {
            console.log('[Network Expander] ⚠️ Note box did not appear (LinkedIn may be limiting personalised notes on your account) - sending without a note');
          }
        } else {
          console.log('[Network Expander] ⚠️ No "Add a note" option in the invite pop-up - sending without a note');
        }
      }

      // The pop-up re-renders after "Add a note", so look it up again
      dialog = this.findInviteDialog() || dialog;

      // Find the send button inside the invite pop-up only, waiting for LinkedIn
      // to enable it once it has registered the typed note
      let sendBtn = await this.waitFor(() => {
        const btn = this.findSendButton(dialog, !!message);
        return btn && !btn.disabled ? btn : null;
      }, 5000);

      if (!sendBtn && message) {
        // The note didn't register (or notes are blocked): fall back to no note
        // rather than leaving the pop-up open
        console.log('[Network Expander] ⚠️ Send stayed disabled after typing the note - trying without a note');
        message = null;
        sendBtn = this.findSendButton(dialog, false);
        if (sendBtn?.disabled) sendBtn = null;
      }

      if (!sendBtn) {
        console.log('[Network Expander] ⚠️ Send button not found in the invite pop-up');
        this.dismissInviteDialog(dialog);
        return false;
      }

      sendBtn.click();

      // Confirm the invitation pop-up closed, i.e. LinkedIn accepted the invite
      const closed = await this.waitFor(() => !this.findInviteDialog(), 6000);
      if (!closed) {
        const needsEmail = dialog.querySelector('input[type="email"], input[name*="email"]');
        console.log('[Network Expander] ⚠️ Invite pop-up stayed open after Send' +
                    (needsEmail ? ' (LinkedIn requires this person\'s email address)' : '') + ' - skipping');
        this.dismissInviteDialog(dialog);
        return false;
      }

      if (this.detectInvitationLimit()) {
        console.log('[Network Expander] 🛑 LinkedIn reports an invitation limit - stopping for today');
        this.dailyLimits.linkedInLimitHit = true;
        this.saveDailyLimits();
        this.stopExpanding('LinkedIn invitation limit');
      }

      console.log(`[Network Expander] ✅ Sent ${message ? 'personalised ' : ''}request to:`, displayName);

      this.dailyLimits.invitesSent++;
      this.saveDailyLimits();

      // Save to analytics
      await this.saveConnectionAnalytics(fullName || 'Unknown', profileUrl, message);

      return true;

    } catch (error) {
      console.error('[Network Expander] Error sending connection:', error);
      this.dismissInviteDialog();
      return false;
    }
  }

  // Type message character by character with human-like timing
  async typeMessage(element, message) {
    element.focus();
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));

    for (const char of message) {
      // insertText behaves like real typing, firing the input events LinkedIn
      // listens for; fall back to setting the value directly
      const inserted = document.activeElement === element &&
                       document.execCommand('insertText', false, char);
      if (!inserted) {
        element.value += char;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Random typing speed (50-150ms per character)
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      // Occasional longer pause (like thinking)
      if (Math.random() < 0.1) {
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
      }
    }

    // Make sure the full message landed (e.g. if focus was lost mid-way)
    if (element.value !== message) {
      element.value = message;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Main network expansion process
  async startExpanding(options = {}) {
    console.log('[Network Expander] ⭐ startExpanding called with options:', options);

    // Reload settings to ensure we have latest values
    this.settings = await this.storage.getSettings();
    console.log('[Network Expander] Settings loaded:', this.settings);

    if (this.isRunning) {
      console.log('[Network Expander] Already running');
      return;
    }

    if (this.hasReachedDailyLimit()) {
      console.log('[Network Expander] ⚠️ Daily limit reached');
      return;
    }

    // Check if running in automated mode
    const automated = options.automated || false;

    if (automated) {
      // Automated mode: continue until daily limit reached
      console.log('[Network Expander] 🤖 Starting AUTOMATED expansion mode');
      await this.runAutomatedExpansion();
      return;
    }

    // Single role expansion (legacy mode)
    const targetRole = options.targetRole || this.getNextTargetRole();
    const maxConnections = options.maxConnections || this.settings.connectionsPerRole || 3;

    // Check if we're on a search results page
    const currentUrl = window.location.href;
    if (!currentUrl.includes('/search/results/people/')) {
      // Need to navigate to search page first
      const hiringFilter = this.settings.targetHiringOnly ? ' (Hiring)' : '';
      console.log('[Network Expander] Navigating to search page for:', targetRole + hiringFilter);

      // Store the expansion task
      localStorage.setItem('networkExpansionPending', JSON.stringify({
        targetRole,
        maxConnections,
        timestamp: Date.now()
      }));

      // Build search URL with optional hiring filter
      let searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(targetRole)}`;

      // Add "Hiring" filter if enabled
      // The serviceCategories parameter filters for people who are hiring
      if (this.settings.targetHiringOnly) {
        searchUrl += '&serviceCategories=%5B%22HIRING%22%5D';  // Encoded ["HIRING"]
      }

      window.location.href = searchUrl;
      return; // Execution stops here, will resume after page loads
    }

    // We're on the search page, start expanding
    this.isRunning = true;
    console.log('[Network Expander] Starting network expansion on search page...');

    try {
      // Wait for page to settle
      await this.humanDelay(3000, 5000);

      // Find profile cards - try multiple selectors
      let profileCards = document.querySelectorAll('[class*="entity-result"]');
      console.log(`[Network Expander] Trying entity-result selector: found ${profileCards.length} elements`);

      if (profileCards.length === 0) {
        console.log('[Network Expander] No profiles with entity-result class, trying alternative selectors...');
        profileCards = document.querySelectorAll('[data-chameleon-result-urn]');
        console.log(`[Network Expander] Trying data-chameleon-result-urn: found ${profileCards.length} elements`);
      }

      if (profileCards.length === 0) {
        profileCards = document.querySelectorAll('.reusable-search__result-container');
        console.log(`[Network Expander] Trying reusable-search__result-container: found ${profileCards.length} elements`);
      }

      if (profileCards.length === 0) {
        // Try finding list items in search results
        profileCards = document.querySelectorAll('li.reusable-search__result-container');
        console.log(`[Network Expander] Trying li.reusable-search__result-container: found ${profileCards.length} elements`);
      }

      console.log(`[Network Expander] Found ${profileCards.length} profiles`);

      if (profileCards.length > 0) {
        console.log('[Network Expander] First profile card HTML preview:', profileCards[0].outerHTML.substring(0, 500));
      }

      if (profileCards.length === 0) {
        console.log('[Network Expander] No profiles found on page');
        return;
      }

      // Alternative approach: Find all Connect buttons directly
      const connectButtons = this.findAllConnectButtons();
      console.log(`[Network Expander] Found ${connectButtons.length} Connect buttons on page`);

      if (connectButtons.length === 0) {
        console.log('[Network Expander] No Connect buttons found, cannot proceed');
        return;
      }

      // Shuffle buttons to randomize selection order
      const shuffledButtons = this.shuffleArray([...connectButtons]);
      console.log('[Network Expander] Randomized button order for more natural behavior');

      let connected = 0;
      for (const button of shuffledButtons) {
        if (connected >= maxConnections || this.hasReachedDailyLimit()) {
          break;
        }

        // Random chance to skip (makes it less robotic)
        if (Math.random() < 0.3) {
          console.log('[Network Expander] Randomly skipping profile (more human-like)');
          continue;
        }

        const success = await this.sendConnectionRequestByButton(button, true);
        if (success) {
          connected++;
        }

        // Long delay between requests (very important!)
        await this.humanDelay(10000, 30000); // 10-30 seconds between requests
      }

      console.log(`[Network Expander] ✅ Session complete. Sent ${connected} requests.`);

    } catch (error) {
      console.error('[Network Expander] Error during expansion:', error);
    } finally {
      this.isRunning = false;
      // Clear the pending task
      localStorage.removeItem('networkExpansionPending');
    }
  }

  // Check if there's a pending expansion task (called on page load)
  async checkPendingExpansion() {
    await this.ready;
    const pending = localStorage.getItem('networkExpansionPending');
    console.log('[Network Expander] checkPendingExpansion called. Pending task:', pending ? 'found' : 'none');

    if (!pending) return;

    try {
      const task = JSON.parse(pending);
      console.log('[Network Expander] Pending task details:', task);

      // Check if task is less than 2 minutes old (avoid stale tasks)
      const age = Date.now() - task.timestamp;
      console.log('[Network Expander] Task age:', Math.round(age / 1000), 'seconds');

      if (age > 120000) {
        console.log('[Network Expander] Pending task too old, ignoring');
        localStorage.removeItem('networkExpansionPending');
        return;
      }

      // Check if we're on a search results page
      const currentUrl = window.location.href;
      console.log('[Network Expander] Current URL:', currentUrl);
      console.log('[Network Expander] Is people search page?', currentUrl.includes('/search/results/people/'));

      if (currentUrl.includes('/search/results/people/')) {
        console.log('[Network Expander] Resuming pending expansion task...');

        // Extract pagination info
        const connectionsAlreadySent = task.connectionsAlreadySent || 0;
        const currentPage = task.currentPage || 1;

        // Restore current target role for analytics tracking
        this.currentTargetRole = task.targetRole;

        // If this was an automated task, process the page then continue
        if (task.automated) {
          console.log('[Network Expander] 🤖 Automated mode detected, processing this role then continuing...');

          // Store pending task back temporarily (processCurrentPageConnections may update it for pagination)
          localStorage.setItem('networkExpansionPending', JSON.stringify(task));

          const totalSent = await this.processCurrentPageConnections(
            task.maxConnections,
            connectionsAlreadySent,
            currentPage
          );

          // Check if page navigation happened (for pagination)
          const stillPending = localStorage.getItem('networkExpansionPending');
          if (stillPending) {
            const updatedTask = JSON.parse(stillPending);
            // If the task was updated with new page info, navigation will happen
            // and we'll resume here again
            if (updatedTask.currentPage !== currentPage) {
              console.log(`[Network Expander] Navigating to page ${updatedTask.currentPage}...`);
              return; // Let navigation happen, will resume on next page
            }
          }

          // Clear the pending task (no more pagination)
          localStorage.removeItem('networkExpansionPending');

          // Count consecutive roles where nothing could be sent, so a problem
          // on every page doesn't cycle through the roles forever
          const rolesWithoutInvites = totalSent > 0 ? 0 : (task.rolesWithoutInvites || 0) + 1;

          // After processing all pages for this role, continue to next role
          // unless the user pressed Stop or a limit was reached
          if (!this.isRunning) {
            console.log('[Network Expander] Stopped - not continuing to the next role.');
          } else if (!this.hasReachedDailyLimit()) {
            console.log('[Network Expander] Continuing automated expansion to next role...');
            await this.runAutomatedExpansion(rolesWithoutInvites);
          } else {
            console.log('[Network Expander] ✅ Daily limit reached! Stopping automated expansion.');
            this.isRunning = false;
          }
        } else {
          // Single role expansion (legacy mode)
          // Store pending task back temporarily
          localStorage.setItem('networkExpansionPending', JSON.stringify(task));

          await this.startExpanding({
            targetRole: task.targetRole,
            maxConnections: task.maxConnections
          });
        }
      }
    } catch (error) {
      console.error('[Network Expander] Error checking pending expansion:', error);
      localStorage.removeItem('networkExpansionPending');
    }
  }

  // Find the Next page button for pagination
  findNextPageButton() {
    // Try to find pagination "Next" button
    // LinkedIn uses various selectors for the Next button
    let nextBtn = document.querySelector('button[aria-label="Next"]');

    if (!nextBtn) {
      // Try finding by class and text content
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        if (ariaLabel.toLowerCase().includes('next')) {
          nextBtn = btn;
          break;
        }
      }
    }

    if (!nextBtn) {
      // Try finding pagination links with "next" or arrow
      const links = document.querySelectorAll('a.artdeco-pagination__button--next, a[aria-label*="Next"]');
      if (links.length > 0) {
        nextBtn = links[0];
      }
    }

    return nextBtn;
  }

  // Process connections on the current search page (with pagination)
  async processCurrentPageConnections(maxConnections, connectionsAlreadySent = 0, currentPage = 1) {
    this.isRunning = true;
    const remaining = maxConnections - connectionsAlreadySent;
    console.log(`[Network Expander] Processing page ${currentPage} (need ${remaining} more connections, ${connectionsAlreadySent} already sent)...`);

    try {
      // Wait for page to settle
      await this.humanDelay(3000, 5000);

      // Find all Connect buttons on the page
      const connectButtons = this.findAllConnectButtons();
      console.log(`[Network Expander] Found ${connectButtons.length} Connect buttons on page ${currentPage}`);

      if (connectButtons.length === 0) {
        console.log(`[Network Expander] No Connect buttons found on page ${currentPage}, moving on...`);
        return connectionsAlreadySent;
      }

      // Shuffle buttons to randomize selection order
      const shuffledButtons = this.shuffleArray([...connectButtons]);
      console.log('[Network Expander] Randomized button order for more natural behavior');

      let connectedThisPage = 0;
      for (const button of shuffledButtons) {
        const totalConnected = connectionsAlreadySent + connectedThisPage;

        if (totalConnected >= maxConnections || this.hasReachedDailyLimit() || !this.isRunning) {
          break;
        }

        // Random chance to skip (makes it less robotic)
        if (Math.random() < 0.3) {
          console.log('[Network Expander] Randomly skipping profile (more human-like)');
          continue;
        }

        const success = await this.sendConnectionRequestByButton(button, true);
        if (success) {
          connectedThisPage++;
          const totalConnected = connectionsAlreadySent + connectedThisPage;
          console.log(`[Network Expander] ✅ ${totalConnected}/${maxConnections} connections sent (${connectedThisPage} on this page)`);
        }

        // Long delay between requests (very important!)
        await this.humanDelay(10000, 30000); // 10-30 seconds between requests
      }

      const totalConnected = connectionsAlreadySent + connectedThisPage;
      console.log(`[Network Expander] ✅ Page ${currentPage} complete. Sent ${connectedThisPage} on this page, ${totalConnected} total.`);

      // Check if we need to go to the next page
      if (totalConnected < maxConnections && !this.hasReachedDailyLimit() && this.isRunning) {
        const nextBtn = this.findNextPageButton();

        if (nextBtn && !nextBtn.disabled) {
          console.log(`[Network Expander] 📄 Need ${maxConnections - totalConnected} more connections, going to next page...`);

          // Store pagination state before navigating
          const pending = localStorage.getItem('networkExpansionPending');
          if (pending) {
            const task = JSON.parse(pending);
            // Update task with pagination info
            task.connectionsAlreadySent = totalConnected;
            task.currentPage = currentPage + 1;
            task.timestamp = Date.now();
            localStorage.setItem('networkExpansionPending', JSON.stringify(task));
          }

          // Navigate to next page
          await this.humanDelay(2000, 4000); // Delay before clicking next
          nextBtn.click();

          // Return here - checkPendingExpansion will resume after page loads
          return totalConnected;
        } else {
          console.log('[Network Expander] No more pages available or Next button disabled');
        }
      }

      return totalConnected;

    } catch (error) {
      console.error('[Network Expander] Error processing page:', error);
      return connectionsAlreadySent;
    }
  }

  // Automated expansion: cycles through roles until daily limit reached
  async runAutomatedExpansion(rolesWithoutInvites = 0) {
    this.isRunning = true;
    const connectionsPerRole = this.settings.connectionsPerRole || 3;
    const maxDaily = this.settings.maxDailyInvites || 30;
    const roleCount = Math.max(1, (this.settings.targetRoles || []).length);

    if (rolesWithoutInvites >= roleCount) {
      console.log('[Network Expander] 🛑 No invitations could be sent for any role in a full rotation - stopping. Check the console messages above for the reason.');
      this.stopExpanding('no invitations could be sent');
      return;
    }

    console.log(`[Network Expander] 🎯 Target: ${maxDaily} connections total, ${connectionsPerRole} per role`);

    // Check if we've reached the limit
    if (this.hasReachedDailyLimit()) {
      console.log('[Network Expander] ✅ Daily limit already reached!');
      this.isRunning = false;
      localStorage.removeItem('networkExpansionPending');
      return;
    }

    const remaining = maxDaily - this.dailyLimits.invitesSent;
    console.log(`[Network Expander] 📊 Progress: ${this.dailyLimits.invitesSent}/${maxDaily} connections sent`);

    // Get next role in rotation
    const targetRole = this.getNextTargetRole();
    const connectionsThisRound = Math.min(connectionsPerRole, remaining);

    // Set current role for analytics tracking
    this.currentTargetRole = targetRole;

    console.log(`[Network Expander] 🔄 Searching for role: "${targetRole}" (${connectionsThisRound} connections)`);

    // Store automated expansion state before navigating
    localStorage.setItem('networkExpansionPending', JSON.stringify({
      automated: true,
      targetRole,
      maxConnections: connectionsThisRound,
      connectionsAlreadySent: 0,
      currentPage: 1,
      rolesWithoutInvites,
      timestamp: Date.now()
    }));

    // Build search URL
    let searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(targetRole)}`;
    if (this.settings.targetHiringOnly) {
      searchUrl += '&serviceCategories=%5B%22HIRING%22%5D';
    }

    // Navigate to search page (script will resume after page loads via checkPendingExpansion)
    console.log('[Network Expander] Navigating to:', searchUrl);
    window.location.href = searchUrl;
  }

  stopExpanding(reason = 'requested by user') {
    console.log('[Network Expander] Stopping:', reason);
    this.isRunning = false;
    localStorage.removeItem('networkExpansionPending');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      dailyLimits: this.dailyLimits,
      remainingInvites: Math.max(0, (this.settings.maxDailyInvites || 30) - this.dailyLimits.invitesSent)
    };
  }
}

// Export for use in main content script
window.NetworkExpander = NetworkExpander;
