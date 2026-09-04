'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'palspace-theme';
export type ThemeName = 'bespoke' | 'classic' | 'sunroom' | 'signal' | 'grove';
const VALID_THEMES: ThemeName[] = ['bespoke', 'classic', 'sunroom', 'signal', 'grove'];
const DEFAULT_THEME: ThemeName = 'bespoke';

function parseTheme(value: string | null): ThemeName {
  return VALID_THEMES.includes(value as ThemeName) ? (value as ThemeName) : DEFAULT_THEME;
}

/** Real, wired setting (Settings → Appearance, and an onboarding step)
 * — same per-device localStorage pattern as useCompactMode.ts, not a
 * DB column, since this is a display preference rather than something
 * that needs to sync across devices or be visible to anyone else.
 * Bespoke (hard edges, near-black surfaces) is the default; Classic,
 * Sunroom (warm/light), and Signal (green-on-black terminal) are all
 * real, equally-selectable alternatives, not lesser options. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const initial = parseTheme(localStorage.getItem(STORAGE_KEY));
    setThemeState(initial);
    document.documentElement.setAttribute('data-theme', initial);

    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        const next = parseTheme(e.newValue);
        setThemeState(next);
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
  return parseTheme(localStorage.getItem(STORAGE_KEY));
}
