// Network crawler with human-like behavior and rate limiting

class NetworkCrawler {
  constructor(storage) {
    this.storage = storage;
    this.settings = {};
    this.isRunning = false;
    this.scanStats = {
      profilesScanned: 0,
      opportunitiesFound: 0
    };
    this.dailyLimits = {
      profiles: 0,
      lastResetDate: null
    };
    
    this.init();
  }

  async init() {
    this.settings = await this.storage.getSettings();
    await this.loadDailyLimits();
  }

  async loadDailyLimits() {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('jobHunterDailyLimits');
    
    if (stored) {
      this.dailyLimits = JSON.parse(stored);
      
      // Reset if it's a new day
      if (this.dailyLimits.lastResetDate !== today) {
        this.dailyLimits = {
          profiles: 0,
          lastResetDate: today
        };
        this.saveDailyLimits();
      }
    } else {
      this.dailyLimits.lastResetDate = today;
      this.saveDailyLimits();
    }
  }

  saveDailyLimits() {
    localStorage.setItem('jobHunterDailyLimits', JSON.stringify(this.dailyLimits));
  }

  // Main crawling method
  async startCrawling() {
    if (this.isRunning) {
      console.log('Crawler already running');
      return;
    }

    await this.init();

    if (!this.settings.scanEnabled) {
      console.log('Scanning disabled in settings');
      return;
    }

    if (this.hasReachedDailyLimit()) {
      console.log('Daily limit reached');
      return;
    }

    this.isRunning = true;
    console.log('Starting network crawl...');

    try {
      await this.crawlCurrentPage();
      await this.crawlConnections();
    } catch (error) {
      console.error('Crawling error:', error);
    } finally {
      this.isRunning = false;
      await this.storage.updateScanStats(this.scanStats);
    }
  }

  hasReachedDailyLimit() {
    const limit = this.settings.maxProfilesPerDay || 80;
    return this.dailyLimits.profiles >= limit;
  }

  async crawlCurrentPage() {
    console.log('Crawling current page for opportunities...');
    
    // Use job detector to scan current page
    if (window.JobDetector) {
      const detector = new window.JobDetector(this.storage);
      const opportunities = await detector.detectOpportunities();
      
      for (const opportunity of opportunities) {
        await this.storage.saveOpportunity(opportunity);
        this.scanStats.opportunitiesFound++;
      }
    }
  }

  async crawlConnections() {
    console.log('Starting connection crawl...');

    // Navigate to connections if not already there
    if (!window.location.href.includes('/mynetwork/')) {
      await this.navigateToConnections();
      await this.humanDelay();
    }

    const connectionUrls = await this.extractConnectionUrls();
    console.log(`Found ${connectionUrls.length} connection URLs`);

    for (let i = 0; i < connectionUrls.length && !this.hasReachedDailyLimit(); i++) {
      const url = connectionUrls[i];
      
      try {
        await this.visitProfile(url);
        await this.humanDelay();
        
        this.dailyLimits.profiles++;
        this.scanStats.profilesScanned++;
        this.saveDailyLimits();

      } catch (error) {
        console.error(`Error visiting profile ${url}:`, error);
      }
    }
  }

  async navigateToConnections() {
    return new Promise((resolve) => {
      // Find connections link
      const connectionsLink = document.querySelector('a[href*="/mynetwork/"]');
      if (connectionsLink) {
        this.simulateClick(connectionsLink);
        
        // Wait for page to load
        setTimeout(resolve, 2000 + Math.random() * 2000);
      } else {
        // Try direct navigation
        window.location.href = 'https://www.linkedin.com/mynetwork/invite-connect/connections/';
        setTimeout(resolve, 3000);
      }
    });
  }

  async extractConnectionUrls() {
    // Scroll to load more connections
    await this.scrollToLoadConnections();

    const connectionElements = document.querySelectorAll('a[href*="/in/"]');
    const urls = Array.from(connectionElements)
      .map(el => el.href)
      .filter(url => url.includes('/in/') && !url.includes('#'))
      .slice(0, this.settings.maxProfilesPerDay || 80);

    return [...new Set(urls)]; // Remove duplicates
  }

