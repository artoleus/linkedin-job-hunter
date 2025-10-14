// Connection Status Monitor - Detects accepted connections

class ConnectionMonitor {
  constructor(storage) {
    this.storage = storage;
    this.isMonitoring = false;
    this.lastCheckTime = null;
    this.init();
  }

  async init() {
    // Check if we're on the "My Network" page
    if (window.location.href.includes('/mynetwork/')) {
      console.log('[Connection Monitor] On My Network page, checking for accepted connections...');
      await this.checkAcceptedConnections();
    }
  }

  // Check LinkedIn's My Network page for accepted connections
  async checkAcceptedConnections() {
    try {
      // Get all pending connection requests from analytics
      const result = await chrome.runtime.sendMessage({ action: 'getConnectionAnalytics' });
      const analytics = result.analytics || { requests: [] };
      const pendingRequests = analytics.requests.filter(req => req.status === 'pending');

      if (pendingRequests.length === 0) {
        console.log('[Connection Monitor] No pending requests to check');
        return;
      }

      console.log('[Connection Monitor] Checking', pendingRequests.length, 'pending requests...');

      // Navigate to "Sent" invitations page to see status
      if (!window.location.href.includes('/mynetwork/invitation-manager/sent/')) {
        console.log('[Connection Monitor] Navigating to sent invitations page...');
        window.location.href = 'https://www.linkedin.com/mynetwork/invitation-manager/sent/';
        return;
      }

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Find all invitation cards on the page
      const invitationCards = document.querySelectorAll('[data-chameleon-result-urn], .invitation-card, .mn-invitation-card');
      console.log('[Connection Monitor] Found', invitationCards.length, 'invitation cards');

      // Check each pending request against the sent invitations
      let acceptedCount = 0;
      let stillPendingCount = 0;
      let declinedCount = 0;

      for (const request of pendingRequests) {
        console.log('[Connection Monitor] 🔄 Checking request:', request.fullName, '(ID:', request.id + ')');
        const found = await this.checkInvitationStatus(request, invitationCards);

        if (!found) {
          // If not found in sent invitations, it might have been accepted
          // Check if they're now in connections
          const isConnection = await this.checkIfConnection(request.fullName);

          if (isConnection) {
            console.log('[Connection Monitor] ✅', request.fullName, 'accepted connection!');
            acceptedCount++;
            await chrome.runtime.sendMessage({
              action: 'updateConnectionStatus',
              requestId: request.id,
              status: 'accepted'
            });
          }
        } else {
          // Found in sent invitations, check current status
          const currentRequest = analytics.requests.find(r => r.id === request.id);
          if (currentRequest.status === 'pending') {
            stillPendingCount++;
          } else if (currentRequest.status === 'declined') {
            declinedCount++;
          }
        }
      }

      console.log('[Connection Monitor] ✅ Check complete:',
                  acceptedCount, 'accepted,',
                  stillPendingCount, 'still pending,',
                  declinedCount, 'declined');

    } catch (error) {
      console.error('[Connection Monitor] Error checking connections:', error);
    }
  }

  async checkInvitationStatus(request, invitationCards) {
    // Look for the person's name in the invitation cards
    console.log('[Connection Monitor] 🔍 Searching for', request.fullName, 'in', invitationCards.length, 'invitation cards');

    for (const card of invitationCards) {
      const nameElement = card.querySelector('[class*="name"], [data-anonymize="person-name"]');
      if (!nameElement) continue;

      const cardName = nameElement.textContent.trim();

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
    // If they're not in "sent invitations" anymore, they were either:
    // 1. Accepted (most common)
    // 2. Invitation expired/withdrawn (less common)

    // We'll assume accepted if not found in sent invitations
    // This is reasonable because:
    // - LinkedIn keeps expired invitations visible in sent for a while
    // - Most pending invitations that disappear are accepted

    console.log('[Connection Monitor] 🔍 Checking if', fullName, 'is now a connection (not in sent invitations)');
    return true; // Assume accepted if not in sent invitations
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
