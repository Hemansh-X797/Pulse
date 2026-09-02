'use client';

import { useState } from 'react';
import { Download, Share, X, PlusSquare } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

/**
 * "Download PalSpace" — this is a web app, not something with a native
 * installer to ship, so this wires up the real, honest equivalent: the
 * browser's own PWA install flow. On Chrome/Edge/Android/desktop this
 * is genuinely one tap and PalSpace lands as a real installed app with
 * its own icon, its own window, no browser chrome. On iOS Safari there
 * is no programmatic install API at all, so this shows the manual
 * "Share → Add to Home Screen" steps instead of a button that would
 * silently do nothing.
 */
export function DownloadButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const { canPromptInstall, installed, isIOS, promptInstall } = useInstallPrompt();
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  if (installed) return null;

  const sizeClass = size === 'lg' ? 'px-8 py-3.5 text-[15px]' : 'px-6 py-2.5 text-sm';

  async function handleClick() {
    if (canPromptInstall) {
      await promptInstall();
      return;
    }
    if (isIOS) {
      setShowIOSSteps(true);
      return;
    }
    // Neither path available yet (event hasn't fired, or an unsupported
    // browser) — don't pretend to install something. Point at the docs
    // instead of a dead click.
    setShowIOSSteps(true);
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex items-center gap-2.5 rounded-full presence-fill font-bold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_30px_-6px_var(--presence-default-a)] transition-transform hover:scale-[1.03] active:scale-[0.98] ${sizeClass}`}
      >
        <Download size={size === 'lg' ? 19 : 16} strokeWidth={2.5} />
        Download PalSpace
      </button>

      {showIOSSteps && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setShowIOSSteps(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">Install PalSpace</h3>
              <button onClick={() => setShowIOSSteps(false)} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <ol className="space-y-3.5 text-[13.5px] text-[var(--color-ink-muted)]">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full presence-fill text-[11px] font-bold text-black">1</span>
                <span className="pt-0.5">
                  Tap the Share icon <Share size={13} className="mx-0.5 mb-0.5 inline" /> in your browser's toolbar.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full presence-fill text-[11px] font-bold text-black">2</span>
                <span className="pt-0.5">
                  Scroll down and tap <b className="text-[var(--color-ink)]">Add to Home Screen</b> <PlusSquare size={13} className="mx-0.5 mb-0.5 inline" />.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full presence-fill text-[11px] font-bold text-black">3</span>
                <span className="pt-0.5">Tap <b className="text-[var(--color-ink)]">Add</b> — PalSpace now opens full-screen from your home screen, no browser bar.</span>
              </li>
            </ol>
            <p className="mt-4 text-[11.5px] text-[var(--color-ink-faint)]">
              On Chrome, Edge, or Android, this happens automatically with one tap — no steps needed.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
