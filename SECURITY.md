# Security Policy

## Overview

LinkedIn Job Hunter is designed with privacy and security as top priorities. This document outlines our security practices and how to report vulnerabilities.

## Data Privacy

### What We DON'T Collect
- ❌ No personal identifiable information (PII)
- ❌ No passwords or credentials
- ❌ No browsing history
- ❌ No analytics or telemetry
- ❌ No data sent to external servers
- ❌ No tracking cookies
- ❌ No API keys required

### What Stays Local
- ✅ All job opportunities found
- ✅ Your search preferences
- ✅ Connection analytics
- ✅ Application history
- ✅ User-configured settings (name, email, phone, location - if you choose to enter them)

All data is stored locally on your device using Chrome's encrypted storage API. Nothing is transmitted externally.

## Security Features

### 1. Local-Only Storage
- All data stored using `chrome.storage.local` (encrypted by Chrome)
- No cloud synchronization
- No external database connections
- Data isolated per Chrome user profile

### 2. No External Communications
- No API calls to external services
- No data exfiltration
- Only communicates with LinkedIn.com (the site you're already on)
- Uses your existing LinkedIn session

### 3. Minimal Permissions
The extension only requests necessary permissions:
- `storage`: To save settings and opportunities locally
- `activeTab`: To interact with LinkedIn pages you're viewing
- `scripting`: To inject content scripts on LinkedIn
- `tabs`: To manage LinkedIn tabs for connection monitoring

### 4. Open Source
- All code is publicly available for audit
- No obfuscated or minified code in repository
- Transparent functionality

## User-Provided Data

Some features require you to optionally provide personal information:

### Job Application Auto-fill (Optional)
- Your name
- Your email address
- Your phone number
- Your home location (for distance calculations)

**Important**:
- This information is **only stored locally** on your device
- You must manually enter this information - we don't collect it
- It's only used to auto-fill job applications
- You can clear this data anytime by removing the extension

### How to Protect Your Data
1. **Don't commit personal data to git**: If forking/modifying, never commit your personal settings
2. **Use .gitignore**: The included `.gitignore` file prevents accidental commits of personal data
3. **Review before sharing**: If sharing logs or screenshots, redact personal information
4. **Remove before uninstalling**: Clear your data through settings before removing the extension

## Excluded Files (Never Committed to Git)

The following files are excluded from version control to protect user data:

```
*.personal
user-data.json
settings.json
user-settings.json
*.key
*.secret
*.token
.env
.env.local
*.log
```

## Reporting Security Issues

If you discover a security vulnerability, please:

1. **DO NOT** open a public GitHub issue
2. Email the repository owner privately with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We take security issues seriously and will respond promptly.

## Security Best Practices for Users

### Installation
- Only install from trusted sources (official repository or Chrome Web Store)
- Review permissions before installing
- Keep the extension updated

### Usage
- Use conservative daily limits to avoid LinkedIn detection
- Don't share your Chrome profile with others while extension is active
- Review analytics data before sharing screenshots
- Clear your data if using a shared computer

### Development
- If modifying the code, never hardcode personal information
- Use environment variables for testing data
- Don't commit Chrome storage data
- Review diffs before pushing to ensure no PII

## Compliance

### LinkedIn Terms of Service
Users are responsible for compliance with LinkedIn's Terms of Service. This extension:
- Uses conservative rate limits
- Implements human-like behavior patterns
- Avoids aggressive automation
- Operates within your existing LinkedIn session

### GDPR Considerations
- No data processing outside user's device
- User has full control over their data
- Data can be deleted at any time
- No data sharing with third parties

## Code Review Checklist

Before committing code, verify:

- [ ] No hardcoded personal information (names, emails, phones, addresses)
- [ ] No API keys or tokens
- [ ] No credentials or passwords
- [ ] Sensitive data uses placeholder values
- [ ] New features follow local-storage-only principle
- [ ] No external API calls added
- [ ] Privacy policy updated if data handling changes

## Version History

### v1.2 (Current)
- Removed hardcoded location data from defaults
- Added comprehensive .gitignore for sensitive files
- Added SECURITY.md documentation
- Enhanced privacy documentation in README

### v1.1
- Initial security review
- Local storage only implementation

### v1.0
- Basic security measures
- Chrome storage API usage

---

**Last Updated**: 2025-10-15

For questions about security practices, please open a GitHub discussion (not an issue).
