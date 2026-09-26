// Settings backup & restore

// Settings that start automation; never switched on by an import
const RUNTIME_FLAGS = ['scanEnabled', 'networkExpansionEnabled', 'jobApplicationEnabled'];
// Accepting the terms is done on each computer, not copied from a backup
const NOT_IMPORTED = [...RUNTIME_FLAGS, 'termsAccepted'];

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
}

async function exportSettings() {
  const { settings } = await chrome.runtime.sendMessage({ action: 'getSettings' });
  const backup = {
    type: 'jobtrail-settings',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jobtrail-settings-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('Settings exported.', 'ok');
}

async function importSettings() {
  const file = await CsvUtils.pickFile('.json,application/json');
  if (!file) return;

  let data;
  try {
    data = JSON.parse(file.text);
  } catch {
    showStatus(`"${file.name}" isn't a settings file (it isn't valid JSON).`, 'error');
    return;
  }

  // Accept the wrapped backup format, or a bare settings object
  // Also accepts backups made before the rename
  const isBackup = data && ['jobtrail-settings', 'linkedin-job-hunter-settings'].includes(data.type);
  const imported = isBackup ? data.settings : data;
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
    showStatus(`"${file.name}" doesn't contain any settings.`, 'error');
    return;
  }

  const { settings: current = {} } = await chrome.runtime.sendMessage({ action: 'getSettings' });
  const merged = { ...current };
  const applied = [];
  const skipped = [];

  for (const [key, value] of Object.entries(imported)) {
    if (NOT_IMPORTED.includes(key)) continue;

    // Reject values whose type doesn't match the existing setting
    const existing = current[key];
    const bothSet = existing !== undefined && existing !== null && value !== null;
    if (bothSet && (Array.isArray(existing) !== Array.isArray(value) || typeof existing !== typeof value)) {
      skipped.push(key);
      continue;
    }

    merged[key] = value;
    applied.push(key);
  }

  if (applied.length === 0) {
    showStatus(`No usable settings found in "${file.name}".`, 'error');
    return;
  }

  if (!confirm(`Replace your current settings with the ${applied.length} setting(s) from "${file.name}"?`)) {
    return;
  }

  const result = await chrome.runtime.sendMessage({ action: 'updateSettings', settings: merged });
  if (!result || result.error) {
    showStatus('Import failed: ' + (result?.error || 'no response from the extension'), 'error');
    return;
  }

  showStatus(`Imported ${applied.length} setting(s) from "${file.name}".` +
    (skipped.length ? `\nSkipped (unexpected values): ${skipped.join(', ')}` : '') +
    '\nScanning and automation stay switched off until you start them.', 'ok');
}

document.addEventListener('DOMContentLoaded', () => {
  const handle = (fn) => () => fn().catch(error => {
    console.error('[Backup]', error);
    showStatus('Something went wrong: ' + error.message, 'error');
  });
  document.getElementById('exportSettingsBtn').addEventListener('click', handle(exportSettings));
  document.getElementById('importSettingsBtn').addEventListener('click', handle(importSettings));
});
