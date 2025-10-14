// Connection Status Monitor - Detects accepted connections

class ConnectionMonitor {
  constructor(storage) {
    this.storage = storage;
    this.isMonitoring = false;
    this.lastCheckTime = null;
    this.init();
  }

  async init() {
    // Check if we're on the sent invitations page
    if (window.location.href.includes('/mynetwork/invitation-manager/sent/')) {
      console.log('[Connection Monitor] On sent invitations page, checking status...');
      await this.checkSentInvitations();
    }
    // Check if we're on the connections page
    else if (window.location.href.includes('/mynetwork/invite-connect/connections/')) {
      console.log('[Connection Monitor] On connections page, checking for accepted...');
      await this.checkConnectionsPage();
    }
  }

  // Check sent invitations page to see what's still pending
  async checkSentInvitations() {
    try {
      // Get all pending connection requests from analytics
      const result = await chrome.runtime.sendMessage({ action: 'getConnectionAnalytics' });
      const analytics = result.analytics || { requests: [] };
      const pendingRequests = analytics.requests.filter(req => req.status === 'pending');

      if (pendingRequests.length === 0) {
        console.log('[Connection Monitor] No pending requests to check');
        return;
      }

      console.log('[Connection Monitor] Checking', pendingRequests.length, 'pending requests on sent invitations page...');

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Find all invitation cards on the page - try multiple selectors
      let invitationCards = [];

      const selectors = [
        'li[data-chameleon-result-urn]',
        'li.invitation-card',
        'li.mn-invitation-card',
        'li[class*="reusable-search__result"]',
        'ul.reusable-search__entity-result-list li',
        '[data-view-name="sent-invitations-list"] li',
        '.artdeco-list li'
      ];

      console.log('[Connection Monitor] Trying', selectors.length, 'different selectors...');

      for (const selector of selectors) {
        invitationCards = document.querySelectorAll(selector);
        console.log('[Connection Monitor] Selector "' + selector + '" found', invitationCards.length, 'cards');
        if (invitationCards.length > 0) {
          console.log('[Connection Monitor] ✅ Using selector:', selector);
          break;
        }
      }

      if (invitationCards.length === 0) {
        console.warn('[Connection Monitor] ⚠️ No invitation cards found with any selector!');
        console.warn('[Connection Monitor] Available list elements:', document.querySelectorAll('li').length);
        console.warn('[Connection Monitor] Available ul elements:', document.querySelectorAll('ul').length);

        // Try to find ANY list items that might contain names
        const allLi = document.querySelectorAll('li');
        console.warn('[Connection Monitor] Checking all', allLi.length, 'li elements for names...');

        // Filter to only list items that contain what looks like a name
        invitationCards = Array.from(allLi).filter(li => {
          const text = li.textContent;
          return text.includes('Sent today') || text.includes('Withdraw') ||
                 (text.match(/[A-Z][a-z]+ [A-Z][a-z]+/) && text.length < 500);
        });

        console.warn('[Connection Monitor] Found', invitationCards.length, 'li elements that might be invitation cards');
      }

      // Check each pending request against the sent invitations
      let stillPendingCount = 0;
      const foundInSent = new Set();

      for (const request of pendingRequests) {
        console.log('[Connection Monitor] 🔄 Checking request:', request.fullName, '(ID:', request.id + ')');
        const found = await this.checkInvitationStatus(request, invitationCards);

        if (found) {
          // Found in sent invitations and still pending
          stillPendingCount++;
          foundInSent.add(request.id);
        } else {
          // Not found in sent invitations - might be accepted or declined
          console.log('[Connection Monitor] 📋', request.fullName, 'not in sent invitations');
        }
      }

      console.log('[Connection Monitor] ✅ Sent invitations check complete:',
                  stillPendingCount, 'found in sent invitations,',
                  (pendingRequests.length - stillPendingCount), 'not found (need to check connections)');

      // If some requests weren't found in sent invitations, check connections page
      if (stillPendingCount < pendingRequests.length) {
        console.log('[Connection Monitor] 🔗 Navigating to connections page to check for acceptances...');
        window.location.href = 'https://www.linkedin.com/mynetwork/invite-connect/connections/';
        return;
      }

      console.log('[Connection Monitor] ✅ All pending requests are still in sent invitations (none accepted yet)');

    } catch (error) {
      console.error('[Connection Monitor] Error checking sent invitations:', error);
    }
  }

