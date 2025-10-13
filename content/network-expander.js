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

    this.init();
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
          lastRoleIndex: 0  // Reset role rotation
        };
        this.saveDailyLimits();
      }
    } else {
      this.dailyLimits.lastResetDate = today;
      this.dailyLimits.lastRoleIndex = 0;
      this.saveDailyLimits();
    }
  }

  // Get next target role in rotation
  getNextTargetRole() {
    const targetRoles = this.settings.targetRoles || ['developer'];

    if (targetRoles.length === 0) {
      return 'developer';
    }

    // Get the last used role index, default to 0
    const lastIndex = this.dailyLimits.lastRoleIndex || 0;

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
  generatePersonalizedMessage(profileData) {
    // Different templates for hiring managers vs general networking
    const isHiringFocused = this.settings.targetHiringOnly;

    let templates;

    if (isHiringFocused) {
      // Templates for people who are actively hiring - shows openness to opportunities
      templates = [
        `Hi ${profileData.firstName}, I am currently reaching out to professionals in ${profileData.industry || 'the field'} who are hiring. I would appreciate the opportunity to connect, and I look forward to engaging with you personally about opportunities.`,

        `Hello ${profileData.firstName}, I noticed you are recruiting in ${profileData.industry || 'your area'}. I am connecting with hiring managers to explore opportunities, and I would value the chance to discuss roles with you directly.`,

        `Hi ${profileData.firstName}, I am expanding my network with professionals who are actively hiring in ${profileData.industry || 'the industry'}. I would be delighted to connect and engage with you about potential opportunities.`,

        `Hello ${profileData.firstName}, I came across your profile whilst connecting with people recruiting in ${profileData.industry || 'the field'}. I would appreciate the opportunity to connect and discuss opportunities with you personally.`,

        `Hi ${profileData.firstName}, I am reaching out to those hiring ${profileData.title ? 'for ' + profileData.title + ' roles' : 'in the sector'}. I would value the opportunity to connect and engage with you about openings you may have.`
      ];
    } else {
      // Templates for general professional networking - subtle openness to opportunities
      templates = [
        `Hi ${profileData.firstName}, I am currently reaching out to professionals in ${profileData.industry || 'the field'} to expand my network. I would appreciate the opportunity to connect, and I look forward to engaging with you personally.`,

        `Hello ${profileData.firstName}, I am connecting with professionals in ${profileData.industry || 'similar fields'}. I would value the opportunity to connect and engage with you about our shared interests.`,

        `Hi ${profileData.firstName}, I am expanding my network with professionals in ${profileData.industry || 'the industry'}. I would be delighted to connect and look forward to engaging with you about opportunities in the field.`,

        `Hello ${profileData.firstName}, I have been reaching out to ${profileData.title ? profileData.title + 's' : 'professionals'} to build connections in the industry. It would be great to connect and engage with you personally.`,

        `Hi ${profileData.firstName}, I am building connections with talented professionals in ${profileData.industry || 'this field'}. I would appreciate the opportunity to connect and look forward to engaging with you about the industry.`
      ];
    }

    // Randomly select a template
    const template = templates[Math.floor(Math.random() * templates.length)];

    return template;
  }

  // Extract basic info from profile element
  extractProfileInfo(profileElement) {
    try {
      // Try multiple selectors for name
      let nameElement = profileElement.querySelector('[class*="entity-result__title"]');

      if (!nameElement) {
        nameElement = profileElement.querySelector('.discover-entity-type-card__name');
      }

      if (!nameElement) {
        nameElement = profileElement.querySelector('[data-anonymize="person-name"]');
      }

      if (!nameElement) {
        // Try finding any link that looks like a profile name (usually the first prominent link)
        nameElement = profileElement.querySelector('a.app-aware-link span[aria-hidden="true"]');
      }

      const fullName = nameElement ? nameElement.textContent.trim() : '';
      const firstName = fullName.split(' ')[0] || 'there';

      console.log('[Network Expander] Extracted name:', fullName, 'from element:', nameElement?.className);

      const titleElement = profileElement.querySelector('[class*="entity-result__primary-subtitle"]') ||
                          profileElement.querySelector('.discover-entity-type-card__headline');
      const title = titleElement ? titleElement.textContent.trim() : '';

      const companyElement = profileElement.querySelector('[class*="entity-result__secondary-subtitle"]');
      const company = companyElement ? companyElement.textContent.trim() : '';

      // Try to extract industry from title or company
      const industry = this.guessIndustry(title, company);

      return {
        fullName,
        firstName,
        title,
        company,
        industry
      };
    } catch (error) {
      console.error('[Network Expander] Error extracting profile info:', error);
      return {
        fullName: 'there',
        firstName: 'there',
        title: '',
        company: '',
        industry: 'your field'
      };
    }
  }

  guessIndustry(title, company) {
    const keywords = {
      'software': ['developer', 'engineer', 'programmer', 'software', 'tech'],
      'marketing': ['marketing', 'growth', 'brand', 'digital marketing'],
      'sales': ['sales', 'account', 'business development'],
      'design': ['designer', 'ux', 'ui', 'creative'],
      'product': ['product', 'pm', 'product manager'],
      'data': ['data', 'analyst', 'analytics', 'scientist']
    };

    const combined = `${title} ${company}`.toLowerCase();

    for (const [industry, words] of Object.entries(keywords)) {
      if (words.some(word => combined.includes(word))) {
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
           this.dailyLimits.profilesViewed >= maxProfileViews;
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

  // Simulate viewing a profile (builds rapport before connecting)
  async viewProfile(profileUrl) {
    console.log('[Network Expander] Viewing profile:', profileUrl);

    // Open in current tab (more natural than iframe)
    window.location.href = profileUrl;

    this.dailyLimits.profilesViewed++;
    this.saveDailyLimits();

    // Wait for profile to load and simulate reading time
    await this.humanDelay(5000, 15000);
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

  // Send connection request using the button element directly
  async sendConnectionRequestByButton(connectBtn, withMessage = true) {
    try {
      // Extract profile info from aria-label
      const ariaLabel = connectBtn.getAttribute('aria-label') || '';
      const match = ariaLabel.match(/Invite (.+?) to connect/);
      const fullName = match ? match[1] : 'there';
      const firstName = fullName.split(' ')[0];

      console.log('[Network Expander] Preparing to connect with:', fullName);

      // Try to find the profile container to get more info
      const listItem = connectBtn.closest('li');
      let title = '';
      let company = '';

      if (listItem) {
        const titleElem = listItem.querySelector('[class*="entity-result__primary-subtitle"]');
        title = titleElem ? titleElem.textContent.trim() : '';

        const companyElem = listItem.querySelector('[class*="entity-result__secondary-subtitle"]');
        company = companyElem ? companyElem.textContent.trim() : '';
      }

      const industry = this.guessIndustry(title, company);
      const profileInfo = { fullName, firstName, title, company, industry };

      console.log('[Network Expander] Profile info:', profileInfo);

      // Click connect
      connectBtn.click();
      await this.humanDelay(1000, 2000);

      if (withMessage && this.settings.usePersonalizedMessages) {
        // Try to find "Add a note" button
        await this.humanDelay(500, 1000);

        const addNoteBtn = document.querySelector('button[aria-label*="Add a note"]');

        if (addNoteBtn) {
          addNoteBtn.click();
          await this.humanDelay(500, 1500);

          // Find message textarea
          const messageBox = document.querySelector('textarea[name="message"]') ||
                            document.querySelector('#custom-message');

          if (messageBox) {
            const message = this.generatePersonalizedMessage(profileInfo);

            // Type message character by character (more human-like)
            await this.typeMessage(messageBox, message);

            await this.humanDelay(1000, 2000);

            // Find and click send button
            const sendBtn = document.querySelector('button[aria-label*="Send"]') ||
                           document.querySelector('button[aria-label*="Done"]');

            if (sendBtn) {
              sendBtn.click();
              console.log('[Network Expander] ✅ Sent personalized request to:', fullName);

              this.dailyLimits.invitesSent++;
              this.saveDailyLimits();

              // Save to analytics
              await this.saveConnectionAnalytics(fullName, null, message);

              return true;
            }
          }
        }
      }

      // If no message option or skipping message, just send
      const sendBtn = document.querySelector('button[aria-label*="Send now"]') ||
                     document.querySelector('button[aria-label*="Send invitation"]');

      if (sendBtn) {
        sendBtn.click();
        console.log('[Network Expander] ✅ Sent connection request to:', fullName);

        this.dailyLimits.invitesSent++;
        this.saveDailyLimits();

        // Save to analytics
        await this.saveConnectionAnalytics(fullName, null, null);

        return true;
      }

      return false;

    } catch (error) {
      console.error('[Network Expander] Error sending connection:', error);
      return false;
    }
  }

  // Send connection request with personalized message
  async sendConnectionRequest(profileElement, withMessage = true) {
    try {
      const profileInfo = this.extractProfileInfo(profileElement);
      console.log('[Network Expander] Preparing to connect with:', profileInfo.fullName);

      // Try multiple selectors for connect button
      let connectBtn = profileElement.querySelector('button[aria-label*="Invite"]');

      if (!connectBtn) {
        connectBtn = profileElement.querySelector('button[aria-label*="Connect"]');
      }

      if (!connectBtn) {
        // Try finding by button text content (including nested spans)
        const buttons = profileElement.querySelectorAll('button');
        for (const btn of buttons) {
          // Check button text (may be in nested span with class artdeco-button__text)
          const text = btn.textContent.trim().toLowerCase();
          if (text === 'connect' || text === 'invite' || text.includes('connect')) {
            connectBtn = btn;
            break;
          }
        }
      }

      if (!connectBtn) {
        // Try finding span with artdeco-button__text class containing "Connect"
        const spans = profileElement.querySelectorAll('span.artdeco-button__text');
        for (const span of spans) {
          if (span.textContent.trim().toLowerCase() === 'connect') {
            connectBtn = span.closest('button');
            break;
          }
        }
      }

      if (!connectBtn) {
        console.log('[Network Expander] No connect button found, trying to log available buttons...');
        const allButtons = profileElement.querySelectorAll('button');
        console.log(`[Network Expander] Found ${allButtons.length} buttons in profile card:`);
        allButtons.forEach((btn, i) => {
          console.log(`  Button ${i}: "${btn.textContent.trim()}" aria-label="${btn.getAttribute('aria-label')}"`);
        });
        return false;
      }

      console.log('[Network Expander] Found connect button:', connectBtn.textContent.trim());

      // Click connect
      connectBtn.click();
      await this.humanDelay(1000, 2000);

      if (withMessage) {
        // Try to find "Add a note" button
        const addNoteBtn = document.querySelector('button[aria-label*="Add a note"]') ||
                          document.querySelector('button:has-text("Add a note")');

        if (addNoteBtn) {
          addNoteBtn.click();
          await this.humanDelay(500, 1500);

          // Find message textarea
          const messageBox = document.querySelector('textarea[name="message"]') ||
                            document.querySelector('#custom-message');

          if (messageBox) {
            const message = this.generatePersonalizedMessage(profileInfo);

            // Type message character by character (more human-like)
            await this.typeMessage(messageBox, message);

            await this.humanDelay(1000, 2000);

            // Find and click send button
            const sendBtn = document.querySelector('button[aria-label*="Send"]') ||
                           document.querySelector('button[aria-label*="Done"]');

            if (sendBtn) {
              sendBtn.click();
              console.log('[Network Expander] ✅ Sent personalized request to:', profileInfo.fullName);

              this.dailyLimits.invitesSent++;
              this.saveDailyLimits();

              return true;
            }
          }
        }
      }

      // If no message option or skipping message, just send
      const sendBtn = document.querySelector('button[aria-label*="Send now"]') ||
                     document.querySelector('button[aria-label*="Send invitation"]');

      if (sendBtn) {
        sendBtn.click();
        console.log('[Network Expander] ✅ Sent connection request to:', profileInfo.fullName);

        this.dailyLimits.invitesSent++;
        this.saveDailyLimits();

        return true;
      }

      return false;

    } catch (error) {
      console.error('[Network Expander] Error sending connection:', error);
      return false;
    }
  }

  // Type message character by character with human-like timing
  async typeMessage(element, message) {
    element.focus();
    element.value = '';

    for (let i = 0; i < message.length; i++) {
      element.value += message[i];

      // Trigger input event so React/Vue detects the change
      element.dispatchEvent(new Event('input', { bubbles: true }));

      // Random typing speed (50-150ms per character)
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

      // Occasional longer pause (like thinking)
      if (Math.random() < 0.1) {
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
      }
    }
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
    const pending = localStorage.getItem('networkExpansionPending');
    if (!pending) return;

    try {
      const task = JSON.parse(pending);

      // Check if task is less than 2 minutes old (avoid stale tasks)
      const age = Date.now() - task.timestamp;
      if (age > 120000) {
        console.log('[Network Expander] Pending task too old, ignoring');
        localStorage.removeItem('networkExpansionPending');
        return;
      }

      // Check if we're on a search results page
      if (window.location.href.includes('/search/results/people/')) {
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

          // After processing all pages for this role, continue to next role if not at limit
          if (!this.hasReachedDailyLimit()) {
            console.log('[Network Expander] Continuing automated expansion to next role...');
            await this.runAutomatedExpansion();
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
  async runAutomatedExpansion() {
    this.isRunning = true;
    const connectionsPerRole = this.settings.connectionsPerRole || 3;
    const maxDaily = this.settings.maxDailyInvites || 30;

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

  // Expand network for a single role
  async expandSingleRole(targetRole, maxConnections) {
    // Build search URL
    let searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(targetRole)}`;

    if (this.settings.targetHiringOnly) {
      searchUrl += '&serviceCategories=%5B%22HIRING%22%5D';
    }

    // Navigate to search page
    window.location.href = searchUrl;

    // Wait for navigation and page load
    await new Promise(resolve => {
      const checkPage = setInterval(() => {
        if (window.location.href.includes('/search/results/people/')) {
          clearInterval(checkPage);
          resolve();
        }
      }, 500);
    });

    // Wait for page to settle
    await this.humanDelay(5000, 8000);

    // Find and process connect buttons
    const connectButtons = this.findAllConnectButtons();
    console.log(`[Network Expander] Found ${connectButtons.length} Connect buttons`);

    if (connectButtons.length === 0) {
      console.log('[Network Expander] ⚠️ No Connect buttons found, skipping this role');
      return;
    }

    // Shuffle for randomization
    const shuffledButtons = this.shuffleArray([...connectButtons]);

    let connected = 0;
    for (const button of shuffledButtons) {
      if (connected >= maxConnections || this.hasReachedDailyLimit() || !this.isRunning) {
        break;
      }

      // Random skip
      if (Math.random() < 0.3) {
        console.log('[Network Expander] Randomly skipping (30% chance)');
        continue;
      }

      const success = await this.sendConnectionRequestByButton(button, true);
      if (success) {
        connected++;
        console.log(`[Network Expander] ✅ ${connected}/${maxConnections} for this role`);
      }

      // Delay between connections
      if (connected < maxConnections && !this.hasReachedDailyLimit() && this.isRunning) {
        await this.humanDelay(10000, 30000);
      }
    }

    console.log(`[Network Expander] Completed role "${targetRole}": ${connected} connections sent`);
  }

  stopExpanding() {
    console.log('[Network Expander] Stop requested by user');
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