  async scrollToLoadConnections() {
    const scrolls = 3; // Limit scrolling to avoid detection
    
    for (let i = 0; i < scrolls; i++) {
      // Scroll with human-like behavior
      const scrollAmount = Math.random() * 500 + 300;
      window.scrollBy({
        top: scrollAmount,
        behavior: 'smooth'
      });
      
      await this.humanDelay(1000, 2000);
    }

    // Scroll back to top naturally
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    
    await this.humanDelay(500, 1000);
  }

  async visitProfile(url) {
    return new Promise((resolve, reject) => {
      // Create hidden iframe to visit profile without leaving current page
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      
      iframe.onload = async () => {
        try {
          // Try to analyze the profile content (limited by same-origin policy)
          await this.analyzeProfileFromIframe(iframe, url);
          document.body.removeChild(iframe);
          resolve();
        } catch (error) {
          document.body.removeChild(iframe);
          reject(error);
        }
      };

      iframe.onerror = () => {
        document.body.removeChild(iframe);
        reject(new Error('Failed to load profile'));
      };

      document.body.appendChild(iframe);
    });
  }

  async analyzeProfileFromIframe(iframe, url) {
    // Due to same-origin policy, we can't directly access iframe content
    // Instead, we'll use alternative methods or navigate directly (more risky)
    
    // For now, just record that we visited this profile
    const opportunity = {
      type: 'profile_visit',
      source: 'network_crawl',
      title: 'Profile scanned for opportunities',
      url: url,
      confidence: 0.2,
      dateScanned: new Date().toISOString()
    };

    // Only save if it looks like a potential lead
    if (this.isProfileUrlRelevant(url)) {
      await this.storage.saveOpportunity(opportunity);
    }
  }

  isProfileUrlRelevant(url) {
    const relevantKeywords = this.settings.targetRoles || [];
    const urlLower = url.toLowerCase();
    
    return relevantKeywords.some(keyword => 
      urlLower.includes(keyword.toLowerCase())
    );
  }

  // Human-like behavior simulation
  async humanDelay(minMs = null, maxMs = null) {
    const min = minMs || this.settings.minDelay || 2000;
    const max = maxMs || this.settings.maxDelay || 8000;
    const delay = Math.random() * (max - min) + min;
    
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  simulateClick(element) {
    // Simulate more human-like clicking
    const rect = element.getBoundingClientRect();
    const x = rect.left + Math.random() * rect.width;
    const y = rect.top + Math.random() * rect.height;

    // Create and dispatch mouse events
    const mousedown = new MouseEvent('mousedown', {
      clientX: x,
      clientY: y,
      bubbles: true
    });
    
    const mouseup = new MouseEvent('mouseup', {
      clientX: x,
      clientY: y,
      bubbles: true
    });
    
    const click = new MouseEvent('click', {
      clientX: x,
      clientY: y,
      bubbles: true
    });

    element.dispatchEvent(mousedown);
    setTimeout(() => element.dispatchEvent(mouseup), 50 + Math.random() * 100);
    setTimeout(() => element.dispatchEvent(click), 100 + Math.random() * 100);
  }

  simulateHumanScrolling() {
    const scrollPatterns = [
      () => window.scrollBy(0, 200 + Math.random() * 300),
      () => window.scrollBy(0, -(100 + Math.random() * 200)),
      () => window.scrollBy(0, 500 + Math.random() * 300)
    ];

    const pattern = scrollPatterns[Math.floor(Math.random() * scrollPatterns.length)];
    pattern();
  }

  // Stop crawling
  stopCrawling() {
    this.isRunning = false;
    console.log('Crawler stopped');
  }

  // Get current status
  getStatus() {
    return {
      isRunning: this.isRunning,
      dailyLimits: this.dailyLimits,
      scanStats: this.scanStats,
      remainingScans: Math.max(0, (this.settings.maxProfilesPerDay || 80) - this.dailyLimits.profiles)
    };
  }
}

// Export for use in main content script
window.NetworkCrawler = NetworkCrawler;