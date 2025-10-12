# Installation Guide - LinkedIn Job Hunter

Quick step-by-step guide to install and configure the LinkedIn Job Hunter extension.

## Prerequisites

- Google Chrome browser (latest version recommended)
- Active LinkedIn account
- Basic understanding of browser extensions

## Installation Steps

### 1. Download Extension Files

Choose one of these methods:

**Option A: Download ZIP**
- Download the extension files to your computer
- Extract the ZIP file to a folder (e.g., `linkedin-job-hunter`)

**Option B: Git Clone**
```bash
git clone <repository-url>
cd linkedin-job-hunter
```

### 2. Enable Chrome Developer Mode

1. Open Google Chrome
2. Go to `chrome://extensions/`
3. Toggle "Developer mode" ON (top-right corner)

### 3. Load the Extension

1. Click "Load unpacked" button
2. Navigate to the `linkedin-job-hunter` folder
3. Select the folder and click "Select Folder"
4. Extension should appear in your extensions list

### 4. Add Icons (Optional)

The extension needs icon files for a complete installation:

1. Create three icon files in the `icons/` folder:
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels) 
   - `icon128.png` (128x128 pixels)

2. Or use any square PNG images and rename them accordingly

**Without icons**: Extension will work but use generic Chrome icons.

### 5. Pin Extension to Toolbar

1. Click the puzzle piece icon in Chrome toolbar
2. Find "LinkedIn Job Hunter"
3. Click the pin icon to keep it visible

## Initial Configuration

### 6. Open LinkedIn

1. Navigate to `https://www.linkedin.com`
2. Make sure you're logged in
3. Look for small green/gray dot in top-right corner (indicates extension is active)

### 7. Configure Settings

1. Click the LinkedIn Job Hunter extension icon
2. Click "⚙️ Settings" to expand settings panel
3. Configure your preferences:

**Recommended Settings for Beginners:**
- Daily Profile Limit: 50 (conservative)
- Min Delay: 3 seconds
- Max Delay: 10 seconds
- Keywords: `hiring, looking for, open position, join our team`
- Target Roles: Add your specific roles (e.g., `developer, engineer`)

4. Click "Save Settings"

### 8. Start Job Hunting

1. Click "Start Hunting" in the extension popup
2. Status indicator should turn green
3. Extension will begin passive monitoring

## Verification Steps

### Check Extension is Working

1. **Status Indicator**: Green dot in top-right corner of LinkedIn pages
2. **Extension Popup**: Shows "Active" status when opened
3. **Browser Console**: Open DevTools → Console tab, look for "LinkedIn Job Hunter initialized" message

### Test Manual Scan

1. Open extension popup
2. Click "Manual Scan"
3. Button should show "Scanning..." temporarily
4. Check if any opportunities appear in popup

### Monitor Activity

- Extension stats update in real-time
- Opportunities appear in "Recent Opportunities" section
- Daily scan count increases as profiles are visited

## Common Issues & Solutions

### Extension Icon Not Visible
- Check `chrome://extensions/` - make sure extension is enabled
- Try refreshing LinkedIn page
- Pin extension to toolbar for easy access

### "Not LinkedIn" Message
- Make sure you're on `linkedin.com` (not mobile or other LinkedIn domains)
- Refresh the page
- Check your internet connection

### No Opportunities Found
- Verify you have recent activity in LinkedIn feed
- Check your keywords match typical job posting language
- Try manual scan first to test functionality

### Settings Not Saving
- Check Chrome permissions for the extension
- Try reloading the extension
- Clear browser cache and try again

### Daily Limit Reached Quickly
- Reduce daily profile limit in settings
- Check if other LinkedIn automation tools are running
- Limits reset at midnight (local time)

## Security Considerations

### Safe Usage Practices

1. **Start Conservative**: Use low daily limits initially
2. **Monitor Account**: Watch for any unusual LinkedIn notifications
3. **Regular Breaks**: Don't run 24/7, take days off
4. **Manual Activity**: Continue normal LinkedIn usage alongside extension

### Warning Signs

Stop using immediately if you notice:
- LinkedIn captcha requests
- Account restriction warnings
- Unusual login verification requests
- Significant decrease in profile views

## Advanced Configuration

### Custom Keywords

Add industry-specific terms:
```
Software: developer, engineer, programmer, coding, software, tech
Marketing: marketing, growth, digital marketing, social media
Sales: sales, account manager, business development, revenue
```

### Role-Specific Settings

**Software Developers:**
- Daily Limit: 80
- Keywords: `hiring developer, software engineer, coding, programming, technical`
- Target Roles: `developer, engineer, programmer, software, frontend, backend, fullstack`

**Marketing Professionals:**
- Daily Limit: 100  
- Keywords: `marketing, growth, digital marketing, brand, campaign`
- Target Roles: `marketing, growth, digital, social media, content, brand`

## Maintenance

### Weekly Tasks
- Review found opportunities
- Adjust keywords based on results
- Check daily usage stats
- Clear old opportunities if needed

### Monthly Tasks
- Update extension if new version available
- Review and optimize settings
- Backup opportunity data if needed

## Support

### Self-Help
1. Check this installation guide
2. Review main README.md file
3. Check browser console for error messages
4. Try disabling/re-enabling extension

### Getting Help
- Create issue with detailed error description
- Include Chrome version and extension version
- Describe steps to reproduce problem
- Share console error messages (if any)

---

**Installation Complete!** 🎉

You should now have LinkedIn Job Hunter running and ready to discover opportunities through your network. Remember to use it responsibly and monitor your LinkedIn account for any issues.