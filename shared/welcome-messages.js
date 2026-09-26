// Welcome messages for people who accepted a connection request.
// Shared by the Connection Analytics page and the popup.
// Depends on TextUtils (shared/text-utils.js).

const WelcomeMessages = {
  DEFAULT_DELAY_DAYS: 1,
  DAY_MS: 24 * 60 * 60 * 1000,

  // {first} their first name, {roles} the roles you're looking for,
  // {field} their field (from the role you searched to find them)
  TEMPLATES: [
    'Hi {first}, thanks for connecting! I\'m currently looking for {roles} and it\'s great to be connected with people in {field}. If you ever hear of an opening that might suit, I\'d really appreciate a heads-up. Hope you have a great week.',
    'Hi {first}, thank you for accepting my invitation. I\'m exploring my next move into {roles}, so I\'m keen to learn from people working in {field}. Would you be open to a quick chat at some point, or happy to point me towards anyone who\'s hiring?',
    'Hi {first}, thanks for connecting. I\'m actively looking for {roles} in the UK and always happy to swap notes with others in {field}. If there\'s ever anything I can help with in return, just let me know.',
    'Hi {first}, great to be connected! I\'m currently on the lookout for {roles}. If you come across anything relevant or know someone I should speak to, I\'d be very grateful. Thanks again for connecting.'
  ],

  delayDays(settings = {}) {
    const days = Number(settings.welcomeDelayDays);
    return Number.isFinite(days) && days >= 0 ? days : WelcomeMessages.DEFAULT_DELAY_DAYS;
  },

  // A real name we can greet and find again
  hasUsableName(request) {
    const name = (request.fullName || '').trim().toLowerCase();
    return name.length >= 3 && name !== 'unknown' && name !== 'there';
  },

  // Accepted, not yet welcomed or skipped
  isCandidate(request) {
    return request.status === 'accepted' &&
           !['sent', 'skipped'].includes(request.welcomeStatus) &&
           WelcomeMessages.hasUsableName(request);
  },

  // When the suggestion becomes due: the delay after acceptance was detected
  readyAt(request, settings = {}) {
    const accepted = new Date(request.responseDate || request.sentDate);
    return new Date(accepted.getTime() + WelcomeMessages.delayDays(settings) * WelcomeMessages.DAY_MS);
  },

  isReady(request, settings = {}, now = new Date()) {
    return WelcomeMessages.isCandidate(request) && WelcomeMessages.readyAt(request, settings) <= now;
  },

  rolesPhrase(settings = {}) {
    const roles = (settings.targetJobRoles && settings.targetJobRoles.length ? settings.targetJobRoles : settings.targetRoles || [])
      .map(role => String(role).trim())
      .filter(Boolean)
      .slice(0, 2);
    return roles.length ? `${roles.join(' or ')} roles` : 'new roles';
  },

  fieldPhrase(request) {
    const field = TextUtils.guessIndustry(request.targetRole || '');
    return field === 'the field' ? 'your field' : field;
  },

  // Stable per person, so the suggested wording doesn't change on every refresh;
  // "New wording" bumps request.welcomeVariant
  templateIndex(request) {
    let hash = 0;
    for (const ch of String(request.id || request.fullName || '')) {
      hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    }
    return (hash + (request.welcomeVariant || 0)) % WelcomeMessages.TEMPLATES.length;
  },

  // The user's edited draft if there is one, otherwise the suggested wording
  draft(request, settings = {}) {
    if (request.welcomeDraft) return request.welcomeDraft;
    const first = (request.fullName || '').trim().split(/\s+/)[0] || 'there';
    return WelcomeMessages.TEMPLATES[WelcomeMessages.templateIndex(request)]
      .replace('{first}', () => first)
      .replace('{roles}', () => WelcomeMessages.rolesPhrase(settings))
      .replace('{field}', () => WelcomeMessages.fieldPhrase(request));
  }
};

window.WelcomeMessages = WelcomeMessages;
