# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Manifest V3 browser extension that automatically discovers job opportunities through LinkedIn by scanning feeds, profiles, and company updates. The extension mimics human-like behavior patterns to avoid detection while staying within conservative rate limits.

**Tech Stack:**
- Vanilla JavaScript (ES6+)
- Chrome Extension APIs (Manifest V3)
- Chrome Storage API for local data persistence
- Content scripts for DOM manipulation
- Service worker for background tasks

## Architecture

**Communication Flow:**
```
popup.js → background.js (service worker) → chrome.storage
         ↓
content scripts (linkedin.js) → storage.js → background.js
```

**Content Script Loading Order (important):**
The manifest.json loads content scripts in a specific sequence:
1. `storage/storage.js` - Must load first (provides StorageManager class)
2. `content/job-detector.js` - Second (provides JobDetector class)
3. `content/network-crawler.js` - Third (provides NetworkCrawler class)
4. `content/linkedin.js` - Last (orchestrates everything, depends on above classes)

Each script exposes classes via `window.*` globals for cross-script communication.

**Key Components:**

- **background.js**: Service worker that handles Chrome storage operations, acts as message broker between popup and content scripts. Initializes default settings on installation.

- **content/linkedin.js**: Main orchestrator that runs on LinkedIn pages. Creates the `LinkedInJobHunter` class which manages UI indicators, page observers (MutationObserver for SPA navigation), and schedules automatic scans.

- **content/job-detector.js**: Analyzes DOM elements to identify job opportunities. Uses keyword matching, regex patterns, and confidence scoring (0.0-1.0) to rate opportunities. Extracts structured data from posts, profiles, and company updates.

- **content/network-crawler.js**: Implements rate-limited profile visiting with human-like behavior (random delays, natural scrolling, simulated mouse events). Tracks daily limits in localStorage with automatic midnight reset.

- **content/network-expander.js**: Automated network expansion system that sends personalized connection requests. Features role rotation, random selection, human-like typing, configurable daily limits (default 30/day), and context-aware messaging for hiring managers vs general networking. Runs in automated mode cycling through all target roles until daily limit reached.

- **storage/storage.js**: Wrapper around chrome.runtime.sendMessage that provides async/await interface to background service worker. Includes in-memory cache for settings.

- **popup/popup.js**: UI controller for extension popup. Communicates with both background script (for storage) and content script (for real-time status). Updates UI every 5 seconds.

## Development

**Testing:**
1. Load extension in Chrome: `chrome://extensions/` → Developer mode → Load unpacked
2. Navigate to `https://www.linkedin.com`
3. Open browser DevTools → Console to see extension logs
4. Test features through popup interface

**No Build Process:**
Extension runs directly from source. No compilation, bundling, or transpilation required.

**Debugging:**
- Content script logs: DevTools Console on LinkedIn page
- Background script logs: `chrome://extensions/` → extension details → Service worker → inspect
- Popup logs: Right-click extension icon → Inspect popup

## Key Implementation Details

**MutationObserver Pattern:**
The extension uses MutationObserver extensively to watch for:
- SPA navigation (URL changes in single-page app)
- New feed posts (dynamically loaded content)
- Profile elements appearing in DOM

**Rate Limiting:**
- Daily profile scan limits stored in localStorage with date-based reset
- Checked before each crawl operation
- Configurable via settings (default: 80 profiles/day)

**Human Behavior Simulation:**
- Random delays between actions (default: 2-8 seconds)
- Natural scrolling with random distances
- Mouse event simulation with randomized click positions
- Automatic breaks between operations

**Opportunity Confidence Scoring:**
- Base confidence starts at 0.3
- High-confidence keywords ("we are hiring", "join our team") add 0.3
- Medium-confidence keywords ("hiring", "looking for") add 0.1
- Capped at 1.0 maximum
- Only opportunities above threshold (>0.4 for auto-save) are stored

**Data Structure:**
Opportunities stored with fields: `id`, `type`, `source`, `title`, `company`, `author`, `content`, `url`, `dateFound`, `status`, `confidence`, `keywords`

## Extension Permissions

- `storage`: Chrome Storage API for settings and opportunities
- `activeTab`: Access to active LinkedIn tab
- `scripting`: Dynamic script injection
- `host_permissions`: `https://*.linkedin.com/*` only

## Important Constraints

- **LinkedIn Only**: Extension only activates on `linkedin.com` domains
- **No External APIs**: All operations happen client-side in browser
- **Same-Origin Policy**: Profile iframe scanning has limitations due to browser security
- **Service Worker Lifecycle**: Background script can be terminated; must reload state on each message
- **Content Script Context**: Cannot directly access page JavaScript, only DOM

## Common Modifications

**Adding New Keywords:**
Update default settings in `background.js:setupDefaultSettings()` or through popup UI.

**Adjusting Rate Limits:**
Modify `maxProfilesPerDay` in settings. Safe ranges: 50-80 for free accounts, up to 150 for premium.

**Changing Confidence Thresholds:**
- `linkedin.js:scanPost()` uses >0.5 threshold with notification
- `linkedin.js:scanCurrentPage()` uses >0.4 threshold for auto-save
- Adjust in respective files

**Adding New Detection Patterns:**
Add to `job-detector.js`:
- `extractJobTitle()` - regex patterns for job titles
- `calculateConfidence()` - keyword lists and scoring weights
- New scan methods following pattern: `async scanX() → analyzeX(element) → return opportunity`

## Feature Roadmap & Enhancement Ideas

