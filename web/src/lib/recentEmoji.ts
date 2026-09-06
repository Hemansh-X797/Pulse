const STORAGE_KEY = 'palspace-recent-emoji';
const MAX_RECENTS = 12;

/**
 * Plain localStorage list, same pattern as useCompactMode/
 * notificationSound's device-level preferences — this is "what has
 * this browser used recently," not something that needs to sync
 * across devices or be visible to anyone else, so it doesn't belong in
 * the database. Backs the emoji autocomplete's Discord-style behavior
 * of surfacing your own recently-used emoji first instead of a fixed
 * alphabetical/definition-order list every time.
 */
export function getRecentEmojiCodes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function recordEmojiUsed(code: string) {
  if (typeof window === 'undefined') return;
  const current = getRecentEmojiCodes().filter((c) => c !== code);
  const next = [code, ...current].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full/unavailable (private browsing, quota) — recently-used
    // ranking just won't persist this session, not worth surfacing an
    // error for.
  }
}
