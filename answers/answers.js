// Application Answers page: the saved answers Auto Apply uses for Easy Apply questions

const YES_NO_FIELDS = [
  { key: 'ukWorkAuth', label: 'Legally allowed to work in the UK' },
  { key: 'needsSponsorship', label: 'Need visa sponsorship (now or in future)' },
  { key: 'hasDrivingLicence', label: 'Hold a full UK driving licence' },
  { key: 'willingToCommute', label: "Happy to commute to the job's location" },
  { key: 'willingToRelocate', label: 'Willing to relocate' },
  { key: 'comfortableRemote', label: 'Comfortable working remotely' },
  { key: 'comfortableHybrid', label: 'Comfortable working hybrid' },
  { key: 'comfortableOnsite', label: 'Comfortable working on-site / in the office' },
  { key: 'backgroundCheck', label: 'Willing to undergo background checks (DBS, references, credit)' },
  { key: 'hasCriminalRecord', label: 'Have unspent criminal convictions' },
  { key: 'needsAdjustments', label: 'Need reasonable adjustments for interviews' }
];

const TEXT_FIELDS = ['certifications', 'noticePeriod', 'linkedinUrl', 'websiteUrl', 'githubUrl'];
const NUMBER_FIELDS = ['totalYears', 'salaryExpectation'];
const SELECT_FIELDS = ['clearanceLevel', 'educationLevel', 'englishProficiency'];

class AnswersPage {
  constructor() {
    this.settings = {};
    this.dirty = false;
    this.init().catch(error => {
      console.error('[Answers] Initialisation error:', error);
      this.setStatus('Could not load your answers: ' + error.message, 'unsaved');
    });
  }

