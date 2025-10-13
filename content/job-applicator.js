// Job Application Automation with Easy Apply

class JobApplicator {
  constructor(storage) {
    this.storage = storage;
    this.settings = {};
    this.dailyLimits = {
      applicationsSubmitted: 0,
      lastResetDate: null
    };
    this.isRunning = false;
    this.homeLocation = {
      address: 'Sittingbourne, Kent, UK',
      lat: 51.3411,
      lng: 0.7337
    };

    this.init();
  }

  async init() {
    this.settings = await this.storage.getSettings();
    await this.loadDailyLimits();

    // Update home location from settings
    if (this.settings.homeLocation) {
      this.homeLocation = this.settings.homeLocation;
    }
  }

  async loadDailyLimits() {
    const today = new Date().toDateString();
    const stored = localStorage.getItem('jobApplicatorLimits');

    if (stored) {
      this.dailyLimits = JSON.parse(stored);

      // Reset if it's a new day
      if (this.dailyLimits.lastResetDate !== today) {
        this.dailyLimits = {
          applicationsSubmitted: 0,
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
    localStorage.setItem('jobApplicatorLimits', JSON.stringify(this.dailyLimits));
  }

  hasReachedDailyLimit() {
    const maxApplications = this.settings.maxDailyApplications || 20;
    return this.dailyLimits.applicationsSubmitted >= maxApplications;
  }

  // Flexible role matching - checks if any keyword from target roles appears in job title
  matchesTargetRoles(jobTitle, targetRoles) {
    if (!targetRoles || targetRoles.length === 0) return false;

    const titleLower = jobTitle.toLowerCase();

    // Check each target role
    for (const role of targetRoles) {
      const roleLower = role.toLowerCase().trim();

      // Split role into individual keywords (e.g., "IT Manager" -> ["it", "manager"])
      const keywords = roleLower.split(/\s+/);

      // Check if ALL keywords from this role appear in the title (order doesn't matter)
      const allKeywordsMatch = keywords.every(keyword => {
        // Handle common abbreviations and variations
        if (keyword === 'grc') {
          return titleLower.includes('grc') || titleLower.includes('governance') ||
                 titleLower.includes('risk') || titleLower.includes('compliance');
        }
        if (keyword === 'vciso' || keyword === 'ciso') {
          return titleLower.includes('ciso') || titleLower.includes('vciso') ||
                 (titleLower.includes('security') && titleLower.includes('officer'));
        }
        if (keyword === 'ai') {
          return titleLower.includes(' ai ') || titleLower.includes('ai ') ||
                 titleLower.includes(' ai') || titleLower.includes('artificial intelligence');
        }
        if (keyword === 'iso27001') {
          return titleLower.includes('iso') || titleLower.includes('27001') ||
                 titleLower.includes('information security');
        }

        // Standard keyword check
        return titleLower.includes(keyword);
      });

      if (allKeywordsMatch) {
        console.log('[Job Applicator] ✅ Matched role:', role, 'in title:', jobTitle);
        return true;
      }
    }

    return false;
  }

  // Calculate distance between two coordinates using Haversine formula
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in miles
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  // Estimate location coordinates from city/region name
  // This is a simplified version - in production, you'd use a geocoding API
  estimateLocationCoordinates(locationStr) {
    const locationStr_lower = locationStr.toLowerCase();

    // UK major cities/regions (approximate coordinates)
    const ukLocations = {
      'london': { lat: 51.5074, lng: -0.1278 },
      'manchester': { lat: 53.4808, lng: -2.2426 },
      'birmingham': { lat: 52.4862, lng: -1.8904 },
      'leeds': { lat: 53.8008, lng: -1.5491 },
      'liverpool': { lat: 53.4084, lng: -2.9916 },
      'bristol': { lat: 51.4545, lng: -2.5879 },
      'sheffield': { lat: 53.3811, lng: -1.4701 },
      'edinburgh': { lat: 55.9533, lng: -3.1883 },
      'cardiff': { lat: 51.4816, lng: -3.1791 },
      'cambridge': { lat: 52.2053, lng: 0.1218 },
      'oxford': { lat: 51.7520, lng: -1.2577 },
      'kent': { lat: 51.2787, lng: 0.5217 },
      'sittingbourne': { lat: 51.3411, lng: 0.7337 },
      'canterbury': { lat: 51.2802, lng: 1.0789 },
      'maidstone': { lat: 51.2704, lng: 0.5227 }
    };

    // Check for matches in location string
    for (const [city, coords] of Object.entries(ukLocations)) {
      if (locationStr_lower.includes(city)) {
        return coords;
      }
    }

    // If remote, return null (no distance check needed)
    if (locationStr_lower.includes('remote')) {
      return null;
    }

    // Default: assume it's far away if we can't determine
    return { lat: 0, lng: 0 };
  }

  // Check if job matches criteria
  async matchesJobCriteria(jobCard) {
    try {
      const jobTitle = this.extractJobTitle(jobCard);
      const company = this.extractCompany(jobCard);
      const location = this.extractLocation(jobCard);
      const workType = this.detectWorkType(jobCard, location);
      const salary = this.extractSalary(jobCard);

      console.log('[Job Applicator] Analyzing job:', {
        jobTitle,
        company,
        location,
        workType,
        salary
      });

      // Check role match - use flexible keyword matching
      const targetRoles = this.settings.targetJobRoles || this.settings.targetRoles || [];
      const roleMatches = this.matchesTargetRoles(jobTitle, targetRoles);

      if (!roleMatches) {
        console.log('[Job Applicator] Job title does not match target roles');
        console.log('[Job Applicator] Title:', jobTitle);
        console.log('[Job Applicator] Target roles:', targetRoles);
        return { matches: false, reason: 'Title does not match target roles' };
      }

      // Check work type
      const allowedWorkTypes = this.settings.workTypes || ['remote', 'hybrid'];
      if (!allowedWorkTypes.includes(workType)) {
        console.log('[Job Applicator] Work type not allowed:', workType);
        return { matches: false, reason: 'Work type not allowed' };
      }

      // Check distance for hybrid roles
      if (workType === 'hybrid') {
        const maxDistance = this.settings.maxHybridDistance || 75;
        const jobCoords = this.estimateLocationCoordinates(location);

        if (jobCoords) {
          const distance = this.calculateDistance(
            this.homeLocation.lat,
            this.homeLocation.lng,
            jobCoords.lat,
            jobCoords.lng
          );

          console.log('[Job Applicator] Distance from Sittingbourne:', Math.round(distance), 'miles');

          if (distance > maxDistance) {
            return {
              matches: false,
              reason: `Hybrid role too far (${Math.round(distance)} miles > ${maxDistance} miles)`,
              distance
            };
          }
        }
      }

      // Check salary if provided
      if (salary && salary.min > 0) {
        const minSalary = this.settings.minSalary || 0;
        const maxSalary = this.settings.maxSalary || Infinity;

        if (salary.min < minSalary || salary.max > maxSalary) {
          console.log('[Job Applicator] Salary out of range');
          return { matches: false, reason: 'Salary out of range' };
        }
      }

      return {
        matches: true,
        jobData: {
          jobTitle,
          company,
          location,
          workType,
          salary: salary ? `£${salary.min}-${salary.max}` : null,
          distance: workType === 'hybrid' ? this.calculateDistance(
            this.homeLocation.lat,
            this.homeLocation.lng,
            this.estimateLocationCoordinates(location)?.lat || 0,
            this.estimateLocationCoordinates(location)?.lng || 0
          ) : null
        }
      };

    } catch (error) {
      console.error('[Job Applicator] Error matching job criteria:', error);
      return { matches: false, reason: 'Error analyzing job' };
    }
  }

  extractJobTitle(jobCard) {
    const titleElement = jobCard.querySelector('.job-card-list__title, .job-card-container__link');
    if (!titleElement) return 'Unknown Title';

    let title = titleElement.textContent.trim();

    // Remove duplicate text (LinkedIn sometimes duplicates the title for accessibility)
    const words = title.split(/\s+/);
    const halfLength = Math.floor(words.length / 2);
    const firstHalf = words.slice(0, halfLength).join(' ');
    const secondHalf = words.slice(halfLength).join(' ');

    // If first half matches second half, it's duplicated
    if (firstHalf === secondHalf && halfLength > 0) {
      title = firstHalf;
    }

    return title;
  }

  extractCompany(jobCard) {
    const companyElement = jobCard.querySelector('.job-card-container__company-name, .artdeco-entity-lockup__subtitle');
    return companyElement ? companyElement.textContent.trim() : 'Unknown Company';
  }

  extractLocation(jobCard) {
    const locationElement = jobCard.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption');
    return locationElement ? locationElement.textContent.trim() : 'Unknown Location';
  }

  detectWorkType(jobCard, location) {
    const text = (jobCard.textContent + ' ' + location).toLowerCase();

    if (text.includes('remote')) {
      return 'remote';
    } else if (text.includes('hybrid')) {
      return 'hybrid';
    } else {
      return 'onsite';
    }
  }

  extractSalary(jobCard) {
    const salaryElement = jobCard.querySelector('.job-card-container__metadata-item--salary');
    if (!salaryElement) return null;

    const salaryText = salaryElement.textContent;
    const match = salaryText.match(/£?([\d,]+)k?\s*-\s*£?([\d,]+)k?/i);

    if (match) {
      return {
        min: parseInt(match[1].replace(/,/g, '')) * (match[1].includes('k') ? 1000 : 1),
        max: parseInt(match[2].replace(/,/g, '')) * (match[2].includes('k') ? 1000 : 1)
      };
    }

    return null;
  }

  // Check if job has Easy Apply
  hasEasyApply(jobCard) {
    const easyApplyBtn = jobCard.querySelector('.jobs-apply-button--top-card, button[aria-label*="Easy Apply"]');
    return !!easyApplyBtn;
  }

  // Start automated job application process
  async startApplying() {
    if (this.isRunning) {
      console.log('[Job Applicator] Already running');
      return;
    }

    if (this.hasReachedDailyLimit()) {
      console.log('[Job Applicator] Daily limit reached');
      return;
    }

    const targetRoles = this.settings.targetJobRoles || this.settings.targetRoles || [];
    const keywords = targetRoles.join(' OR ');
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&f_AL=true`;
    const currentUrl = window.location.href;

    // Check if we need to navigate to the search page with keywords
    if (!currentUrl.includes('/jobs/search/') || !currentUrl.includes('keywords=')) {
      console.log('[Job Applicator] Navigating to job search with keywords...');
      console.log('[Job Applicator] Target roles:', targetRoles);
      console.log('[Job Applicator] Search URL:', searchUrl);
      this.navigateToJobsSearch();
      return;
    }

    this.isRunning = true;
    console.log('[Job Applicator] 🎯 Starting automated job application...');
    console.log('[Job Applicator] Target roles:', targetRoles);

    try {
      await this.processJobListings();
    } catch (error) {
      console.error('[Job Applicator] Error during application process:', error);
    } finally {
      this.isRunning = false;
    }
  }

  navigateToJobsSearch() {
    const targetRoles = this.settings.targetJobRoles || this.settings.targetRoles || ['developer'];
    const keywords = targetRoles.join(' OR ');
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&f_AL=true`; // f_AL=true for Easy Apply filter

    console.log('[Job Applicator] Navigating to:', searchUrl);
    window.location.href = searchUrl;
  }

  // Verify job title in the full job description to avoid false matches
  async verifyJobTitleInDescription(cardTitle) {
    try {
      // Get the job description panel
      const jobDescription = document.querySelector('.jobs-description, .jobs-details, .job-view-layout');
      if (!jobDescription) {
        console.log('[Job Applicator] Job description not found');
        return false;
      }

      // Get the full job title from description header
      const descriptionTitle = jobDescription.querySelector('h1, .jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title');
      if (!descriptionTitle) {
        console.log('[Job Applicator] Job title in description not found');
        return false;
      }

      let fullTitle = descriptionTitle.textContent.trim();

      // Remove duplicate text in full title too
      const words = fullTitle.split(/\s+/);
      const halfLength = Math.floor(words.length / 2);
      const firstHalf = words.slice(0, halfLength).join(' ');
      const secondHalf = words.slice(halfLength).join(' ');
      if (firstHalf === secondHalf && halfLength > 0) {
        fullTitle = firstHalf;
      }

      console.log('[Job Applicator] Card title:', cardTitle);
      console.log('[Job Applicator] Full title:', fullTitle);

      // Check if the target roles match the FULL title using flexible matching
      const targetRoles = this.settings.targetJobRoles || this.settings.targetRoles || [];
      const roleMatches = this.matchesTargetRoles(fullTitle, targetRoles);

      if (!roleMatches) {
        console.log('[Job Applicator] ⚠️ Full job title does not match target roles');
        console.log('[Job Applicator] Expected one of:', targetRoles);
        console.log('[Job Applicator] Got:', fullTitle);
        return false;
      }

      console.log('[Job Applicator] ✅ Job title verified:', fullTitle);
      return true;

    } catch (error) {
      console.error('[Job Applicator] Error verifying job title:', error);
      return false;
    }
  }

  async processJobListings() {
    console.log('[Job Applicator] Processing job listings...');

    let totalProcessed = 0;
    let currentPage = 1;
    const maxPages = 5; // Process up to 5 pages

    while (currentPage <= maxPages && !this.hasReachedDailyLimit() && this.isRunning) {
      console.log('[Job Applicator] 📄 Processing page', currentPage);

      // Wait for page to load
      await this.humanDelay(3000, 5000);

      // Find all job cards
      const jobCards = document.querySelectorAll('.job-card-container, .jobs-search-results__list-item');
      console.log('[Job Applicator] Found', jobCards.length, 'job cards on page', currentPage);

      if (jobCards.length === 0) {
        console.log('[Job Applicator] No more jobs found, stopping pagination');
        break;
      }

      let pageProcessed = 0;
      for (const jobCard of jobCards) {
        if (this.hasReachedDailyLimit() || !this.isRunning) {
          break;
        }

        // Check if matches criteria
        const matchResult = await this.matchesJobCriteria(jobCard);

        if (!matchResult.matches) {
          console.log('[Job Applicator] Skipping job:', matchResult.reason);
          continue;
        }

        // Check if has Easy Apply
        if (!this.hasEasyApply(jobCard)) {
          console.log('[Job Applicator] Job does not have Easy Apply, skipping');
          continue;
        }

        // Click job to open details
        const jobLink = jobCard.querySelector('a.job-card-container__link, a.job-card-list__title');
        if (jobLink) {
          jobLink.click();
          await this.humanDelay(2000, 4000);

          // Apply to job
          const applied = await this.applyToJob(matchResult.jobData);
          if (applied) {
            pageProcessed++;
            totalProcessed++;
          }

          await this.humanDelay(5000, 10000); // Delay between applications
        }
      }

      console.log('[Job Applicator] Page', currentPage, 'complete. Processed', pageProcessed, 'applications');

      // Check if we should continue to next page
      if (this.hasReachedDailyLimit() || !this.isRunning) {
        break;
      }

      // Try to navigate to next page
      const nextPageSuccess = await this.navigateToNextPage(currentPage + 1);
      if (!nextPageSuccess) {
        console.log('[Job Applicator] Could not navigate to next page, stopping');
        break;
      }

      currentPage++;
    }

    console.log('[Job Applicator] ✅ Processed', totalProcessed, 'total applications across', currentPage, 'pages');
  }

  async navigateToNextPage(pageNumber) {
    try {
      // Scroll to bottom to trigger pagination
      window.scrollTo(0, document.body.scrollHeight);
      await this.humanDelay(1000, 2000);

      // Look for pagination buttons
      const paginationButtons = document.querySelectorAll('button[aria-label*="Page"]');

      for (const button of paginationButtons) {
        const label = button.getAttribute('aria-label');
        if (label && label.includes(`Page ${pageNumber}`)) {
          console.log('[Job Applicator] Clicking page', pageNumber, 'button');
          button.click();
          await this.humanDelay(3000, 5000);
          return true;
        }
      }

      // Alternative: Look for "Next" button
      const nextButton = document.querySelector('button[aria-label*="Next"], button[aria-label*="next"]');
      if (nextButton && !nextButton.disabled) {
        console.log('[Job Applicator] Clicking Next button');
        nextButton.click();
        await this.humanDelay(3000, 5000);
        return true;
      }

      // If no buttons, try modifying URL
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('start', (pageNumber - 1) * 25); // LinkedIn shows 25 jobs per page
      console.log('[Job Applicator] Navigating to:', currentUrl.href);
      window.location.href = currentUrl.href;
      await this.humanDelay(5000, 7000); // Wait longer for page navigation
      return true;

    } catch (error) {
      console.error('[Job Applicator] Error navigating to next page:', error);
      return false;
    }
  }

  async applyToJob(jobData) {
    try {
      console.log('[Job Applicator] Applying to:', jobData.jobTitle);

      // Wait for job details to load
      await this.humanDelay(1000, 2000);

      // Verify job title in the job description (not just the card)
      if (!await this.verifyJobTitleInDescription(jobData.jobTitle)) {
        console.log('[Job Applicator] ⚠️ Job title verification failed - skipping');
        return false;
      }

      // Find Easy Apply button using the correct selector
      const easyApplyBtn = document.querySelector('#jobs-apply-button-id, .jobs-apply-button--top-card, button[aria-label*="Easy Apply"]');

      if (!easyApplyBtn) {
        console.log('[Job Applicator] Easy Apply button not found');
        return false;
      }

      // Click Easy Apply
      easyApplyBtn.click();
      await this.humanDelay(2000, 3000);

      // Check for cover letter requirement
      const requiresCoverLetter = this.detectCoverLetterRequirement();

      if (requiresCoverLetter) {
        console.log('[Job Applicator] ⚠️ Cover letter required - saving as draft');

        // Save application as draft for manual completion
        await chrome.runtime.sendMessage({
          action: 'saveJobApplication',
          applicationData: {
            ...jobData,
            jobId: window.location.href,
            jobUrl: window.location.href,
            status: 'draft',
            requiresCoverLetter: true,
            notes: 'Requires cover letter - needs manual completion'
          }
        });

        // Close modal
        const closeBtn = document.querySelector('button[aria-label*="Dismiss"], button[data-test-modal-close-btn]');
        if (closeBtn) closeBtn.click();

        return false;
      }

      // Fill form and submit
      const submitted = await this.fillAndSubmitApplication(jobData);

      if (submitted) {
        // Save successful application
        await chrome.runtime.sendMessage({
          action: 'saveJobApplication',
          applicationData: {
            ...jobData,
            jobId: window.location.href,
            jobUrl: window.location.href,
            status: 'applied',
            requiresCoverLetter: false
          }
        });

        this.dailyLimits.applicationsSubmitted++;
        this.saveDailyLimits();

        console.log('[Job Applicator] ✅ Successfully applied!');
        return true;
      }

      return false;

    } catch (error) {
      console.error('[Job Applicator] Error applying to job:', error);
      return false;
    }
  }

  detectCoverLetterRequirement() {
    // Look for cover letter textarea or requirement text
    const modal = document.querySelector('.jobs-easy-apply-modal, [role="dialog"]');
    if (!modal) return false;

    const text = modal.textContent.toLowerCase();
    const hasCoverLetterField = modal.querySelector('textarea[name*="cover"], textarea[id*="cover"]');
    const hasCoverLetterText = text.includes('cover letter') && !text.includes('optional');

    return !!(hasCoverLetterField || hasCoverLetterText);
  }

  async fillAndSubmitApplication(jobData) {
    try {
      console.log('[Job Applicator] Filling application form...');

      // LinkedIn Easy Apply is multi-step - need to handle Next/Review/Submit buttons
      let currentStep = 0;
      const maxSteps = 5;

      while (currentStep < maxSteps) {
        await this.humanDelay(1000, 2000);

        // Auto-fill any visible fields
        await this.autoFillFields();

        // Look for Next, Review, or Submit button
        const nextBtn = document.querySelector('button[aria-label*="Continue"], button[aria-label*="Review"], button[aria-label*="Submit"]');

        if (!nextBtn) {
          console.log('[Job Applicator] No more buttons found');
          break;
        }

        const buttonText = nextBtn.textContent.toLowerCase();

        if (buttonText.includes('submit')) {
          // Final submit
          nextBtn.click();
          console.log('[Job Applicator] Submitted application');
          await this.humanDelay(2000, 3000);
          return true;
        } else {
          // Next/Review step
          nextBtn.click();
          console.log('[Job Applicator] Moved to next step');
          currentStep++;
        }
      }

      return false;

    } catch (error) {
      console.error('[Job Applicator] Error filling form:', error);
      return false;
    }
  }

  async autoFillFields() {
    // Auto-fill name
    const nameField = document.querySelector('input[name*="name"], input[id*="name"]');
    if (nameField && !nameField.value && this.settings.autoFillName) {
      nameField.value = this.settings.autoFillName;
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Auto-fill email
    const emailField = document.querySelector('input[type="email"], input[name*="email"]');
    if (emailField && !emailField.value && this.settings.autoFillEmail) {
      emailField.value = this.settings.autoFillEmail;
      emailField.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Auto-fill phone
    const phoneField = document.querySelector('input[type="tel"], input[name*="phone"]');
    if (phoneField && !phoneField.value && this.settings.autoFillPhone) {
      phoneField.value = this.settings.autoFillPhone;
      phoneField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async humanDelay(minMs, maxMs) {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  stopApplying() {
    console.log('[Job Applicator] Stop requested');
    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      dailyLimits: this.dailyLimits,
      remainingApplications: Math.max(0, (this.settings.maxDailyApplications || 20) - this.dailyLimits.applicationsSubmitted)
    };
  }
}

// Export for use in main content script
window.JobApplicator = JobApplicator;