  // Check connections page to see who has accepted
  async checkConnectionsPage() {
    try {
      // Get all pending connection requests from analytics
      const result = await chrome.runtime.sendMessage({ action: 'getConnectionAnalytics' });
      const analytics = result.analytics || { requests: [] };
      const pendingRequests = analytics.requests.filter(req => req.status === 'pending');

      if (pendingRequests.length === 0) {
        console.log('[Connection Monitor] No pending requests to check for acceptance');
        return;
      }

      console.log('[Connection Monitor] Checking', pendingRequests.length, 'pending requests on connections page...');

      // Wait for page to load and scroll to trigger lazy loading
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Scroll down to load more connections
      console.log('[Connection Monitor] Scrolling to load connections...');
      window.scrollTo(0, 500);
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.scrollTo(0, 1000);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find all connection cards - try multiple selectors
      let connectionCards = [];

      const selectors = [
        'li[class*="mn-connection-card"]',
        'li.reusable-search__result-container',
        'li[data-chameleon-result-urn]',
        'ul.reusable-search__entity-result-list li',
        '[data-view-name="connections-list"] li',
        '.artdeco-list li'
      ];

      console.log('[Connection Monitor] Trying', selectors.length, 'different selectors for connections...');

      for (const selector of selectors) {
        connectionCards = document.querySelectorAll(selector);
        console.log('[Connection Monitor] Selector "' + selector + '" found', connectionCards.length, 'cards');
        if (connectionCards.length > 0) {
          console.log('[Connection Monitor] ✅ Using selector:', selector);
          break;
        }
      }

      if (connectionCards.length === 0) {
        console.warn('[Connection Monitor] ⚠️ No connection cards found with any selector!');
        console.warn('[Connection Monitor] Available list elements:', document.querySelectorAll('li').length);

        // Try to find ANY list items on the page
        const allLi = document.querySelectorAll('li');
        console.warn('[Connection Monitor] Checking all', allLi.length, 'li elements...');

        // Filter to items that look like connection cards (have names and reasonable length)
        connectionCards = Array.from(allLi).filter(li => {
          const text = li.textContent;
          return text.match(/[A-Z][a-z]+ [A-Z][a-z]+/) && text.length > 20 && text.length < 500;
        });

        console.warn('[Connection Monitor] Found', connectionCards.length, 'li elements that might be connection cards');
      }

      let acceptedCount = 0;

      // If we have connection cards, search within them
      if (connectionCards.length > 0) {
        for (const request of pendingRequests) {
          console.log('[Connection Monitor] 🔍 Looking for', request.fullName, 'in', connectionCards.length, 'connection cards...');
          let found = false;

          for (const card of connectionCards) {
            const cardText = card.textContent;

            if (this.namesMatch(cardText, request.fullName)) {
              console.log('[Connection Monitor] ✅', request.fullName, 'found in connections - ACCEPTED!');
              found = true;
              acceptedCount++;

              await chrome.runtime.sendMessage({
                action: 'updateConnectionStatus',
                requestId: request.id,
                status: 'accepted'
              });

              break;
            }
          }

          if (!found) {
            console.log('[Connection Monitor] ℹ️', request.fullName, 'not found in visible connection cards');
          }
        }
      } else {
        // Fallback: search the entire page body for names
        console.warn('[Connection Monitor] No cards found, searching entire page text...');
        const pageText = document.body.textContent;

        for (const request of pendingRequests) {
          console.log('[Connection Monitor] 🔍 Looking for', request.fullName, 'in page text...');

          if (this.namesMatch(pageText, request.fullName)) {
            console.log('[Connection Monitor] ✅', request.fullName, 'found on page - LIKELY ACCEPTED!');
            acceptedCount++;

            await chrome.runtime.sendMessage({
              action: 'updateConnectionStatus',
              requestId: request.id,
              status: 'accepted'
            });
          } else {
            console.log('[Connection Monitor] ℹ️', request.fullName, 'not found on page');
          }
        }
      }

      console.log('[Connection Monitor] ✅ Connections page check complete:', acceptedCount, 'accepted');

      if (acceptedCount === 0 && pendingRequests.length > 0) {
        console.warn('[Connection Monitor] ⚠️ No acceptances found. This could mean:');
        console.warn('  1. No connections have been accepted yet');
        console.warn('  2. Accepted connections are not on the first page');
        console.warn('  3. Card selectors need adjustment');
        console.warn('[Connection Monitor] Sample card text:', connectionCards.length > 0 ? connectionCards[0].textContent.substring(0, 200) : 'No cards found');
      }

      // Clear progress
      localStorage.removeItem('connectionCheckProgress');

    } catch (error) {
      console.error('[Connection Monitor] Error checking connections page:', error);
    }
  }