  async init() {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    this.settings = response.settings || {};

    this.renderYesNoFields();
    this.fillForm(this.settings.answerBank || {});
    this.bindEvents();
    await this.loadWaitingQuestions();

    // Refresh the waiting list when an application run records new questions
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.unansweredQuestions) {
        this.loadWaitingQuestions();
      }
    });
  }

  // ---- Form ------------------------------------------------------------------

  yesNoOptions(select) {
    select.innerHTML = '';
    for (const [value, text] of [['', 'Not set (ask me)'], ['yes', 'Yes'], ['no', 'No']]) {
      select.appendChild(new Option(text, value));
    }
  }

  renderYesNoFields() {
    const grid = document.getElementById('yesNoGrid');
    for (const { key, label } of YES_NO_FIELDS) {
      const wrapper = document.createElement('label');
      wrapper.className = 'field';
      const caption = document.createElement('span');
      caption.textContent = label;
      const select = document.createElement('select');
      select.id = key;
      select.className = 'yes-no';
      wrapper.append(caption, select);
      grid.appendChild(wrapper);
    }
    document.querySelectorAll('select.yes-no').forEach(select => this.yesNoOptions(select));
  }

  fillForm(bank) {
    const toYesNo = (value) => (value === true ? 'yes' : value === false ? 'no' : '');
    document.querySelectorAll('select.yes-no').forEach(select => {
      select.value = toYesNo(bank[select.id]);
    });
    SELECT_FIELDS.forEach(id => { document.getElementById(id).value = bank[id] || ''; });
    NUMBER_FIELDS.forEach(id => {
      document.getElementById(id).value = bank[id] === null || bank[id] === undefined ? '' : bank[id];
    });
    TEXT_FIELDS.forEach(id => {
      const value = bank[id];
      document.getElementById(id).value = Array.isArray(value) ? value.join(', ') : (value || '');
    });

    document.getElementById('skillsBody').innerHTML = '';
    (bank.skills || []).forEach(skill => this.addRow('skillsBody', skill.skill, skill.years));
    this.updateEmptyRow('skillsBody', 'No skills added yet.');

    document.getElementById('customBody').innerHTML = '';
    (bank.customAnswers || []).forEach(rule => this.addRow('customBody', rule.match, rule.answer));
    this.updateEmptyRow('customBody', 'No answers of your own yet.');

    this.highlightSetSelects();
  }

  // Read the form into an answerBank object
  readForm() {
    const bank = {};
    const fromYesNo = (value) => (value === 'yes' ? true : value === 'no' ? false : null);
    document.querySelectorAll('select.yes-no').forEach(select => {
      bank[select.id] = fromYesNo(select.value);
    });
    SELECT_FIELDS.forEach(id => { bank[id] = document.getElementById(id).value; });
    NUMBER_FIELDS.forEach(id => {
      const value = document.getElementById(id).value.trim();
      bank[id] = value === '' || isNaN(Number(value)) ? null : Number(value);
    });
    TEXT_FIELDS.forEach(id => { bank[id] = document.getElementById(id).value.trim(); });

    bank.skills = this.readRows('skillsBody')
      .map(([skill, years]) => ({ skill, years: years === '' ? null : Number(years) }))
      .filter(row => row.skill && Number.isFinite(row.years));
    bank.customAnswers = this.readRows('customBody')
      .map(([match, answer]) => ({ match, answer }))
      .filter(row => row.match && row.answer);
    return bank;
  }

  addRow(bodyId, first = '', second = '') {
    const body = document.getElementById(bodyId);
    const isSkill = bodyId === 'skillsBody';
    const row = document.createElement('tr');

    const firstInput = document.createElement('input');
    firstInput.type = 'text';
    firstInput.value = first;
    firstInput.placeholder = isSkill ? 'e.g. Linux' : 'e.g. how did you hear';

    const secondInput = document.createElement('input');
    secondInput.type = isSkill ? 'number' : 'text';
    if (isSkill) secondInput.min = '0';
    secondInput.value = second ?? '';
    secondInput.placeholder = isSkill ? 'Years' : 'e.g. LinkedIn';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-btn';
    remove.title = 'Remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      row.remove();
      this.updateEmptyRow(bodyId, isSkill ? 'No skills added yet.' : 'No answers of your own yet.');
      this.markDirty();
    });

    for (const element of [firstInput, secondInput, remove]) {
      const cell = document.createElement('td');
      cell.appendChild(element);
      row.appendChild(cell);
    }
    body.querySelector('.empty-row')?.remove();
    body.appendChild(row);
    return firstInput;
  }

  readRows(bodyId) {
    return Array.from(document.getElementById(bodyId).querySelectorAll('tr:not(.empty-row)'))
      .map(row => Array.from(row.querySelectorAll('input')).map(input => input.value.trim()));
  }

  updateEmptyRow(bodyId, message) {
    const body = document.getElementById(bodyId);
    const hasRows = body.querySelector('tr:not(.empty-row)');
    const emptyRow = body.querySelector('.empty-row');
    if (!hasRows && !emptyRow) {
      const row = document.createElement('tr');
      row.className = 'empty-row';
      const cell = document.createElement('td');
      cell.colSpan = 3;
      cell.textContent = message;
      row.appendChild(cell);
      body.appendChild(row);
    } else if (hasRows && emptyRow) {
      emptyRow.remove();
    }
  }

  highlightSetSelects() {
    document.querySelectorAll('#answersForm select').forEach(select => {
      select.classList.toggle('is-set', select.value !== '');
    });
  }

  bindEvents() {
    const form = document.getElementById('answersForm');
    form.addEventListener('input', () => this.markDirty());
    form.addEventListener('change', () => {
      this.markDirty();
      this.highlightSetSelects();
    });

    document.getElementById('addSkillBtn').addEventListener('click', () => {
      this.addRow('skillsBody').focus();
      this.markDirty();
    });
    document.getElementById('addCustomBtn').addEventListener('click', () => {
      this.addRow('customBody').focus();
      this.markDirty();
    });
    document.getElementById('saveBtn').addEventListener('click', () => this.save());

    document.getElementById('tryQuestion').addEventListener('input', () => this.tryQuestion());
    document.getElementById('tryType').addEventListener('change', () => this.tryQuestion());

    window.addEventListener('beforeunload', (event) => {
      if (this.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  markDirty() {
    this.dirty = true;
    this.setStatus('Unsaved changes', 'unsaved');
    this.tryQuestion();
  }

  setStatus(text, type = '') {
    const status = document.getElementById('saveStatus');
    status.textContent = text;
    status.className = type;
  }

  async save() {
    // Merge onto the latest stored settings so nothing saved elsewhere is lost
    const { settings } = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const updated = { ...settings, answerBank: this.readForm() };
    const result = await chrome.runtime.sendMessage({ action: 'updateSettings', settings: updated });
    if (!result || result.error) {
      this.setStatus('Save failed: ' + (result?.error || 'no response from the extension'), 'unsaved');
      return;
    }
    this.settings = updated;
    this.dirty = false;
    this.setStatus('Saved ✓', 'saved');
  }

  // ---- Try a question ------------------------------------------------------

  tryQuestion() {
    const question = document.getElementById('tryQuestion').value.trim();
    const result = document.getElementById('tryResult');
    result.textContent = '';
    if (!question) return;

    const type = document.getElementById('tryType').value;
    const field = type === 'yesno' ? { type: 'radio', options: ['Yes', 'No'] } : { type };
    const resolved = AnswerBank.resolve(question, field, { ...this.settings, answerBank: this.readForm() });

    if (resolved) {
      const answer = document.createElement('span');
      answer.className = 'answer';
      answer.textContent = [].concat(resolved.value).join(', ');
      result.append('Answer: ', answer, ` (from ${resolved.source})`);
    } else {
      const none = document.createElement('span');
      none.className = 'none';
      none.textContent = 'No saved answer. This question would be left for you and the application saved as a draft.';
      result.appendChild(none);
    }
  }

  // ---- Questions waiting for an answer --------------------------------------

  async loadWaitingQuestions() {
    const { questions = [] } = await chrome.runtime.sendMessage({ action: 'getUnansweredQuestions' });
    const panel = document.getElementById('waitingPanel');
    const list = document.getElementById('waitingList');

    panel.classList.toggle('hidden', questions.length === 0);
    document.getElementById('waitingCount').textContent = questions.length;
    list.innerHTML = '';
    questions.forEach(question => list.appendChild(this.renderWaitingItem(question)));
  }

  renderWaitingItem(item) {
    const row = document.createElement('div');
    row.className = 'waiting-item';

    const info = document.createElement('div');
    const question = document.createElement('div');
    question.className = 'question';
    question.textContent = item.question;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Seen ${item.count} time${item.count === 1 ? '' : 's'}` +
      (item.lastJob ? ` · last in ${item.lastJob}` : '');
    info.append(question, meta);

    const { control, read } = this.answerControl(item);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary small';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      const answer = read();
      if (!answer) return;
      saveBtn.disabled = true;
      await chrome.runtime.sendMessage({ action: 'addCustomAnswer', match: item.key, answer, key: item.key });
      // Keep the form in step with what was just saved
      const existing = this.readRows('customBody').findIndex(([match]) => match === item.key);
      if (existing === -1) this.addRow('customBody', item.key, answer);
      this.setStatus(this.dirty ? 'Answer saved; your other changes are not saved yet' : 'Answer saved ✓',
                     this.dirty ? 'unsaved' : 'saved');
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'btn btn-secondary small';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.title = 'Remove from this list without saving an answer';
    dismissBtn.addEventListener('click', () =>
      chrome.runtime.sendMessage({ action: 'removeUnansweredQuestions', keys: [item.key] }));

    actions.append(saveBtn, dismissBtn);
    row.append(info, control, actions);
    return row;
  }

  // An input suited to the question: its options, a number, or free text
  answerControl(item) {
    const options = item.options || [];

    if (item.type === 'checkbox' && options.length > 1) {
      const box = document.createElement('div');
      box.className = 'choices';
      options.forEach(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = option;
        label.append(input, ' ', option);
        box.appendChild(label);
      });
      return {
        control: box,
        read: () => Array.from(box.querySelectorAll('input:checked')).map(input => input.value).join(', ')
      };
    }

    if (options.length > 0) {
      const select = document.createElement('select');
      select.appendChild(new Option('Choose an answer…', ''));
      options.forEach(option => select.appendChild(new Option(option, option)));
      return { control: select, read: () => select.value };
    }

    const input = document.createElement(item.type === 'textarea' ? 'textarea' : 'input');
    if (item.type === 'numeric') {
      input.type = 'number';
      input.min = '0';
      input.placeholder = 'Number';
    } else if (item.type !== 'textarea') {
      input.type = 'text';
      input.placeholder = item.type === 'date' ? 'Dates are left for you' : 'Your answer';
    }
    if (item.type === 'date') input.disabled = true;
    return { control: input, read: () => input.value.trim() };
  }
}

document.addEventListener('DOMContentLoaded', () => new AnswersPage());