### 🚀 High Priority Features

**1. Application Tracking System**
- Track which jobs you've applied to (status: interested, applied, interviewing, rejected, offer)
- Integration with LinkedIn's "Easy Apply" button automation
- Application history with timestamps, notes, and follow-up reminders
- CSV/JSON export of applications for external tracking

**2. Response Analytics**
- Track connection acceptance rate (% of requests accepted)
- A/B testing for message templates (which messages get better response?)
- Time-of-day analysis (best times to send connection requests)
- Role-specific acceptance rates (which roles respond best?)

**3. Smart Opportunity Scoring**
- ML-based scoring using your historical actions (which jobs you clicked/saved)
- Salary estimation based on title, location, company
- Company rating integration (if available in feed)
- Role fit score based on your skills/experience (configurable profile)

**4. Follow-up Automation**
- Auto-message accepted connections after 1-2 days
- Thank you messages for new connections
- Periodic check-ins with network (e.g., congratulate on work anniversaries)
- Follow-up on unanswered applications

**5. Job Alert Notifications**
- Browser notifications for high-confidence opportunities
- Daily digest email (if user configures SMTP)
- Slack/Discord webhooks for new opportunities
- Priority alerts for dream companies (user-configurable list)

### 💡 Medium Priority Features

**6. Company Research Automation**
- Auto-fetch company size, industry, funding stage from LinkedIn
- Glassdoor rating integration (via web scraping or API)
- Recent company news/updates
- Employee growth trends (expanding vs contracting)

**7. Skills Gap Analysis**
- Parse job requirements from posts
- Compare against your skills (configurable profile)
- Suggest learning resources for missing skills
- Track most in-demand skills in your target roles

**8. Network Intelligence**
- Identify 2nd-degree connections at target companies
- Suggest mutual connections for warm introductions
- Track which of your connections are hiring
- Alumni network detection (school, previous companies)

**9. Message Template Library**
- Multiple message template sets (formal, casual, tech-focused)
- Template variables (${company}, ${role}, ${mutualConnection})
- Template performance tracking (acceptance rates)
- Industry-specific templates (tech, finance, healthcare, etc.)

**10. Geographic Targeting**
- Filter opportunities by location/remote preference
- Target connections in specific cities/regions
- Commute time estimation (if location services enabled)
- Relocation-friendly job filtering

### 🔧 Low Priority / Nice to Have

**11. Profile Optimization Suggestions**
- Analyze your LinkedIn profile for keyword density
- Suggest headline improvements based on target roles
- Recommend skills to add for better visibility
- Profile completeness score

**12. Competitor Analysis**
- Track what similar profiles are doing (job changes, skills added)
- Industry trend analysis (which skills are growing)
- Salary benchmarking for your role/experience level

**13. Interview Preparation**
- Company-specific interview questions (scraped from Glassdoor/Blind)
- Common technical questions for your roles
- Behavioral question bank with STAR method templates

**14. Chrome Sync Across Devices**
- Sync opportunities, settings, and stats across multiple computers
- Cloud backup of connection messages and templates
- Multi-device coordination (don't exceed daily limits across devices)

**15. Advanced Scheduling**
- Schedule connection requests for optimal times
- Batch operations (send 5 requests at 9am, 5 at 2pm, 5 at 6pm)
- "Smart hours" mode (only operate during business hours in target timezone)

### ⚠️ Technical Improvements

**16. Performance Optimizations**
- IndexedDB for large datasets (thousands of opportunities)
- Lazy loading for popup UI
- Background processing for heavy analysis
- Memory leak detection and prevention

**17. Better Error Handling**
- Retry logic for failed connection requests
- LinkedIn rate limit detection and auto-pause
- Account safety monitoring (unusual activity warnings)
- Graceful degradation when DOM structure changes

**18. Testing & Quality**
- Unit tests for utility functions
- Integration tests for message flows
- Mock LinkedIn pages for testing
- Automated UI testing with Puppeteer

**19. User Experience**
- Dark mode support
- Keyboard shortcuts for common actions
- Onboarding tutorial for new users
- Progress indicators for long-running operations

**20. Security & Privacy**
- End-to-end encryption for sensitive data
- Local-only processing (no external servers)
- Data export and deletion (GDPR compliance)
- Audit log of all automated actions

### 🎯 Current Features (Implemented)

✅ Automated job opportunity detection from LinkedIn feed
✅ Network expansion with personalized connection requests
✅ Role rotation for diverse networking
✅ Random profile selection for natural behavior
✅ Human-like typing and delays
✅ Daily rate limiting (30 connections/day)
✅ Context-aware messaging (hiring vs networking)
✅ UK English grammar in messages
✅ Stop/start controls for automated expansion
✅ Configurable connections per role
✅ Manual scan functionality
✅ Opportunity confidence scoring
✅ Settings persistence via Chrome Storage

---

**Note on Implementation Priority:**

High priority features (#1-5) directly improve job search success rates and user safety. Medium priority (#6-10) enhance decision-making and efficiency. Low priority (#11-15) are quality-of-life improvements. Technical improvements (#16-20) ensure long-term maintainability and user safety.

When implementing new features, always consider:
1. **LinkedIn ToS compliance** - Avoid aggressive automation that could trigger account restrictions
2. **Human behavior mimicry** - All automation should appear natural
3. **Conservative rate limits** - Better to be slow and safe than fast and banned
4. **User control** - Users should always be able to stop/configure automation
5. **Transparency** - Clear logging of what the extension is doing
