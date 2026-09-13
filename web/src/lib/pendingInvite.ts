// Carries a pending invite destination (e.g. /join/ABC123) across an
// OAuth sign-in round-trip. Email/password signup can thread this
// through as a plain ?redirect= query param on /onboarding (see
// Login.tsx + Onboarding.tsx) because that's a same-origin client-side
// navigation the whole way — but supabase.auth.signInWithOAuth() sends
// the browser away to Google/Discord/GitHub and back, and its
// `redirectTo` option has to be a URL the project's Auth settings
// already allow-list, which we can't safely assume includes an
// arbitrary invite path with a dynamic code in it. localStorage
// sidesteps that entirely: nothing about the OAuth redirect URL itself
// changes, the destination just rides along in storage and gets picked
// back up once the person lands back in the authenticated app shell
// (see the two consumption points in app/(app)/layout.tsx).
const PENDING_KEY = 'palspace-pending-redirect';

export function setPendingInviteRedirect(path: string) {
  try {
    localStorage.setItem(PENDING_KEY, path);
  } catch {
    // Safari private mode etc. can throw on localStorage access — losing
    // the invite redirect in that edge case is a worse UX than crashing
    // the sign-in button, so this just silently no-ops.
  }
}

// Reads and clears in one step — this is a one-time handoff, not a
// persistent setting, so once it's been read and acted on it should
// never fire again for a later, unrelated navigation to /home.
export function consumePendingInviteRedirect(): string | null {
  try {
    const value = localStorage.getItem(PENDING_KEY);
    if (value) localStorage.removeItem(PENDING_KEY);
    return value;
  } catch {
    return null;
  }
}
