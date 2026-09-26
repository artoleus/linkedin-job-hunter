// Version of the Terms of Use the user must accept before automation can run.
// Change it when legal/terms.html changes materially, so users accept again.

const Terms = {
  VERSION: '2026-09-26',

  isAccepted(settings = {}) {
    return settings.termsAccepted?.version === Terms.VERSION;
  }
};

// globalThis: also loaded by the background service worker, which has no window
globalThis.Terms = Terms;
