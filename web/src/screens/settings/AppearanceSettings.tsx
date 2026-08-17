'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'palspace-reduced-motion';

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'presence-fill' : 'bg-[var(--color-surface-overlay)]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function AppearanceSettings() {
  const [reducedMotion, setReducedMotion] = useState(false);

  // Reads/writes a plain in-memory + localStorage flag, not a data-*
  // attribute driving a global CSS override yet — the system
  // `prefers-reduced-motion` media query in globals.css already handles
  // the OS-level signal; this manual override is additive for anyone who
  // wants it off within PalSpace specifically without changing their OS
  // setting, and is intentionally scoped small rather than half-wiring a
  // full custom-theme system in this pass.
  useEffect(() => {
    setReducedMotion(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  function toggle() {
    const next = !reducedMotion;
    setReducedMotion(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    document.documentElement.classList.toggle('force-reduced-motion', next);
  }

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-semibold">Appearance</h1>

      <section className="mb-6 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Motion</h2>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-[13.5px] font-medium">Reduce motion</div>
            <div className="text-[11.5px] text-[var(--color-ink-faint)]">Turns off transitions and animations within PalSpace.</div>
          </div>
          <Toggle on={reducedMotion} onClick={toggle} />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Your accent gradient</h2>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Your personal gradient — the thing that makes your avatar, messages, and posts look like yours across
          PalSpace — is set under{' '}
          <a href="/settings/profile" className="text-[var(--presence-default-a)] underline">
            Profile
          </a>
          , not here. Kept in one place rather than split across two settings pages that both edit the same colors.
        </p>
      </section>
    </div>
  );
}
