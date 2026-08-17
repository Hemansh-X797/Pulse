import { useEffect, useState } from 'react';

const STORAGE_KEY = 'palspace-compact-mode';

/** Real, wired setting (Settings → Appearance) — not a dead toggle.
 * Plain localStorage boolean rather than a DB column since it's a
 * per-device display preference, not something that needs to sync
 * across your devices or be visible to anyone else. */
export function useCompactMode() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setCompact(localStorage.getItem(STORAGE_KEY) === 'true');
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setCompact(e.newValue === 'true');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return compact;
}

export function setCompactMode(value: boolean) {
  localStorage.setItem(STORAGE_KEY, String(value));
  // storage events don't fire in the same tab that wrote them — dispatch
  // manually so the toggle takes effect immediately without a reload.
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: String(value) }));
}

export function getCompactModeSync(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}
