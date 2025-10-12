# LinkedIn Job Hunter 🎯

A Chrome browser extension that automatically discovers job opportunities through your LinkedIn network using human-like behavior patterns.

## ⚠️ Important Disclaimers

**Legal & Ethical Use:** This extension is for educational and personal productivity purposes. Users are responsible for complying with LinkedIn's Terms of Service. Use responsibly and respect rate limits.

**Detection Risk:** While designed to mimic human behavior, automated tools may still be detected. Use conservative settings and monitor your account.

## Features

- **Smart Opportunity Detection**: Automatically identifies job postings, hiring announcements, and career opportunities in your LinkedIn feed
- **Network Crawling**: Scans your extended network for warm opportunities from connections
- **Human-like Behavior**: Implements realistic delays, scrolling patterns, and interaction timing
- **Rate Limiting**: Conservative daily limits (80-150 profiles) to avoid detection
- **Keyword Matching**: Customizable keywords for targeted job discovery
- **Local Storage**: All data stored locally for privacy
- **Real-time Monitoring**: Live scanning of feed updates and profile changes

## Installation

### Method 1: Chrome Web Store (Recommended)
*Coming soon - extension will be submitted to Chrome Web Store*

### Method 2: Manual Installation (Developer Mode)

1. **Download the Extension**
   ```bash
   git clone <repository-url>
   cd linkedin-job-hunter
   ```

2. **Enable Developer Mode**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the `linkedin-job-hunter` folder
   - The extension icon should appear in your toolbar

4. **Add Icons** (Optional)
   - Add icon files: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
   - Or the extension will use default Chrome icons

## Usage

### Getting Started

1. **Navigate to LinkedIn**
   - The extension only works on `linkedin.com`
   - You'll see a small green/gray indicator dot in the top-right corner

2. **Open Extension Popup**
   - Click the extension icon in Chrome toolbar
   - Configure your settings (recommended on first use)

3. **Start Job Hunting**
   - Click "Start Hunting" to enable automatic scanning
   - Use "Manual Scan" for immediate opportunity discovery

### Settings Configuration

**Daily Profile Limit**: Maximum profiles to scan per day (default: 80)
- Free accounts: Stay under 80
- Premium accounts: Can use up to 150

**Scan Delays**: Timing between actions (default: 2-8 seconds)
- Increase for safer operation
- Decrease for faster scanning (higher risk)

**Keywords**: Job-related terms to detect (comma-separated)
```
hiring, looking for, open position, join our team, we are hiring, career opportunity
```

**Target Roles**: Your job interests (comma-separated)
```
developer, engineer, programmer, software, frontend, backend
```

## How It Works

### Detection Methods

1. **Feed Post Analysis**
   - Scans LinkedIn feed for hiring-related keywords
   - Analyzes post content and author information
   - Extracts job titles, companies, and contact details

2. **Profile Change Detection**
   - Identifies connections who changed to hiring roles
   - Detects new "Hiring Manager" or "Recruiter" titles
   - Monitors job change announcements

3. **Company Update Monitoring**
   - Scans company pages for hiring announcements
   - Detects "We're hiring" and growth-related posts
   - Identifies team expansion signals

### Human-like Behavior

- **Random Delays**: 2-8 second pauses between actions
- **Realistic Scrolling**: Natural mouse movements and scroll patterns  
- **Session Breaks**: Automatic pauses to simulate breaks
- **Gradual Ramp-up**: Starts with low activity, increases over time
- **Browser Integration**: Uses your authenticated session (no separate login)

## Safety Features

### Rate Limiting
- **Daily Limits**: Automatically stops at configured thresholds
- **Time Tracking**: Resets limits at midnight
- **Progress Monitoring**: Real-time stats in popup

### Detection Avoidance
- **Session-based**: Uses your legitimate LinkedIn session
- **No External APIs**: All operations through browser content scripts
- **Organic Browsing**: Mimics manual navigation patterns
- **Conservative Defaults**: Safe limits out of the box

## Data Privacy

- **Local Storage Only**: All opportunities stored on your device
- **No Data Transmission**: Nothing sent to external servers
- **User Control**: Delete data anytime through settings
- **No Personal Info**: Only public profile data accessed

## Troubleshooting

### Extension Not Working
- Ensure you're on `linkedin.com` (not mobile.linkedin.com)
- Refresh the LinkedIn page
- Check that extension is enabled in Chrome

### No Opportunities Found
- Verify keywords match your target roles
- Check that scanning is enabled (green indicator)
- Try manual scan first
- Review LinkedIn feed activity

### Daily Limit Reached
- Limits reset at midnight
- Adjust settings if needed
- Consider premium LinkedIn for higher limits

### Account Safety
- Use conservative daily limits
- Monitor for unusual LinkedIn behavior
- Take breaks between intensive scanning sessions

## File Structure

```
linkedin-job-hunter/
├── manifest.json           # Extension configuration
├── background.js           # Service worker
├── content/
│   ├── linkedin.js         # Main content script
│   ├── network-crawler.js  # Network scanning logic  
│   └── job-detector.js     # Opportunity detection
├── popup/
│   ├── popup.html          # Extension interface
│   ├── popup.css           # Styling
│   └── popup.js            # Popup controller
├── storage/
│   └── storage.js          # Data management
└── icons/
    ├── icon16.png          # Extension icons
    ├── icon48.png
    └── icon128.png
```

## Development

### Prerequisites
- Chrome browser
- Basic knowledge of HTML/CSS/JavaScript
- Understanding of Chrome extension development

### Building
No build process required - extension runs directly from source files.

### Testing
1. Load extension in developer mode
2. Open LinkedIn in new tab
3. Check browser console for logs
4. Test features through popup interface

### Contributing
Contributions welcome! Please:
- Follow existing code style
- Add comments for complex logic
- Test thoroughly before submitting
- Respect LinkedIn's terms of service

## Limitations

- **LinkedIn Only**: Designed specifically for LinkedIn
- **Chrome Only**: Currently only supports Chrome browser
- **Detection Risk**: LinkedIn may update their bot detection
- **Rate Limits**: Conservative limits to avoid account issues
- **English Content**: Optimized for English-language job posts

## Disclaimer

This tool is provided for educational and productivity purposes. Users assume all responsibility for compliance with LinkedIn's Terms of Service and applicable laws. The developers are not responsible for account suspensions, bans, or other consequences resulting from use of this extension.

**Use at your own risk and always respect LinkedIn's guidelines.**

## Version History

### v1.0 (Initial Release)
- Basic opportunity detection
- Network crawling with rate limiting
- Human behavior simulation
- Chrome Manifest V3 support
- Local data storage

---

**LinkedIn Job Hunter** - Discover opportunities through your network 🎯