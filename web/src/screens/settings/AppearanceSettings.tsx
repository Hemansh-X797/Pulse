'use client';

import { useEffect, useState } from 'react';
import { getCompactModeSync, setCompactMode } from '../../hooks/useCompactMode';
import { getChatBubblesSync, setChatBubbles } from '../../hooks/useChatBubbles';
import { getThemeSync, setTheme, type ThemeName } from '../../hooks/useTheme';

const STORAGE_KEY = 'palspace-reduced-motion';

const THEME_SWATCHES: { name: ThemeName; a: string; b: string; corners: string }[] = [
  { name: 'bespoke', a: '#0a0a0a', b: '#161616', corners: '' },
  { name: 'classic', a: '#1a1a22', b: '#212129', corners: 'rounded-full' },
  { name: 'sunroom', a: '#fdfaf3', b: '#c96f4a', corners: 'rounded-full' },
  { name: 'signal', a: '#050806', b: '#3ddc63', corners: '' },
];

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
  const [compact, setCompact] = useState(false);
  const [bubbles, setBubbles] = useState(true);
  const [themeName, setThemeName] = useState<ThemeName>('bespoke');

  // Reads/writes a plain in-memory + localStorage flag, not a data-*
  // attribute driving a global CSS override yet — the system
  // `prefers-reduced-motion` media query in globals.css already handles
  // the OS-level signal; this manual override is additive for anyone who
  // wants it off within PalSpace specifically without changing their OS
  // setting, and is intentionally scoped small rather than half-wiring a
  // full custom-theme system in this pass.
  useEffect(() => {
    setReducedMotion(localStorage.getItem(STORAGE_KEY) === 'true');
    setCompact(getCompactModeSync());
    setBubbles(getChatBubblesSync());
    setThemeName(getThemeSync());
  }, []);

  function toggle() {
    const next = !reducedMotion;
    setReducedMotion(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    document.documentElement.classList.toggle('force-reduced-motion', next);
  }

  function toggleCompact() {
    const next = !compact;
    setCompact(next);
    setCompactMode(next);
  }

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-semibold">Appearance</h1>

      <section className="mb-6 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Theme</h2>
        <p className="mb-3 text-[11.5px] text-[var(--color-ink-faint)]">Four real, equally-supported looks — pick whichever fits.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {THEME_SWATCHES.map(({ name, a, b, corners }) => (
            <button
              key={name}
              onClick={() => {
                setThemeName(name);
                setTheme(name);
              }}
              className={`rounded-lg border p-3 text-left transition-colors ${
                themeName === name
                  ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10'
                  : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
              }`}
            >
              <div className="mb-1.5 flex gap-1">
                <span className={`h-4 w-4 border border-[var(--color-hairline-strong)] ${corners}`} style={{ background: a }} />
                <span className={`h-4 w-4 border border-[var(--color-hairline-strong)] ${corners}`} style={{ background: b }} />
              </div>
              <div className="text-[13px] font-medium capitalize">{name}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Chat display</h2>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-[13.5px] font-medium">Compact mode</div>
            <div className="text-[11.5px] text-[var(--color-ink-faint)]">Tighter message spacing, no avatars per line.</div>
          </div>
          <Toggle on={compact} onClick={toggleCompact} />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-[var(--color-hairline)] pt-3">
          <div>
            <div className="text-[13.5px] font-medium">Chat bubbles</div>
            <div className="text-[11.5px] text-[var(--color-ink-faint)]">Off shows direct text with no bubble background — everything still works the same either way.</div>
          </div>
          <Toggle
            on={bubbles}
            onClick={() => {
              const next = !bubbles;
              setBubbles(next);
              setChatBubbles(next);
            }}
          />
        </div>
      </section>

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
