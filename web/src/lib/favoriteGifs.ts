export interface FavoriteGif {
  id: string;
  previewUrl: string;
  fullUrl: string;
}

const STORAGE_KEY = 'palspace-favorite-gifs';
const MAX_FAVORITES = 60;

/**
 * Same device-local localStorage pattern as recentEmoji.ts — a
 * favorited GIF is a personal browsing preference, not something that
 * needs a database row, RLS, or to sync across devices. Keyed by GIF id
 * (both Giphy and Tenor ids are stable per-asset) so re-favoriting the
 * same GIF from a different search doesn't create a duplicate entry.
 */
export function getFavoriteGifs(): FavoriteGif[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FavoriteGif[]) : [];
  } catch {
    return [];
  }
}

export function isFavoriteGif(id: string): boolean {
  return getFavoriteGifs().some((g) => g.id === id);
}

export function toggleFavoriteGif(gif: FavoriteGif): FavoriteGif[] {
  if (typeof window === 'undefined') return [];
  const current = getFavoriteGifs();
  const exists = current.some((g) => g.id === gif.id);
  const next = exists ? current.filter((g) => g.id !== gif.id) : [gif, ...current].slice(0, MAX_FAVORITES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full/unavailable (private browsing, quota) — favoriting
    // just won't persist this session, not worth surfacing an error for.
  }
  return next;
}
