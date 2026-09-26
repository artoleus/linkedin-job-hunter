// Answers for LinkedIn Easy Apply questions.
//
// Answers come only from what the user has saved (settings.answerBank, plus
// name/email/phone from the popup settings). A question the saved answers
// don't cover is left unanswered, so the application is kept as a draft for
// the user to finish; nothing is guessed.
//
// Used by the job applicator (content script) and the Application Answers page.
// Depends on TextUtils (shared/text-utils.js).

const AnswerBank = {
  CLEARANCE_LEVELS: ['none', 'bpss', 'ctc', 'sc', 'dv', 'edv'],
  CLEARANCE_LABELS: {
    none: ['None', 'No clearance', 'No'],
    bpss: ['BPSS', 'Baseline Personnel Security Standard', 'Baseline'],
    ctc: ['CTC', 'Counter Terrorist Check'],
    sc: ['SC', 'Security Check'],
    dv: ['DV', 'Developed Vetting'],
    edv: ['eDV', 'Enhanced DV', 'Enhanced Developed Vetting']
  },

  EDUCATION_LEVELS: ['secondary', 'alevel', 'foundation', 'bachelors', 'masters', 'doctorate'],
  EDUCATION_LABELS: {
    secondary: ['GCSEs', 'High school', 'Secondary school'],
    alevel: ['A-levels', 'A-level', 'College', 'Sixth form'],
    foundation: ['Foundation degree', 'HND', 'Associate degree', "Associate's degree"],
    bachelors: ["Bachelor's degree", 'Bachelors', 'Bachelor', 'Undergraduate degree', 'Degree'],
    masters: ["Master's degree", 'Masters', 'Master', 'Postgraduate degree'],
    doctorate: ['Doctorate', 'PhD', 'Doctoral degree']
  },

  ENGLISH_LEVELS: ['basic', 'conversational', 'professional', 'native'],
  ENGLISH_LABELS: {
    basic: ['Elementary', 'Basic', 'Beginner'],
    conversational: ['Conversational', 'Limited working', 'Intermediate'],
    professional: ['Professional', 'Full professional', 'Professional working', 'Fluent', 'Advanced'],
    native: ['Native or bilingual', 'Native', 'Bilingual', 'Fluent']
  },

  // Canonical form of a question, used for matching and as a storage key
  normalizeQuestion(text) {
    return TextUtils.normalize(TextUtils.dedupeRepeatedText(text))
      .replace(/\*/g, '')
      .replace(/\(?\s*required\s*\)?\s*$/, '')
      .replace(/[\s?:.!]+$/, '')
      .trim();
  },

  // The whole question or its last sentence ("This role needs SC. Do you hold it?")
  isYesNoQuestion(q) {
    const yesNoStart = /^(do|does|are|is|have|has|would|will|can|could|did|were|was)\b/;
    return yesNoStart.test(q) || yesNoStart.test(q.split(/[.!?:]\s+/).pop());
  },

  // Whole-word/phrase match; longer phrases may also match inside words
  // ("certif" matches "certification", but "java" won't match "javascript")
  phraseMatches(q, phrase) {
    const p = AnswerBank.normalizeQuestion(phrase);
    if (!p) return false;
    return TextUtils.containsWord(q, p) || (p.length >= 6 && q.includes(p));
  },

  parseNumber(text) {
    const match = String(text).toLowerCase().replace(/[£$€,\s]/g, '').match(/(\d+(?:\.\d+)?)(k)?/);
    return match ? parseFloat(match[1]) * (match[2] ? 1000 : 1) : null;
  },

  // All numbers in a string, with "k" suffixes expanded (for salary checks)
  numbersIn(text) {
    return (String(text).toLowerCase().replace(/[£$€,]/g, '')
      .match(/\d+(?:\.\d+)?\s*k?\b/g) || [])
      .map(n => parseFloat(n) * (/k$/.test(n.trim()) ? 1000 : 1));
  },

  // "1 month" -> 30, "2 weeks" -> 14, "Immediately" -> 0; null if no duration
  parseDurationDays(text) {
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
    const t = TextUtils.normalize(text).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, w => words[w]);
    if (/\b(immediate(ly)?|asap|straight away|right away|no notice|available now|now)\b/.test(t)) return 0;
    const match = t.match(/(\d+(?:\.\d+)?)\s*(day|week|month|year)s?\b/);
    if (!match) return null;
    return Math.round(parseFloat(match[1]) * { day: 1, week: 7, month: 30, year: 365 }[match[2]]);
  },

  // Numeric range an option label describes: "3-5 years", "10+", "Less than 1 year"
  parseRange(label) {
    const t = TextUtils.normalize(label)
      .replace(/[£$€,]/g, '')
      .replace(/(\d+(?:\.\d+)?)\s*k\b/g, (_, n) => String(parseFloat(n) * 1000));
    let m;
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/))) return [+m[1], +m[2]];
    if ((m = t.match(/(?:more than|over|above|greater than)\s*(\d+(?:\.\d+)?)/))) return [+m[1] + 1e-9, Infinity];
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:\+|or more|and above|plus|or above)/))) return [+m[1], Infinity];
    if ((m = t.match(/(?:less than|under|below|fewer than)\s*(\d+(?:\.\d+)?)/))) return [0, +m[1] - 1e-9];
    if (/^(none|no experience|no)$/.test(t)) return [0, 0];
    if ((m = t.match(/^(\d+(?:\.\d+)?)(?:\s*years?)?$/))) return [+m[1], +m[1]];
    return null;
  },

  mentionsOtherCountry(q) {
    return /\b(united states|usa|u\.s\.|america|canada|ireland|australia|germany|france|netherlands|spain|italy|india|european union|the eu|switzerland|singapore|new zealand|uae|united arab emirates|dubai)\b/.test(q);
  },

  // ---- Choosing an option -------------------------------------------------

  hasYesNo(options) {
    const labels = options.map(o => TextUtils.normalize(o));
    return labels.some(l => /^yes\b/.test(l)) && labels.some(l => /^no\b/.test(l));
  },

  pickYesNo(options, yes) {
    const pattern = yes ? /^yes\b/ : /^no\b/;
    return options.find(o => pattern.test(TextUtils.normalize(o))) || null;
  },

  pickOption(options, answer) {
    const a = TextUtils.normalize(answer);
    if (!a) return null;
    const labelled = options.map(o => [o, TextUtils.normalize(o)]);
    const found =
      labelled.find(([, n]) => n === a) ||
      labelled.find(([, n]) => TextUtils.containsWord(n, a)) ||
      (a.length >= 3 ? labelled.find(([, n]) => n.length >= 3 && TextUtils.containsWord(a, n)) : null);
    return found ? found[0] : null;
  },

  pickNumber(options, value) {
    return options.find(o => {
      const range = AnswerBank.parseRange(o);
      return range && value >= range[0] && value <= range[1];
    }) || null;
  },

  pickDuration(options, days) {
    let best = null;
    let bestDiff = Infinity;
    for (const option of options) {
      const optionDays = AnswerBank.parseDurationDays(option);
      if (optionDays === null) continue;
      const diff = Math.abs(optionDays - days);
      if (diff < bestDiff) {
        best = option;
        bestDiff = diff;
      }
    }
    return best;
  },

  // Turn a user-typed answer into the forms it can take
  describe(answer) {
    const text = String(answer ?? '').trim();
    const descriptor = { text };
    if (/^(yes|y|true)$/i.test(text)) descriptor.bool = true;
    else if (/^(no|n|false)$/i.test(text)) descriptor.bool = false;
    if (/^[£$€]?\s*[\d,.]+\s*k?$/i.test(text)) descriptor.number = AnswerBank.parseNumber(text);
    const days = AnswerBank.parseDurationDays(text);
    if (days !== null) descriptor.days = days;
    return descriptor;
  },

  // Fit an answer to a form field: the option label to pick, the text to
  // type, a list of checkbox labels, or null if it doesn't fit this field
  fit(descriptor, field, q) {
    const d = descriptor;
    const options = field.options || [];

    switch (field.type) {
      case 'select':
      case 'radio': {
        if (d.bool !== undefined && AnswerBank.hasYesNo(options)) return AnswerBank.pickYesNo(options, d.bool);
        for (const candidate of [...(d.options || []), d.text].filter(Boolean)) {
          const option = AnswerBank.pickOption(options, candidate);
          if (option) return option;
        }
        if (d.days !== undefined) {
          const option = AnswerBank.pickDuration(options, d.days);
          if (option) return option;
        }
        if (d.number !== undefined) return AnswerBank.pickNumber(options, d.number);
        return null;
      }

      case 'checkbox': {
        if (options.length === 1 && (d.bool === true || /^(yes|agree|i agree|accept|true)$/i.test(d.text || ''))) {
          return [options[0]];
        }
        if (d.text) {
          const picked = d.text.split(/[,;]/).map(s => s.trim()).filter(Boolean)
            .map(wanted => AnswerBank.pickOption(options, wanted)).filter(Boolean);
          return picked.length ? [...new Set(picked)] : null;
        }
        return null;
      }

      case 'numeric': {
        if (d.number !== undefined && d.number !== null) return String(Math.round(d.number));
        if (d.days !== undefined) {
          if (/week/.test(q)) return String(Math.round(d.days / 7));
          if (/month/.test(q)) return String(Math.round(d.days / 30));
          if (/\bdays?\b/.test(q)) return String(d.days);
        }
        return null;
      }

      default: // text, textarea
        if (d.text) return d.text;
        if (d.bool !== undefined) return d.bool ? 'Yes' : 'No';
        if (d.number !== undefined && d.number !== null) return String(d.number);
        return null;
    }
  },

  // ---- Built-in questions ---------------------------------------------------
  // Each rule returns undefined when the question isn't about its topic,
  // null when it is but there's no saved answer, or an answer descriptor.

  RULES: [
    {
      name: 'your name, email and phone (popup settings)',
      answer(q, bank, settings) {
        const name = (settings.autoFillName || '').trim();
        const parts = name.split(/\s+/).filter(Boolean);
        if (/^(first name|given name|forename|first and middle names?)$/.test(q)) return parts.length ? { text: parts[0] } : null;
        if (/^(last name|surname|family name)$/.test(q)) return parts.length > 1 ? { text: parts.slice(1).join(' ') } : null;
        if (/^(full name|name|your name|legal name)$/.test(q)) return name ? { text: name } : null;
        if (/^(e-?mail|e-?mail address|your e-?mail( address)?)$/.test(q)) return settings.autoFillEmail ? { text: settings.autoFillEmail } : null;
        if (/^((mobile|cell|home|work) )?(phone|telephone|mobile)( number)?$|^mobile phone number$|^contact number$/.test(q)) {
          return settings.autoFillPhone ? { text: settings.autoFillPhone } : null;
        }
        return undefined;
      }
    },
    {
      name: 'your links',
      answer(q, bank) {
        const link = (url) => (url ? { text: url, bool: true } : null);
        if (/linkedin/.test(q) && /(profile|url|link|page)/.test(q)) return link(bank.linkedinUrl);
        if (/github/.test(q)) return link(bank.githubUrl);
        if (/(website|portfolio|personal site|blog)/.test(q)) return link(bank.websiteUrl);
        return undefined;
      }
    },
    {
      name: 'security clearance',
      answer(q, bank) {
        const mentions = /clearance|vetting|vetted|\b(sc|dv|edv|bpss|ctc)\b|security check|counter[- ]?terroris[tm] check|developed vetting|baseline personnel/.test(q);
        if (!mentions) return undefined;
        if (/\bnppv|police vetting|\bnpv\d?\b/.test(q)) return null;  // police vetting isn't covered

        const levels = AnswerBank.CLEARANCE_LEVELS;
        const user = bank.clearanceLevel ? levels.indexOf(bank.clearanceLevel) : -1;
        const labels = user >= 0 ? AnswerBank.CLEARANCE_LABELS[levels[user]] : null;

        let asked = 1;  // any clearance
        if (/\bedv\b|enhanced (dv|developed vetting)/.test(q)) asked = 5;
        else if (/\bdv\b|developed vetting/.test(q)) asked = 4;
        else if (/\bsc\b|security check/.test(q)) asked = 3;
        else if (/\bctc\b|counter[- ]?terroris/.test(q)) asked = 2;

        // "What level of clearance do you hold?"
        if (!AnswerBank.isYesNoQuestion(q)) return labels ? { text: labels[0], options: labels } : null;

        const hasIt = user >= asked;
        const holds = /\b(hold|have|possess|current|currently|active|valid|live|already|cleared)\b/.test(q);
        const willing = /(willing|prepared|happy|able|eligible|open) to|eligible for|\b(obtain|undergo|apply for|go through|gain)\b/.test(q);

        if (hasIt) return { bool: true };
        if (willing) {
          return typeof bank.willingToObtainClearance === 'boolean' ? { bool: bank.willingToObtainClearance } : null;
        }
        if (holds && user >= 0) return { bool: false };
        return null;
      }
    },
    {
      name: 'visa sponsorship',
      answer(q, bank) {
        if (!/sponsor/.test(q) && !/(require|need).{0,30}visa|visa.{0,30}(require|need|support)/.test(q)) return undefined;
        if (typeof bank.needsSponsorship !== 'boolean') return null;
        // "Can you work here without sponsorship?" means the opposite of "Do you need sponsorship?"
        const withoutSponsorship = /without (the need for |needing |requiring |any )?(visa |employer |company )?sponsorship|no sponsorship|not (require|need)/.test(q);
        return { bool: withoutSponsorship ? !bank.needsSponsorship : bank.needsSponsorship };
      }
    },
    {
      name: 'right to work in the UK',
      answer(q, bank) {
        if (!/(right|authori[sz]ed|eligible|entitled|permitted|legally able|allowed) to work|work permit|right-to-work|work authori[sz]ation|eligibility to work/.test(q)) return undefined;
        if (AnswerBank.mentionsOtherCountry(q)) return null;
        return typeof bank.ukWorkAuth === 'boolean' ? { bool: bank.ukWorkAuth } : null;
      }
    },
    {
      name: 'background checks',
      answer(q, bank) {
        const isCheck = /(background|criminal record|dbs|credit|reference|pre-?employment|drug|police|right to work) (check|screen|screening|verification|test)s?|disclosure and barring/.test(q);
        if (!isCheck || !/(willing|happy|consent|agree|prepared|able|comfortable|submit|undergo|object)/.test(q)) return undefined;
        if (typeof bank.backgroundCheck !== 'boolean') return null;
        return { bool: /\bobject\b/.test(q) ? !bank.backgroundCheck : bank.backgroundCheck };
      }
    },
    {
      name: 'criminal convictions',
      answer(q, bank) {
        if (!/criminal (record|conviction|offen[cs]es?|history|background)|unspent (criminal )?convictions?|been convicted|any convictions|pending (criminal )?(charges|prosecution)/.test(q)) return undefined;
        return typeof bank.hasCriminalRecord === 'boolean' ? { bool: bank.hasCriminalRecord } : null;
      }
    },
    {
      name: 'reasonable adjustments',
      answer(q, bank) {
        if (!/reasonable adjustments?|adjustments? (to|during|for|in) (the |our |your )?(interview|recruitment|application|selection|hiring|assessment)/.test(q)) return undefined;
        return typeof bank.needsAdjustments === 'boolean' ? { bool: bank.needsAdjustments } : null;
      }
    },
    {
      name: 'driving licence',
      answer(q, bank) {
        if (!/driving licen[cs]e|driver'?s licen[cs]e|full (uk |clean |valid |current )*(driving )?licen[cs]e|licen[cs]ed driver/.test(q)) return undefined;
        return typeof bank.hasDrivingLicence === 'boolean' ? { bool: bank.hasDrivingLicence } : null;
      }
    },
    {
      name: 'working arrangements',
      answer(q, bank) {
        const willingWords = /(comfortable|happy|willing|able|open to|\bok\b|okay|prepared|available)|^(can|could|would|will) you\b/;
        const pick = (key) => (typeof bank[key] === 'boolean' ? { bool: bank[key] } : null);
        if (/relocat/.test(q)) return pick('willingToRelocate');
        if (/commut|travel to (the |our |this )?(office|site|job'?s? location|location)/.test(q)) return pick('willingToCommute');
        if (!willingWords.test(q)) return undefined;
        if (/hybrid/.test(q)) return pick('comfortableHybrid');
        if (/remote(ly)?|work(ing)? from home|home[- ]based/.test(q)) return pick('comfortableRemote');
        if (/on-?site|in the office|office[- ]based|in-office|in office|attend (the |our )?office/.test(q)) return pick('comfortableOnsite');
        return undefined;
      }
    },
    {
      name: 'education',
      answer(q, bank) {
        const isYesNo = AnswerBank.isYesNoQuestion(q);
        const standard = q.match(/completed the following level of education:? (.+)$/);
        const highest = !standard && !isYesNo && /highest (level of )?(education|qualification)|level of education|education level/.test(q);
        const degreeWords = /\b(degree|bachelor'?s?|master'?s?|doctorate|phd|a-?levels?|gcses?|high school|secondary (school )?education|hnd|hnc|undergraduate|postgraduate)\b/;
        if (!standard && !highest && !(isYesNo && degreeWords.test(q))) return undefined;

        const levels = AnswerBank.EDUCATION_LEVELS;
        const user = bank.educationLevel ? levels.indexOf(bank.educationLevel) : -1;
        if (user < 0) return null;
        if (highest) return { text: AnswerBank.EDUCATION_LABELS[levels[user]][0], options: AnswerBank.EDUCATION_LABELS[levels[user]] };

        // A subject-specific degree ("a degree in computer science") can't be answered from the level alone
        if (!standard && /degree (in|of)\b/.test(q)) return null;
        const asked = AnswerBank.educationLevelOf(standard ? standard[1] : q);
        return asked < 0 ? null : { bool: user >= asked };
      }
    },
    {
      name: 'English level',
      answer(q, bank) {
        if (!/english/.test(q) || !/(proficien|fluen|level|native|speak|spoken|written|communicat)/.test(q)) return undefined;
        const level = bank.englishProficiency;
        if (!level || !AnswerBank.ENGLISH_LABELS[level]) return null;
        if (AnswerBank.isYesNoQuestion(q)) return { bool: level === 'professional' || level === 'native' };
        const labels = AnswerBank.ENGLISH_LABELS[level];
        return { text: labels[0], options: labels };
      }
    },
    {
      name: 'salary expectation',
      answer(q, bank) {
        if (!/(salary|compensation|remuneration|pay expectation|expected pay|desired pay|pay range|base pay|package|rate of pay|pay requirement)/.test(q)) return undefined;
        if (/(current|previous|last|present|existing)/.test(q) || /(day|daily|hourly|per hour|per day) rate|rate per/.test(q)) return null;
        const wanted = Number(bank.salaryExpectation);
        if (!wanted) return null;
        if (AnswerBank.isYesNoQuestion(q)) {
          const offered = Math.max(0, ...AnswerBank.numbersIn(q).filter(n => n >= 1000));
          return offered ? { bool: offered >= wanted } : null;
        }
        return { number: wanted, text: '£' + wanted.toLocaleString('en-GB') };
      }
    },
    {
      name: 'notice period',
      answer(q, bank) {
        if (!/notice period|(weeks?|months?|days?)'? notice|notice (do you|are you|required|will you)|how much notice|what('s| is) your notice|how (soon|quickly) (can|could) you (start|join)|when (can|could|would) you (be able to )?(start|join)|earliest (possible )?start|start date|available to (start|join)|availability to start|(can|could) you start|able to start/.test(q)) return undefined;
        if (!bank.noticePeriod) return null;
        const days = AnswerBank.parseDurationDays(bank.noticePeriod);
        if (AnswerBank.isYesNoQuestion(q)) {
          const askedDays = AnswerBank.parseDurationDays(q);
          return askedDays === null || days === null ? null : { bool: days <= askedDays };
        }
        return days === null ? { text: bank.noticePeriod } : { text: bank.noticePeriod, days };
      }
    },
    {
      name: 'certifications',
      answer(q, bank) {
        const certs = AnswerBank.listOf(bank.certifications);
        const certQuestion = /(certif|accredit|qualification|chartered|credential)/.test(q);
        const matched = certs.find(c => AnswerBank.phraseMatches(q, c));
        const holdsPhrase = /^(do|are|have) you (currently )?(hold|have|possess|been awarded|achieved|obtained)/.test(q);
        if (!certQuestion && !(matched && holdsPhrase)) return undefined;
        // "Do you have 5 years' experience with ISO 27001?" is about experience, not the certificate
        if (/\byears?\b/.test(q)) return undefined;
        if (!AnswerBank.isYesNoQuestion(q)) {
          return /(which|what|list)/.test(q) && certs.length ? { text: certs.join(', ') } : undefined;
        }
        // Only ever answer "yes" from the list; an unlisted certificate is left for the user
        return matched ? { bool: true } : null;
      }
    },
    {
      name: 'years of experience',
      answer(q, bank) {
        const mentionsYears = /\byears?\b/.test(q);
        const experienceWords = /experience|how many years|years have you|worked (with|in|as|on)|knowledge of|familiar/.test(q);
        const yesNoExperience = AnswerBank.isYesNoQuestion(q) &&
          /\b(experience|knowledge|familiar|skilled|proficient|worked)\b/.test(q);
        if (!(mentionsYears && experienceWords) && !yesNoExperience) return undefined;

        const skills = (bank.skills || [])
          .filter(s => s && s.skill && s.years !== '' && s.years !== null && Number.isFinite(Number(s.years)))
          .sort((a, b) => b.skill.length - a.skill.length);
        const matched = skills.find(s => AnswerBank.phraseMatches(q, s.skill));

        let years = matched ? Number(matched.years) : null;
        const total = bank.totalYears === '' || bank.totalYears === null || bank.totalYears === undefined ? NaN : Number(bank.totalYears);
        if (years === null && AnswerBank.isGeneralExperienceQuestion(q) && Number.isFinite(total)) years = total;
        if (years === null) return null;

        const needed = q.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:or more\s+)?years?/);
        if (needed && AnswerBank.isYesNoQuestion(q)) return { bool: years >= Number(needed[1]), number: years };
        if (!mentionsYears) return { bool: years > 0 };
        return { number: years };
      }
    }
  ],

  educationLevelOf(text) {
    const t = TextUtils.normalize(text);
    if (/doctor|phd|dphil/.test(t)) return 5;
    if (/master|\bmsc\b|\bmba\b|postgraduate/.test(t)) return 4;
    if (/foundation|associate|\bhnd\b|\bhnc\b/.test(t)) return 2;
    if (/bachelor|undergraduate|\bbsc\b|\bba\b|university degree|\bdegree\b/.test(t)) return 3;
    if (/a-?levels?|sixth form|college/.test(t)) return 1;
    if (/high school|secondary|gcse/.test(t)) return 0;
    return -1;
  },

  // "How many years of (work) experience do you have?" with no specific skill
  isGeneralExperienceQuestion(q) {
    const filler = /\b(work|working|professional|relevant|total|overall|industry|full[- ]time|in total|do you have|have you got|you have|in your career)\b/g;
    const match = q.match(/years? of (.*?)\s*experience(.*)$/);
    if (match) {
      const middle = match[1].replace(filler, '').trim();
      const tail = match[2].replace(filler, '').replace(/[^a-z0-9]+/g, ' ').trim();
      return middle === '' && tail === '';
    }
    return /^how many years (have you (been )?(working|worked|employed)|of experience)$/.test(q);
  },

  listOf(value) {
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    return String(value || '').split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
  },

  // Work out the answer for a question.
  //   question: the question text as shown
  //   field:    { type: 'text'|'numeric'|'textarea'|'select'|'radio'|'checkbox', options: [labels] }
  //   settings: extension settings (answerBank, autoFillName/Email/Phone)
  // Returns { value, source } or null. value is the text to type, the option
  // label to pick, or (checkboxes) a list of labels.
  resolve(question, field = {}, settings = {}) {
    const q = AnswerBank.normalizeQuestion(question);
    if (!q) return null;

    const bank = settings.answerBank || {};
    const target = { type: field.type || 'text', options: (field.options || []).filter(Boolean) };

    // 1. The user's own answers, most specific phrase first
    const custom = (bank.customAnswers || [])
      .filter(rule => rule && rule.match && String(rule.answer ?? '').trim() !== '')
      .sort((a, b) => b.match.length - a.match.length);
    for (const rule of custom) {
      if (AnswerBank.phraseMatches(q, rule.match)) {
        const value = AnswerBank.fit(AnswerBank.describe(rule.answer), target, q);
        if (value !== null) return { value, source: `your answer for "${rule.match}"` };
      }
    }

    // 2. Built-in questions. The first rule that recognises the question
    // decides, so a question about one topic never gets another topic's answer.
    for (const rule of AnswerBank.RULES) {
      const descriptor = rule.answer(q, bank, settings, target);
      if (descriptor === undefined) continue;
      if (descriptor === null) return null;
      const value = AnswerBank.fit(descriptor, target, q);
      return value === null ? null : { value, source: rule.name };
    }

    return null;
  }
};

window.AnswerBank = AnswerBank;
