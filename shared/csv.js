// CSV helpers shared by the analytics and applications dashboards

const CsvUtils = {
  // Quote a CSV cell: double embedded quotes, and prefix values that
  // spreadsheet apps would treat as formulas (CSV injection)
  cell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) {
      text = "'" + text;
    }
    return `"${text.replace(/"/g, '""')}"`;
  },

  toCsv(rows) {
    return rows.map(row => row.map(value => CsvUtils.cell(value)).join(',')).join('\n');
  },

  download(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Parse CSV text into rows of cells. Handles quoted cells, doubled quotes,
  // newlines inside quotes, CRLF line endings, a UTF-8 BOM, and semicolon
  // delimiters (Excel uses these in some locales).
  parse(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }

    if (cell !== '' || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    return rows.filter(r => r.some(c => c.trim() !== ''));
  },

  // Undo the formula-injection guard added by cell()
  uncell(value) {
    const text = (value || '').trim();
    return /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
  },

  // Parse CSV text into objects keyed by lower-cased header names
  parseObjects(text) {
    const [header, ...rows] = CsvUtils.parse(text);
    if (!header) return [];
    const keys = header.map(h => CsvUtils.uncell(h).toLowerCase());
    return rows.map(cells =>
      Object.fromEntries(keys.map((key, i) => [key, CsvUtils.uncell(cells[i])])));
  },

  // First non-empty value among the given column names
  column(row, ...names) {
    for (const name of names) {
      if (row[name]) return row[name];
    }
    return '';
  },

  // Parse an exported ISO date, or a UK-style date as re-saved by Excel
  // (DD/MM/YYYY HH:MM). Returns null when the value isn't a valid date.
  parseDate(value) {
    if (!value) return null;

    const uk = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (uk) {
      const [, day, month, yearText, hours = '0', minutes = '0', seconds = '0'] = uk;
      const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
      if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
      const date = new Date(year, Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
      return isNaN(date) ? null : date;
    }

    const date = new Date(value);
    return isNaN(date) ? null : date;
  },

  // Let the user pick a CSV/JSON file and resolve with its text
  pickFile(accept = '.csv,text/csv') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.addEventListener('change', async () => {
        const file = input.files[0];
        resolve(file ? { name: file.name, text: await file.text() } : null);
      });
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }
};

window.CsvUtils = CsvUtils;
