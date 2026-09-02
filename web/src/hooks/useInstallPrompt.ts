'use client';

import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag for "launched from home screen" — doesn't
    // support the display-mode media query the same way.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

/**
 * Wraps the `beforeinstallprompt` flow. Chromium browsers (Chrome, Edge,
 * Android, desktop) fire this event and let you trigger the native
 * install dialog programmatically via `promptInstall()`. iOS Safari
 * never fires this event at all — there's no programmatic install API
 * there, only the manual "Share → Add to Home Screen" path — so this
 * also flags `isIOS` so the UI can show instructions instead of a
 * button that would silently do nothing.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIsIOS(isIOSSafari());

    // Register the service worker install requires. Registering it here
    // (rather than only assuming it's present) means the install button
    // actually becomes available shortly after first load rather than
    // depending on some other part of the app to have set it up.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === 'accepted';
  }, [deferredPrompt]);

  return {
    // Real, one-tap native install available right now (Chrome/Edge/Android/desktop).
    canPromptInstall: !!deferredPrompt && !installed,
    // Already running as an installed app — don't show a download CTA at all.
    installed,
    // No native prompt exists here (iOS Safari) — show manual instructions instead.
    isIOS: isIOS && !installed,
    promptInstall,
  };
}