  // Main entry point - called when button is clicked
  async checkAcceptedConnections() {
    // Navigate to sent invitations page first
    console.log('[Connection Monitor] Starting connection check process...');
    window.location.href = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';
  }

  async checkInvitationStatus(request, invitationCards) {
    // Look for the person's name in the invitation cards
    console.log('[Connection Monitor] 🔍 Searching for', request.fullName, 'in', invitationCards.length, 'invitation cards');

    for (const card of invitationCards) {
      // Try multiple selectors for name element
      let nameElement = card.querySelector('[class*="name"]');

      if (!nameElement) {
        nameElement = card.querySelector('[data-anonymize="person-name"]');
      }

      if (!nameElement) {
        nameElement = card.querySelector('span.name, .mn-connection-card__name, .invitation-card__name');
      }

      if (!nameElement) {
        nameElement = card.querySelector('span[aria-hidden="true"]');
      }

      if (!nameElement) {
        // Try to find any prominent text element that might be the name
        const spans = card.querySelectorAll('span');
        for (const span of spans) {
          const text = span.textContent.trim();
          if (text.length > 3 && text.includes(' ') && !text.includes('Sent') && !text.includes('Withdraw')) {
            nameElement = span;
            break;
          }
        }
      }

      if (!nameElement) {
        console.log('[Connection Monitor] ⚠️ No name element found in card:', card.innerHTML.substring(0, 200));
        continue;
      }

      const cardName = nameElement.textContent.trim();
      console.log('[Connection Monitor] 📝 Found name in card:', cardName);

      // Check if names match (fuzzy match)
      if (this.namesMatch(cardName, request.fullName)) {
        console.log('[Connection Monitor] ✅ Found matching card for', request.fullName);
        // Check if invitation was withdrawn or is still pending
        const withdrawnText = card.textContent.toLowerCase();

        if (withdrawnText.includes('withdrawn') || withdrawnText.includes('expired')) {
          console.log('[Connection Monitor] 🔴', request.fullName, 'invitation withdrawn/expired');
          await chrome.runtime.sendMessage({
            action: 'updateConnectionStatus',
            requestId: request.id,
            status: 'declined'
          });
          return true;
        }

        // Still pending
        console.log('[Connection Monitor] ⏳', request.fullName, 'still pending');
        return true;
      }
    }

    console.log('[Connection Monitor] ❌ Not found in sent invitations:', request.fullName);
    return false; // Not found in sent invitations
  }

  async checkIfConnection(fullName) {
    // Check if person is now in connections
    // If they're not in "sent invitations" anymore, we should NOT assume they were accepted
    // They might have:
    // 1. Declined the invitation
    // 2. Let it expire
    // 3. Actually accepted

    // We need to actually verify they're in connections
    console.log('[Connection Monitor] 🔍 Would need to check connections page for', fullName);
    console.log('[Connection Monitor] ⚠️ Cannot verify acceptance without checking connections page');

    // For now, do NOT mark as accepted
    // This is more conservative and prevents false positives
    return false; // Don't assume acceptance
  }

  namesMatch(name1, name2) {
    // Simple name matching - remove extra spaces, compare lowercase
    const n1 = name1.toLowerCase().replace(/\s+/g, ' ').trim();
    const n2 = name2.toLowerCase().replace(/\s+/g, ' ').trim();

    // Exact match
    if (n1 === n2) return true;

    // Check if one is substring of other (for "John Smith" vs "John M. Smith")
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Check first and last name match
    const parts1 = n1.split(' ');
    const parts2 = n2.split(' ');

    if (parts1.length >= 2 && parts2.length >= 2) {
      const first1 = parts1[0];
      const last1 = parts1[parts1.length - 1];
      const first2 = parts2[0];
      const last2 = parts2[parts2.length - 1];

      return first1 === first2 && last1 === last2;
    }

    return false;
  }

  // Manual method to check all pending connections
  async checkAllPendingConnections() {
    console.log('[Connection Monitor] 🔍 Checking all pending connections...');

    if (!window.location.href.includes('/mynetwork/')) {
      console.log('[Connection Monitor] Navigating to My Network...');
      window.location.href = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';
      return;
    }

    await this.checkAcceptedConnections();
  }
}

// Export for use in main content script
window.ConnectionMonitor = ConnectionMonitor;
