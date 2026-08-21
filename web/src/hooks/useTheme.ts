'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'palspace-theme';
export type ThemeName = 'bespoke' | 'classic';
const DEFAULT_THEME: ThemeName = 'bespoke';

/** Real, wired setting (Settings → Appearance) — same per-device
 * localStorage pattern as useCompactMode.ts, not a DB column, since
 * this is a display preference rather than something that needs to
 * sync across devices or be visible to anyone else. Bespoke (hard
 * edges, near-black surfaces) is the default; Classic is the original
 * rounded look, kept as the opt-out. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial: ThemeName = stored === 'classic' ? 'classic' : 'bespoke';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);

    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        const next: ThemeName = e.newValue === 'classic' ? 'classic' : 'bespoke';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return theme;
}

export function setTheme(value: ThemeName) {
  localStorage.setItem(STORAGE_KEY, value);
  document.documentElement.setAttribute('data-theme', value);
  // storage events don't fire in the same tab that wrote them — dispatch
  // manually so the toggle takes effect immediately without a reload.
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: value }));
}

export function getThemeSync(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  return localStorage.getItem(STORAGE_KEY) === 'classic' ? 'classic' : 'bespoke';
}
