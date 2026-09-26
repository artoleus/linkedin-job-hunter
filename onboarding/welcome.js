// First-run page: the user accepts the Terms of Use before any automation can start
class WelcomePage {
  constructor() {
    this.agreeTerms = document.getElementById('agreeTerms');
    this.agreeRisk = document.getElementById('agreeRisk');
    this.acceptBtn = document.getElementById('acceptBtn');

    document.getElementById('version').textContent = `Version ${chrome.runtime.getManifest().version}`;
    const updateButton = () => { this.acceptBtn.disabled = !(this.agreeTerms.checked && this.agreeRisk.checked); };
    this.agreeTerms.addEventListener('change', updateButton);
    this.agreeRisk.addEventListener('change', updateButton);
    this.acceptBtn.addEventListener('click', () => this.accept());
    document.getElementById('openAnswers').addEventListener('click', () =>
      chrome.tabs.create({ url: chrome.runtime.getURL('answers/answers.html') }));
    document.getElementById('openBackup').addEventListener('click', () =>
      chrome.tabs.create({ url: chrome.runtime.getURL('backup-restore/backup.html') }));

    this.load();
  }

  async load() {
    const { settings = {} } = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (Terms.isAccepted(settings)) this.showAccepted(settings.termsAccepted.date);
  }

  async accept() {
    this.acceptBtn.disabled = true;
    try {
      // Merge onto the latest settings so nothing saved elsewhere is overwritten
      const { settings = {} } = await chrome.runtime.sendMessage({ action: 'getSettings' });
      const termsAccepted = { version: Terms.VERSION, date: new Date().toISOString() };
      const result = await chrome.runtime.sendMessage({ action: 'updateSettings', settings: { ...settings, termsAccepted } });
      if (result?.error) throw new Error(result.error);
      this.showAccepted(termsAccepted.date);
    } catch (error) {
      const message = document.getElementById('acceptError');
      message.textContent = `Could not save: ${error.message}`;
      message.hidden = false;
      this.acceptBtn.disabled = false;
    }
  }

  showAccepted(date) {
    document.getElementById('acceptForm').hidden = true;
    const note = document.getElementById('acceptedNote');
    note.textContent = `✓ Terms accepted${date ? ` on ${new Date(date).toLocaleDateString()}` : ''}. You're ready to set up.`;
    note.hidden = false;
    document.getElementById('setupStep').classList.remove('locked');
  }
}

document.addEventListener('DOMContentLoaded', () => new WelcomePage());
