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
      address: '',  // User's home location - set in settings
      lat: null,
      lng: null
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

  // Flexible role matching (see TextUtils.matchTargetRole)
  matchesTargetRoles(jobTitle, targetRoles) {
    const matched = TextUtils.matchTargetRole(jobTitle, targetRoles);
    if (matched) {
      console.log('[Job Applicator] ✅ Matched role:', matched, 'in title:', jobTitle);
    }
    return !!matched;
  }

  hasHomeCoordinates() {
    return Number.isFinite(this.homeLocation?.lat) && Number.isFinite(this.homeLocation?.lng);
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
      // Major cities
      'london': { lat: 51.5074, lng: -0.1278 },
      'manchester': { lat: 53.4808, lng: -2.2426 },
      'birmingham': { lat: 52.4862, lng: -1.8904 },
      'leeds': { lat: 53.8008, lng: -1.5491 },
      'liverpool': { lat: 53.4084, lng: -2.9916 },
      'bristol': { lat: 51.4545, lng: -2.5879 },
      'sheffield': { lat: 53.3811, lng: -1.4701 },
      'edinburgh': { lat: 55.9533, lng: -3.1883 },
      'glasgow': { lat: 55.8642, lng: -4.2518 },
      'cardiff': { lat: 51.4816, lng: -3.1791 },
      'newcastle': { lat: 54.9783, lng: -1.6178 },
      'nottingham': { lat: 52.9548, lng: -1.1581 },
      'southampton': { lat: 50.9097, lng: -1.4044 },
      'portsmouth': { lat: 50.8198, lng: -1.0880 },
      'leicester': { lat: 52.6369, lng: -1.1398 },
      'coventry': { lat: 52.4068, lng: -1.5197 },
      'hull': { lat: 53.7457, lng: -0.3367 },
      'stoke': { lat: 53.0027, lng: -2.1794 },
      'derby': { lat: 52.9225, lng: -1.4746 },
      'plymouth': { lat: 50.3755, lng: -4.1427 },
      'wolverhampton': { lat: 52.5864, lng: -2.1285 },
      'reading': { lat: 51.4543, lng: -0.9781 },
      'northampton': { lat: 52.2405, lng: -0.9027 },
      'luton': { lat: 51.8787, lng: -0.4200 },
      'bolton': { lat: 53.5768, lng: -2.4282 },
      'aberdeen': { lat: 57.1497, lng: -2.0943 },

      // South East England
      'cambridge': { lat: 52.2053, lng: 0.1218 },
      'oxford': { lat: 51.7520, lng: -1.2577 },
      'brighton': { lat: 50.8225, lng: -0.1372 },
      'kent': { lat: 51.2787, lng: 0.5217 },
      'canterbury': { lat: 51.2802, lng: 1.0789 },
      'maidstone': { lat: 51.2704, lng: 0.5227 },
      'ashford': { lat: 51.1465, lng: 0.8750 },
      'rochester': { lat: 51.3882, lng: 0.5046 },
      'chatham': { lat: 51.3794, lng: 0.5299 },
      'gillingham': { lat: 51.3889, lng: 0.5500 },
      'tunbridge wells': { lat: 51.1320, lng: 0.2630 },
      'guildford': { lat: 51.2362, lng: -0.5704 },
      'slough': { lat: 51.5105, lng: -0.5950 },
      'woking': { lat: 51.3168, lng: -0.5580 },
      'crawley': { lat: 51.1130, lng: -0.1863 },
      'worthing': { lat: 50.8142, lng: -0.3714 },
      'eastbourne': { lat: 50.7684, lng: 0.2905 },
      'hastings': { lat: 50.8543, lng: 0.5730 },

      // General regions
      'england': { lat: 52.3555, lng: -1.1743 },
      'united kingdom': { lat: 54.5973, lng: -3.8142 },
      'uk': { lat: 54.5973, lng: -3.8142 }
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
      const matchedRole = TextUtils.matchTargetRole(jobTitle, targetRoles);

      if (!matchedRole) {
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
      let distance = null;
      if (workType === 'hybrid') {
        const maxDistance = this.settings.maxHybridDistance || 75;
        const jobCoords = this.estimateLocationCoordinates(location);

        if (!this.hasHomeCoordinates()) {
          // Without home coordinates the distance would be NaN, which silently
          // passed every check and was saved as the job's distance
          console.log('[Job Applicator] ⚠️ Home location coordinates not set - skipping distance check');
        } else if (jobCoords && jobCoords.lat !== 0 && jobCoords.lng !== 0) {
          distance = this.calculateDistance(
            this.homeLocation.lat,
            this.homeLocation.lng,
            jobCoords.lat,
            jobCoords.lng
          );

          console.log('[Job Applicator] Distance from home location:', Math.round(distance), 'miles');

          if (distance > maxDistance) {
            return {
              matches: false,
              reason: `Hybrid role too far (${Math.round(distance)} miles > ${maxDistance} miles)`,
              distance
            };
          }
        } else {
          console.log('[Job Applicator] ⚠️ Could not determine location coordinates for:', location, '- allowing job');
          // If we can't determine coordinates, allow the job (don't reject it)
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
          matchedRole,
          company,
          location,
          workType,
          salary: salary ? `£${salary.min}-${salary.max}` : null,
          distance: distance !== null ? Math.round(distance) : null
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
    const match = salaryText.match(/£?([\d,.]+)(k?)\s*-\s*£?([\d,.]+)(k?)/i);

    if (match) {
      // The "k" suffix is captured separately; previously it was checked for
      // inside the digits group, so "£50k - £60k" was parsed as £50-£60
      const toNumber = (digits, suffix) =>
        Math.round(parseFloat(digits.replace(/,/g, '')) * (suffix ? 1000 : 1));
      return {
        min: toNumber(match[1], match[2]),
        max: toNumber(match[3], match[4])
      };
    }

    return null;
  }

  // Extract salary from job details panel (more accurate than job card)
  extractSalaryFromJobDetails() {
    try {
      // Try multiple selectors for the job details panel
      const jobDetails = document.querySelector(
        '.jobs-details, ' +
        '.jobs-unified-top-card, ' +
        '.job-details-jobs-unified-top-card, ' +
        '.jobs-description'
      );

      if (!jobDetails) {
        console.log('[Job Applicator] Job details panel not found');
        return null;
      }

      // Look for salary in compensation section or badges
      const salarySelectors = [
        '.jobs-unified-top-card__job-insight span',
        '.job-details-jobs-unified-top-card__job-insight span',
        '.jobs-unified-top-card__bullet',
        '[class*="compensation"]',
        '[class*="salary"]'
      ];

      for (const selector of salarySelectors) {
        const elements = jobDetails.querySelectorAll(selector);

        for (const element of elements) {
          const text = element.textContent.trim();

          // Match UK salary format: £50K/yr - £60K/yr or £50,000/yr - £60,000/yr
          const match = text.match(/£([\d,]+)K?\/yr\s*-\s*£([\d,]+)K?\/yr/i);

          if (match) {
            const min = match[1].replace(/,/g, '');
            const max = match[2].replace(/,/g, '');

            // Check if values are in thousands (K format)
            const isKFormat = text.toUpperCase().includes('K/YR');

            const salaryMin = parseInt(min) * (isKFormat ? 1000 : 1);
            const salaryMax = parseInt(max) * (isKFormat ? 1000 : 1);

            console.log('[Job Applicator] Found salary in job details:', text);

            return `£${salaryMin.toLocaleString()}-£${salaryMax.toLocaleString()}`;
          }

          // Also try to match single salary value
          const singleMatch = text.match(/£([\d,]+)K?\/yr/i);
          if (singleMatch) {
            const value = singleMatch[1].replace(/,/g, '');
            const isKFormat = text.toUpperCase().includes('K/YR');
            const salary = parseInt(value) * (isKFormat ? 1000 : 1);

            console.log('[Job Applicator] Found single salary in job details:', text);

            return `£${salary.toLocaleString()}`;
          }
        }
      }

      console.log('[Job Applicator] No salary found in job details');
      return null;

    } catch (error) {
      console.error('[Job Applicator] Error extracting salary from job details:', error);
      return null;
    }
  }

  // Check if job has Easy Apply - checks within the job card for the indicator
  hasEasyApply(jobCard) {
    // LinkedIn shows "Easy Apply" badge/text in the job card
    const cardText = jobCard.textContent.toLowerCase();
    const hasEasyApplyText = cardText.includes('easy apply');

    console.log('[Job Applicator] Checking Easy Apply for card:', hasEasyApplyText);

    // Also check for Easy Apply button/badge element
    const easyApplyIndicator = jobCard.querySelector(
      '.job-card-container__apply-button, ' +
      '.job-card-list__footer-wrapper button, ' +
      'button[aria-label*="Easy Apply"], ' +
      'li-icon[type="lightning-bolt"]'  // Lightning bolt icon indicates Easy Apply
    );

    if (easyApplyIndicator) {
      console.log('[Job Applicator] Found Easy Apply indicator element');
    }

    return hasEasyApplyText || !!easyApplyIndicator;
  }

  // Start automated job application process
  async startApplying() {
    console.log('[Job Applicator] 🚀 startApplying() called');

    // Reload settings so changes saved in the popup take effect
    await this.init();
    console.log('[Job Applicator] Settings:', this.settings);
    console.log('[Job Applicator] Is running?', this.isRunning);
    console.log('[Job Applicator] Daily limits:', this.dailyLimits);

    if (this.isRunning) {
      console.log('[Job Applicator] ⚠️ Already running, exiting');
      return;
    }

    if (this.hasReachedDailyLimit()) {
      console.log('[Job Applicator] ⚠️ Daily limit reached, exiting');
      return;
    }

    const targetRoles = this.settings.targetJobRoles || this.settings.targetRoles || [];
    console.log('[Job Applicator] Target roles from settings:', targetRoles);

    if (targetRoles.length === 0) {
      console.error('[Job Applicator] ❌ No target job roles configured! Please add roles in settings.');
      return;
    }

    const keywords = targetRoles.join(' OR ');
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&f_AL=true`;
    const currentUrl = window.location.href;

    console.log('[Job Applicator] Current URL:', currentUrl);
    console.log('[Job Applicator] Target search URL:', searchUrl);

    // Check if we need to navigate to the search page with keywords
    if (!currentUrl.includes('/jobs/search/') || !currentUrl.includes('keywords=')) {
      console.log('[Job Applicator] 🔄 Navigating to job search with keywords...');
      console.log('[Job Applicator] Target roles:', targetRoles);
      console.log('[Job Applicator] Search URL:', searchUrl);
      this.navigateToJobsSearch();
      return;
    }

    this.isRunning = true;
    this.processedJobs = new Set();
    console.log('[Job Applicator] ✅ On search page, starting job processing...');
    console.log('[Job Applicator] 🎯 Target roles:', targetRoles);

    try {
      await this.processJobListings();
    } catch (error) {
      console.error('[Job Applicator] ❌ Error during application process:', error);
    } finally {
      this.isRunning = false;
      console.log('[Job Applicator] ✅ Finished, isRunning set to false');
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

      // Find all job cards. The list item and the card inside it both match
      // these selectors, so keep only the innermost to avoid doing each job twice.
      const matches = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item'));
      const jobCards = matches.filter(card => !matches.some(other => other !== card && card.contains(other)));
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
        const jobKey = jobLink?.href || `${matchResult.jobData.jobTitle}|${matchResult.jobData.company}`;
        if (this.processedJobs.has(jobKey)) {
          continue;
        }
        this.processedJobs.add(jobKey);

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
      console.log('[Job Applicator] 🎯 Applying to:', jobData.jobTitle);

      // Wait for job details to load
      await this.humanDelay(1000, 2000);

      // Verify job title in the job description (not just the card)
      if (!await this.verifyJobTitleInDescription(jobData.jobTitle)) {
        console.log('[Job Applicator] ⚠️ Job title verification failed - skipping');
        return false;
      }

      // Extract salary from job details panel (more accurate than card)
      const detailedSalary = this.extractSalaryFromJobDetails();
      if (detailedSalary) {
        jobData.salary = detailedSalary;
        console.log('[Job Applicator] 💰 Updated salary from job details:', detailedSalary);
      }

      // Debug: Log all buttons on the page
      const allButtons = document.querySelectorAll('button');
      console.log('[Job Applicator] 🔍 Found', allButtons.length, 'buttons on page');

      // Try multiple selectors to find Easy Apply button
      let easyApplyBtn = document.querySelector('#jobs-apply-button-id');
      console.log('[Job Applicator] Checking #jobs-apply-button-id:', !!easyApplyBtn);

      if (!easyApplyBtn) {
        easyApplyBtn = document.querySelector('.jobs-apply-button--top-card');
        console.log('[Job Applicator] Checking .jobs-apply-button--top-card:', !!easyApplyBtn);
      }

      if (!easyApplyBtn) {
        easyApplyBtn = document.querySelector('button[aria-label*="Easy Apply"]');
        console.log('[Job Applicator] Checking button[aria-label*="Easy Apply"]:', !!easyApplyBtn);
      }

      if (!easyApplyBtn) {
        // Look for any button with "Easy Apply" text
        for (const button of allButtons) {
          if (button.textContent.includes('Easy Apply')) {
            easyApplyBtn = button;
            console.log('[Job Applicator] ✅ Found Easy Apply button by text content');
            break;
          }
        }
      }

      if (!easyApplyBtn) {
        console.log('[Job Applicator] ❌ Easy Apply button not found with any selector');
        console.log('[Job Applicator] Sample button texts:', Array.from(allButtons).slice(0, 10).map(b => b.textContent.trim()).filter(t => t));
        return false;
      }

      console.log('[Job Applicator] ✅ Found Easy Apply button:', easyApplyBtn.textContent.trim());

      // A form left open from the previous job would swallow this one
      if (this.findEasyApplyModal() && !await this.closeEasyApplyModal()) {
        console.log('[Job Applicator] 🛑 An application form is still open and could not be closed - stopping');
        this.stopApplying();
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

        await this.closeEasyApplyModal();

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

  // Poll until check() returns something truthy, or give up after timeoutMs
  async waitFor(check, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = check();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 100));
    }
    return check() || null;
  }

  isVisible(el) {
    return !!el && el.getClientRects().length > 0;
  }

  // The open Easy Apply form. The messaging panel also uses role="dialog", so
  // "the first dialog on the page" could be the wrong one.
  findEasyApplyModal() {
    const candidates = Array.from(document.querySelectorAll(
      '.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"], [role="dialog"]'))
      .filter(el => this.isVisible(el) &&
                    !el.closest('#msg-overlay, .msg-overlay-container, [class*="msg-overlay"]'));

    return candidates.find(el => el.matches('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"]')) ||
           candidates.find(el => el.querySelector('.jobs-easy-apply-content, form') &&
                                 /apply to|easy apply|submit application|contact info/i.test(el.textContent)) ||
           null;
  }

  detectCoverLetterRequirement() {
    // Look for cover letter textarea or requirement text
    const modal = this.findEasyApplyModal();
    if (!modal) return false;

    const text = modal.textContent.toLowerCase();
    const hasCoverLetterField = modal.querySelector('textarea[name*="cover"], textarea[id*="cover"]');
    const hasCoverLetterText = text.includes('cover letter') && !text.includes('optional');
    if (!hasCoverLetterField && !hasCoverLetterText) return false;

    // A saved answer for cover letter questions lets the form filler handle it
    return !AnswerBank.resolve('Cover letter', { type: 'textarea' }, this.settings);
  }

  async fillAndSubmitApplication(jobData) {
    try {
      console.log('[Job Applicator] Filling application form...');

      // LinkedIn Easy Apply is multi-step: contact info, CV, questions, review
      const maxSteps = 10;
      let previousPage = null;

      for (let step = 0; step < maxSteps && this.isRunning; step++) {
        await this.humanDelay(1000, 2000);

        const modal = this.findEasyApplyModal();
        if (!modal) {
          console.log('[Job Applicator] ⚠️ The application form is no longer open');
          return false;
        }

        // Fill in what the saved answers cover, then see what's still missing
        const missing = await this.answerQuestions(modal);
        const errors = this.getValidationErrors(modal);

        // Landing on the same page again means LinkedIn didn't accept it
        const heading = modal.querySelector('h3, h2')?.textContent.trim() || '';
        const page = heading + '|' + this.collectFormFields(modal).map(field => field.question).join('|');
        const stuck = page === previousPage;
        previousPage = page;

        if (missing.length || errors.length || stuck) {
          await this.saveDraftForMissingAnswers(jobData, missing, errors);
          await this.closeEasyApplyModal();
          return false;
        }

        const nextBtn = this.findFormButton(modal);
        if (!nextBtn) {
          console.log('[Job Applicator] No Next/Review/Submit button found');
          break;
        }

        if (nextBtn.disabled) {
          console.log('[Job Applicator] ⚠️ Next/Submit button is disabled - likely has required fields');
          await this.saveDraftForMissingAnswers(jobData, [], ['The Next button stayed disabled']);
          await this.closeEasyApplyModal();
          return false;
        }

        const buttonText = `${nextBtn.getAttribute('aria-label') || ''} ${nextBtn.textContent}`.toLowerCase();

        if (buttonText.includes('submit')) {
          // Final submit
          nextBtn.click();
          console.log('[Job Applicator] Submitted application');
          await this.humanDelay(3000, 5000);

          // Wait for "Application sent" modal and click Done button
          const doneBtn = await this.waitForDoneButton();
          if (doneBtn) {
            doneBtn.click();
            console.log('[Job Applicator] ✅ Clicked Done button');
            await this.humanDelay(1000, 2000);
          }

          return true;
        }

        // Next/Review step
        nextBtn.click();
        console.log('[Job Applicator] Moved to next step');
      }

      return false;

    } catch (error) {
      console.error('[Job Applicator] Error filling form:', error);
      return false;
    }
  }

  // Answer the questions on the current page from the saved answers.
  // Returns the required fields that are still empty.
  async answerQuestions(modal) {
    for (const field of this.collectFormFields(modal)) {
      if (field.filled || !field.question || field.type === 'date') continue;

      const resolved = AnswerBank.resolve(field.question, field, this.settings);
      if (!resolved) continue;

      if (await this.applyAnswer(field, resolved.value)) {
        console.log(`[Job Applicator] ✍️ "${field.question}" → "${[].concat(resolved.value).join(', ')}" (from ${resolved.source})`);
        await this.humanDelay(400, 1200);
      } else {
        console.log(`[Job Applicator] ⚠️ Couldn't enter the saved answer for "${field.question}"`);
      }
    }

    return this.collectFormFields(modal).filter(field => field.required && !field.filled);
  }

  // Every question on the current page of the form
  collectFormFields(modal) {
    const fields = [];
    const isRequired = (el) => el.required || el.getAttribute('aria-required') === 'true';

    // Radio buttons and checkboxes, grouped by fieldset (or by name)
    const groups = new Map();
    for (const input of modal.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
      const container = input.closest('fieldset');
      const key = container || `${input.type}:${input.name || input.id}`;
      if (!groups.has(key)) groups.set(key, { container, inputs: [] });
      groups.get(key).inputs.push(input);
    }
    for (const { container, inputs } of groups.values()) {
      const legend = container && (container.querySelector('legend') ||
                                   container.querySelector('[class*="form-element__label"]'));
      const choices = inputs.map(input => ({ input, label: this.choiceLabel(input, modal) }));
      const question = this.readLabel(legend) || (inputs.length === 1 ? choices[0].label : '');
      fields.push({
        type: inputs[0].type === 'radio' ? 'radio' : 'checkbox',
        question,
        options: choices.map(choice => choice.label),
        choices,
        required: inputs.some(isRequired) || container?.getAttribute('aria-required') === 'true',
        filled: inputs.some(input => input.checked)
      });
    }

    for (const select of modal.querySelectorAll('select')) {
      if (!this.isVisible(select)) continue;
      const choices = Array.from(select.options)
        .filter(option => !this.isPlaceholderOption(option))
        .map(option => ({ option, label: option.textContent.trim() }));
      const selected = select.options[select.selectedIndex];
      fields.push({
        type: 'select',
        element: select,
        question: this.fieldLabel(select, modal),
        options: choices.map(choice => choice.label),
        choices,
        required: isRequired(select),
        filled: !!selected && !this.isPlaceholderOption(selected)
      });
    }

    const skipTypes = ['radio', 'checkbox', 'hidden', 'file', 'submit', 'button', 'image', 'reset'];
    for (const input of modal.querySelectorAll('input, textarea')) {
      if (input.tagName === 'INPUT' && skipTypes.includes(input.type)) continue;
      if (!this.isVisible(input)) continue;

      const isTypeahead = input.getAttribute('role') === 'combobox' || input.getAttribute('aria-autocomplete') === 'list';
      const isNumeric = input.type === 'number' || /numeric/i.test(input.id || '') ||
                        ['numeric', 'decimal'].includes(input.inputMode);
      const type = input.tagName === 'TEXTAREA' ? 'textarea'
        : isTypeahead ? 'typeahead'
        : input.type === 'date' ? 'date'
        : isNumeric ? 'numeric' : 'text';

      fields.push({
        type,
        element: input,
        question: this.fieldLabel(input, modal),
        options: [],
        required: isRequired(input),
        filled: input.value.trim() !== ''
      });
    }

    return fields;
  }

  // LinkedIn repeats label text for screen readers; prefer the visible copy
  readLabel(el) {
    if (!el) return '';
    const visible = el.querySelector('span[aria-hidden="true"]');
    return TextUtils.dedupeRepeatedText((visible || el).textContent)
      .replace(/\s*\*?\s*\(?required\)?\s*$/i, '')
      .trim();
  }

  fieldLabel(el, modal) {
    let label = el.id ? modal.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
    if (!label) label = el.closest('label');
    if (!label && el.getAttribute('aria-labelledby')) {
      label = document.getElementById(el.getAttribute('aria-labelledby').split(' ')[0]);
    }
    return this.readLabel(label) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
  }

  choiceLabel(input, modal) {
    const label = (input.id && modal.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.closest('label');
    return this.readLabel(label) || input.value || '';
  }

  isPlaceholderOption(option) {
    return option.value === '' ||
           /^(select an option|select|please select|choose|choose an option|-+)$/i.test(option.textContent.trim());
  }

  // Enter an answer from AnswerBank.resolve() into a field
  async applyAnswer(field, value) {
    switch (field.type) {
      case 'select': {
        const choice = field.choices.find(c => c.label === value);
        if (!choice) return false;
        field.element.focus();
        field.element.value = choice.option.value;
        field.element.dispatchEvent(new Event('input', { bubbles: true }));
        field.element.dispatchEvent(new Event('change', { bubbles: true }));
        field.element.blur();
        return field.element.value === choice.option.value;
      }

      case 'radio': {
        const choice = field.choices.find(c => c.label === value);
        if (!choice) return false;
        choice.input.click();
        return choice.input.checked;
      }

      case 'checkbox': {
        const wanted = [].concat(value);
        for (const choice of field.choices) {
          if (wanted.includes(choice.label) && !choice.input.checked) {
            choice.input.click();
          }
        }
        return field.choices.some(c => wanted.includes(c.label) && c.input.checked);
      }

      case 'typeahead': {
        // Type the answer, then pick the matching suggestion LinkedIn offers
        this.setInputValue(field.element, String(value), false);
        const suggestion = await this.waitFor(() => {
          const options = Array.from(document.querySelectorAll('[role="listbox"] [role="option"], .basic-typeahead__selectable'))
            .filter(option => this.isVisible(option));
          return options.find(option => TextUtils.normalize(option.textContent).includes(TextUtils.normalize(String(value)))) ||
                 options[0];
        }, 4000);
        if (!suggestion) return false;
        suggestion.click();
        return true;
      }

      default:
        this.setInputValue(field.element, String(value));
        return field.element.value === String(value);
    }
  }

  // Set a text field's value so LinkedIn's form code registers it
  setInputValue(element, value, leaveField = true) {
    element.focus();
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    if (leaveField) element.blur();
  }

  // LinkedIn's inline error messages ("Please enter a valid answer")
  getValidationErrors(modal) {
    const messages = Array.from(modal.querySelectorAll(
      '.artdeco-inline-feedback--error, [data-test-form-element-error-messages], [role="alert"], [class*="error"]'))
      .filter(el => this.isVisible(el))
      .map(el => el.textContent.replace(/\s+/g, ' ').trim())
      .filter(text => text && text.length < 200 &&
                      /(please|required|enter|select|must|invalid|valid answer|make a selection)/i.test(text));
    return [...new Set(messages)];
  }

  findFormButton(modal) {
    const buttons = Array.from(modal.querySelectorAll('button')).filter(btn => this.isVisible(btn));
    const label = btn => `${btn.getAttribute('aria-label') || ''} ${btn.textContent}`.toLowerCase();
    return buttons.find(btn => label(btn).includes('submit')) ||
           buttons.find(btn => label(btn).includes('review')) ||
           buttons.find(btn => /continue|next/.test(label(btn))) ||
           null;
  }

  // Record the questions that stopped this application and save it as a
  // draft; the questions appear on the Application Answers page to answer once
  async saveDraftForMissingAnswers(jobData, missing, errors) {
    const questions = missing.filter(field => field.question).map(field => ({
      key: AnswerBank.normalizeQuestion(field.question),
      question: field.question,
      type: field.type,
      options: (field.options || []).slice(0, 25)
    }));

    if (questions.length) {
      console.log('[Job Applicator] ⚠️ No saved answer for:', questions.map(q => q.question).join(' | '), '- saving as draft');
      await chrome.runtime.sendMessage({
        action: 'recordUnansweredQuestions',
        questions,
        job: { jobTitle: jobData.jobTitle, company: jobData.company }
      });
    } else {
      console.log('[Job Applicator] ⚠️ LinkedIn did not accept this page of the form:', errors.join(' | ') || 'no reason shown', '- saving as draft');
    }

    const notes = questions.length
      ? `Unanswered: ${questions.map(q => q.question).join('; ')} (add answers on the Application Answers page)`
      : `LinkedIn flagged: ${errors.join('; ') || 'a problem on the form'} - needs manual completion`;

    await chrome.runtime.sendMessage({
      action: 'saveJobApplication',
      applicationData: {
        ...jobData,
        jobId: window.location.href,
        jobUrl: window.location.href,
        status: 'draft',
        requiresCustomQuestions: true,
        notes
      }
    });
  }

  // Close the form so the next job can be opened, keeping LinkedIn's copy of
  // the unfinished application ("Save this application?" -> Save)
  async closeEasyApplyModal() {
    const modal = this.findEasyApplyModal();
    if (!modal) return true;

    const dismiss = Array.from(modal.querySelectorAll('button[aria-label="Dismiss"], button[data-test-modal-close-btn], .artdeco-modal__dismiss'))
      .find(btn => this.isVisible(btn));
    if (!dismiss) {
      console.log('[Job Applicator] ⚠️ No close button on the application form');
      return false;
    }
    dismiss.click();

    const saveBtn = await this.waitFor(() => Array.from(document.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button, .artdeco-modal button'))
      .find(btn => this.isVisible(btn) && !btn.closest('#msg-overlay, [class*="msg-overlay"]') &&
                   (btn.getAttribute('data-control-name') === 'save_application_btn' || /^save$/i.test(btn.textContent.trim()))), 4000);
    if (saveBtn) {
      saveBtn.click();
      console.log('[Job Applicator] Saved the unfinished application on LinkedIn');
    }

    const closed = await this.waitFor(() => !this.findEasyApplyModal(), 4000);
    if (!closed) console.log('[Job Applicator] ⚠️ Could not close the application form');
    return !!closed;
  }

  async waitForDoneButton(maxAttempts = 10) {
    console.log('[Job Applicator] Waiting for Done button...');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Look for Done button in success modal
      const doneBtn = document.querySelector('button[aria-label*="Done"], button.artdeco-modal__confirm-dialog-btn');

      // Also check button text content
      if (!doneBtn) {
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
          if (button.textContent.trim().toLowerCase() === 'done') {
            console.log('[Job Applicator] Found Done button by text');
            return button;
          }
        }
      }

      if (doneBtn) {
        console.log('[Job Applicator] Found Done button');
        return doneBtn;
      }

      // Wait before next attempt
      await this.humanDelay(500, 1000);
    }

    console.log('[Job Applicator] ⚠️ Done button not found after', maxAttempts, 'attempts');
    return null;
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
