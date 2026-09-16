export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-ink-faint)]">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2 text-[13.5px] text-[var(--color-ink)] outline-none focus:border-[var(--presence-default-a)]';

// Was duplicated verbatim in both AppearanceSettings.tsx and
// NotificationSettings.tsx (now both import this instead) — and in its
// "off" state was a real, measured visibility bug, not a subjective
// one: the track used --color-surface-overlay sitting on a
// --color-surface card, which computes to as little as ~1.15:1 contrast
// on some themes (bespoke, classic) — essentially the same color as its
// own background, so an off toggle was nearly invisible and only
// readable via the white knob's position. Fixed with a track that uses
// --color-ink itself at low opacity (scales correctly in both dark and
// light themes, since ink is always the color furthest from surface by
// design) plus an explicit border, so the track's boundary is always
// visible regardless of exact blend math on any given theme.
export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        on ? 'presence-fill border-transparent' : 'border-[var(--color-hairline-strong)] bg-[var(--color-ink)]/[0.14]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
