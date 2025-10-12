// Job opportunity detection logic

class JobDetector {
  constructor(storage) {
    this.storage = storage;
    this.settings = {};
    this.init();
  }

  async init() {
    this.settings = await this.storage.getSettings();
  }

  // Main detection method
  async detectOpportunities() {
    const opportunities = [];

    try {
      // Detect from feed posts
      const feedOpportunities = await this.scanFeedPosts();
      opportunities.push(...feedOpportunities);

      // Detect from profile changes
      const profileOpportunities = await this.scanProfileChanges();
      opportunities.push(...profileOpportunities);

      // Detect from company updates
      const companyOpportunities = await this.scanCompanyUpdates();
      opportunities.push(...companyOpportunities);

    } catch (error) {
      console.error('Job detection error:', error);
    }

    return opportunities;
  }

  async scanFeedPosts() {
    const opportunities = [];

    // Try multiple selectors for LinkedIn posts
    let posts = document.querySelectorAll('[data-urn*="activity"]');
    console.log(`[Job Hunter] Found ${posts.length} posts with selector [data-urn*="activity"]`);

    // If that doesn't work, try alternative selectors
    if (posts.length === 0) {
      posts = document.querySelectorAll('.feed-shared-update-v2');
      console.log(`[Job Hunter] Trying alternative: found ${posts.length} posts with .feed-shared-update-v2`);
    }

    if (posts.length === 0) {
      posts = document.querySelectorAll('[data-id*="urn:li:activity"]');
      console.log(`[Job Hunter] Trying alternative: found ${posts.length} posts with [data-id*="urn:li:activity"]`);
    }

    if (posts.length === 0) {
      console.log('[Job Hunter] ⚠️ Could not find any posts on the page. Trying generic post container...');
      posts = document.querySelectorAll('.feed-shared-update-v2, [class*="feed"], [class*="update"]');
      console.log(`[Job Hunter] Generic search found ${posts.length} elements`);
    }

    console.log(`[Job Hunter] Scanning ${posts.length} posts`);
    console.log(`[Job Hunter] Looking for keywords:`, this.settings.keywords);

    for (const post of posts) {
      const opportunity = await this.analyzePost(post);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    console.log(`[Job Hunter] Found ${opportunities.length} opportunities in feed`);
    return opportunities;
  }

  async analyzePost(postElement) {
    try {
      const textContent = postElement.textContent.toLowerCase();

      // Check for hiring keywords
      const hasHiringKeywords = this.settings.keywords?.some(keyword =>
        textContent.includes(keyword.toLowerCase())
      );

      const hasExcludeKeywords = this.settings.excludeKeywords?.some(keyword =>
        textContent.includes(keyword.toLowerCase())
      );

      if (!hasHiringKeywords) {
        // Log first 150 chars of skipped posts to see what we're missing
        if (Math.random() < 0.2) {  // Log 20% of skipped posts
          console.log('[Job Hunter] Post skipped (no keywords):', textContent.substring(0, 150).replace(/\s+/g, ' '));
        }
        return null;
      }

      if (hasExcludeKeywords) {
        console.log('[Job Hunter] Post skipped - has exclude keywords');
        return null;
      }

      console.log('[Job Hunter] 🎯 Found potential opportunity!', textContent.substring(0, 150).replace(/\s+/g, ' '));

      // Extract post details
      const authorElement = postElement.querySelector('[data-urn*="member"]');
      const author = authorElement ? this.extractPersonInfo(authorElement) : null;
      
      const contentElement = postElement.querySelector('.break-words');
      const content = contentElement ? contentElement.textContent.trim() : '';

      const timeElement = postElement.querySelector('time');
      const timePosted = timeElement ? timeElement.getAttribute('datetime') : null;

      // Extract links in the post
      const links = Array.from(postElement.querySelectorAll('a')).map(a => a.href);

      const opportunity = {
        type: 'feed_post',
        source: 'linkedin_feed',
        title: this.extractJobTitle(content),
        company: author?.company || this.extractCompanyFromPost(content),
        author: author,
        content: content.substring(0, 500), // Limit content length
        url: this.extractPostUrl(postElement),
        timePosted,
        links,
        keywords: this.extractMatchingKeywords(content),
        confidence: this.calculateConfidence(content)
      };

      return opportunity;

    } catch (error) {
      console.error('Error analyzing post:', error);
      return null;
    }
  }

  async scanProfileChanges() {
    // This would scan for profile changes indicating new hiring managers
    // or people who recently changed jobs and might be hiring
    const opportunities = [];
    
    const profiles = document.querySelectorAll('[data-urn*="member"]');
    for (const profile of profiles) {
      const change = await this.analyzeProfileChange(profile);
      if (change) {
        opportunities.push(change);
      }
    }

    return opportunities;
  }

  async analyzeProfileChange(profileElement) {
    // Look for recent job changes, new titles like "Hiring Manager", etc.
    try {
      const titleElement = profileElement.querySelector('.text-body-medium-bold');
      const title = titleElement ? titleElement.textContent : '';

      const hiringIndicators = [
        'hiring manager',
        'talent acquisition',
        'recruiter',
        'head of engineering',
        'engineering manager',
        'team lead'
      ];

      const isHiringRole = hiringIndicators.some(indicator => 
        title.toLowerCase().includes(indicator)
      );

      if (!isHiringRole) {
        return null;
      }

      return {
        type: 'profile_change',
        source: 'linkedin_profile',
        title: `Potential hiring contact: ${title}`,
        person: this.extractPersonInfo(profileElement),
        confidence: 0.6
      };

    } catch (error) {
      console.error('Error analyzing profile change:', error);
      return null;
    }
  }

  async scanCompanyUpdates() {
    // Scan for company page updates about hiring
    const opportunities = [];
    
    const companyPosts = document.querySelectorAll('[data-urn*="company"]');
    for (const post of companyPosts) {
      const opportunity = await this.analyzeCompanyPost(post);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    return opportunities;
  }

  async analyzeCompanyPost(postElement) {
    try {
      const textContent = postElement.textContent.toLowerCase();
      
      const companyHiringKeywords = [
        'we are hiring',
        'join our team', 
        'open positions',
        'career opportunities',
        'growing team'
      ];

      const hasCompanyKeywords = companyHiringKeywords.some(keyword =>
        textContent.includes(keyword)
      );

      if (!hasCompanyKeywords) {
        return null;
      }

      const companyElement = postElement.querySelector('[data-urn*="company"]');
      const company = companyElement ? this.extractCompanyInfo(companyElement) : null;

      return {
        type: 'company_update',
        source: 'linkedin_company',
        title: 'Company hiring announcement',
        company: company?.name,
        content: textContent.substring(0, 300),
        url: this.extractPostUrl(postElement),
        confidence: 0.8
      };

    } catch (error) {
      console.error('Error analyzing company post:', error);
      return null;
    }
  }

  // Helper methods
  extractPersonInfo(element) {
    try {
      const nameElement = element.querySelector('.text-body-medium-bold');
      const name = nameElement ? nameElement.textContent.trim() : '';
      
      const titleElement = element.querySelector('.text-body-small');
      const title = titleElement ? titleElement.textContent.trim() : '';
      
      const profileUrl = element.querySelector('a')?.href || '';

      return { name, title, profileUrl };
    } catch (error) {
      return null;
    }
  }

  extractCompanyInfo(element) {
    try {
      const nameElement = element.querySelector('.text-body-medium-bold');
      const name = nameElement ? nameElement.textContent.trim() : '';
      
      const companyUrl = element.querySelector('a')?.href || '';

      return { name, companyUrl };
    } catch (error) {
      return null;
    }
  }

  extractJobTitle(content) {
    const titlePatterns = [
      /hiring\s+(?:a\s+)?([^.!?]+?)(?:\s+at\s+|\s+for\s+|\.|\!|\?|$)/i,
      /looking\s+for\s+(?:a\s+)?([^.!?]+?)(?:\s+to\s+|\s+at\s+|\.|\!|\?|$)/i,
      /seeking\s+(?:a\s+)?([^.!?]+?)(?:\s+to\s+|\s+at\s+|\.|\!|\?|$)/i
    ];

    for (const pattern of titlePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return 'Job Opportunity';
  }

  extractCompanyFromPost(content) {
    const companyPatterns = [
      /at\s+([A-Z][A-Za-z\s]+?)(?:\s+we|\s+is|\s+has|\.|\!|\?|$)/,
      /join\s+([A-Z][A-Za-z\s]+?)(?:\s+team|\s+as|\.|\!|\?|$)/i
    ];

    for (const pattern of companyPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  extractPostUrl(postElement) {
    const linkElement = postElement.querySelector('a[href*="/posts/"]');
    return linkElement ? linkElement.href : window.location.href;
  }

  extractMatchingKeywords(content) {
    const lowercaseContent = content.toLowerCase();
    return this.settings.keywords?.filter(keyword =>
      lowercaseContent.includes(keyword.toLowerCase())
    ) || [];
  }

  calculateConfidence(content) {
    let confidence = 0.3;
    
    const highConfidenceKeywords = ['we are hiring', 'join our team', 'open position'];
    const mediumConfidenceKeywords = ['hiring', 'looking for', 'career'];
    
    highConfidenceKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword)) {
        confidence += 0.3;
      }
    });
    
    mediumConfidenceKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword)) {
        confidence += 0.1;
      }
    });

    return Math.min(confidence, 1.0);
  }
}

// Export for use in main content script
window.JobDetector = JobDetector;