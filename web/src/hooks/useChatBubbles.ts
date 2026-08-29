'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'palspace-chat-bubbles';

/** Real, wired setting (Settings → Appearance) — same per-device
 * localStorage pattern as useCompactMode.ts. On (default) = current
 * bubble look; off = flat/direct text with no bubble background,
 * border, or rounding, matching the reference screenshot. Every
 * feature (reactions, reply, edit, markdown, link previews, etc.)
 * works identically either way — this only changes the message
 * container's own styling, nothing underneath it. */
export function useChatBubbles(): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(getChatBubblesSync());
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setEnabled(e.newValue !== 'false');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return enabled;
}

export function getChatBubblesSync(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) !== 'false';
}

export function setChatBubbles(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, String(enabled));
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: String(enabled) }));
}
