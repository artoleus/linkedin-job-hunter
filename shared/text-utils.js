// Text helpers shared by content scripts and extension pages
// (role matching, name matching, question text clean-up)

const TextUtils = {
  // Lower-case, straighten quotes and collapse whitespace
  normalize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”″]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  },

  escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  // Whole-word containment, so "it" doesn't match "security"
  containsWord(text, word) {
    if (!word) return false;
    const pattern = TextUtils.escapeRegExp(word.toLowerCase());
    return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`).test((text || '').toLowerCase());
  },

  // LinkedIn often renders text twice (visible copy + screen-reader copy),
  // e.g. "Security EngineerSecurity Engineer". Collapse such repeats.
  dedupeRepeatedText(text) {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    const half = clean.length / 2;
    if (Number.isInteger(half) && half > 0 && clean.slice(0, half).trim() === clean.slice(half).trim()) {
      return clean.slice(0, half).trim();
    }
    const words = clean.split(' ');
    const mid = Math.floor(words.length / 2);
    if (words.length % 2 === 0 && mid > 0 &&
        words.slice(0, mid).join(' ') === words.slice(mid).join(' ')) {
      return words.slice(0, mid).join(' ');
    }
    return clean;
  },

  // Fuzzy person-name match: exact, whole-word containment, or same first
  // and last name ("John Smith" vs "John M. Smith")
  namesMatch(text, fullName) {
    const normalize = (str) => (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const haystack = normalize(text);
    const name = normalize(fullName);

    // Never match placeholder or very short names: an empty name is a
    // substring of everything and would match every page
    if (name.length < 3 || name === 'there' || name === 'unknown' || !haystack) {
      return false;
    }

    if (haystack === name) return true;

    // Whole-word containment, so "Al Li" doesn't match inside "Sal Lin"
    const containsWords = (outer, inner) =>
      inner.length >= 3 &&
      new RegExp(`(^|[^\\p{L}'-])${TextUtils.escapeRegExp(inner)}($|[^\\p{L}'-])`, 'u').test(outer);

    if (containsWords(haystack, name)) return true;
    // Reverse direction only for multi-word card names (a lone "John" is too weak)
    if (haystack.includes(' ') && containsWords(name, haystack)) return true;

    const parts1 = haystack.split(' ');
    const parts2 = name.split(' ');
    if (parts1.length >= 2 && parts2.length >= 2 && parts1.length <= 5) {
      return parts1[0] === parts2[0] &&
             parts1[parts1.length - 1] === parts2[parts2.length - 1];
    }

    return false;
  },

  // "Senior IT Manager at Acme Ltd | ISO 27001" -> "Senior IT Manager".
  // Returns '' when the headline doesn't reduce to a short job title.
  shortRole(headline) {
    const role = (headline || '').split(/\s+(?:at|@)\s+|\s*[|,•·–—/]\s*|\s+-\s+/i)[0].trim();
    return role.length > 0 && role.length <= 40 ? role : '';
  },

  // Broad field for a job title, used to word messages ("people in IT")
  guessIndustry(title, company = '') {
    // Checked in order, most specific first ("Security Engineer" is
    // cybersecurity, not software; "AI Governance" is AI, not GRC)
    const keywords = [
      ['AI', ['ai', 'artificial intelligence', 'machine learning', 'ml']],
      ['cybersecurity', ['security', 'cyber', 'ciso', 'grc', 'governance', 'risk', 'compliance', '27001', 'infosec']],
      ['IT', ['it', 'infrastructure', 'linux', 'sysadmin', 'systems administrator', 'devops', 'cloud', 'automation']],
      ['software', ['developer', 'engineer', 'programmer', 'software', 'tech']],
      ['marketing', ['marketing', 'growth', 'brand', 'digital marketing']],
      ['sales', ['sales', 'account', 'business development']],
      ['design', ['designer', 'ux', 'ui', 'creative']],
      ['product', ['product', 'pm', 'product manager']],
      ['data', ['data', 'analyst', 'analytics', 'scientist']]
    ];

    const combined = `${title} ${company}`.toLowerCase();
    // Short keywords must be whole words ("it" shouldn't match "security")
    const matches = word => word.length <= 3 ? TextUtils.containsWord(combined, word) : combined.includes(word);

    for (const [industry, words] of keywords) {
      if (words.some(matches)) {
        return industry;
      }
    }

    return 'the field';
  },

  // Which of the user's target roles a job title matches (all of the role's
  // words must appear, in any order, with common abbreviations understood).
  // Returns the matching role, or null.
  matchTargetRole(jobTitle, targetRoles) {
    if (!jobTitle || !targetRoles || targetRoles.length === 0) return null;

    const titleLower = jobTitle.toLowerCase();

    for (const role of targetRoles) {
      const keywords = role.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (keywords.length === 0) continue;

      const allKeywordsMatch = keywords.every(keyword => {
        // Handle common abbreviations and variations
        if (keyword === 'grc') {
          return titleLower.includes('grc') || titleLower.includes('governance') ||
                 titleLower.includes('risk') || titleLower.includes('compliance');
        }
        if (keyword === 'vciso' || keyword === 'ciso') {
          return titleLower.includes('ciso') || titleLower.includes('vciso') ||
                 (titleLower.includes('security') && titleLower.includes('officer'));
        }
        if (keyword === 'ai') {
          return TextUtils.containsWord(titleLower, 'ai') || titleLower.includes('artificial intelligence');
        }
        if (keyword === 'iso27001') {
          return titleLower.includes('iso') || titleLower.includes('27001') ||
                 titleLower.includes('information security');
        }

        // Short keywords (e.g. "it", "qa", "pm") must match a whole word
        if (keyword.length <= 3) {
          return TextUtils.containsWord(titleLower, keyword);
        }

        return titleLower.includes(keyword);
      });

      if (allKeywordsMatch) {
        return role;
      }
    }

    return null;
  }
};

window.TextUtils = TextUtils;
