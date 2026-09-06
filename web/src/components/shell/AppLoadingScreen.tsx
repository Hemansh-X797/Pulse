'use client';

/**
 * The universal loading screen. Two different moments show this:
 * 1. The initial auth check (no progress info yet — indeterminate).
 * 2. The real preload pass right after (app/(app)/layout.tsx) — this
 *    is what makes "waiting on each page" actually go away: instead of
 *    revealing the app shell the instant auth resolves and then
 *    showing a blank/skeleton flash on whichever screen you land on
 *    first, this stays up (like Discord's own splash) until the core
 *    data (feed, DMs, spaces, friends, notifications) has actually
 *    loaded — or a safety timeout passes, so a slow connection never
 *    gets stuck staring at a splash screen forever.
 */
export function AppLoadingScreen({ progress, statusText }: { progress?: number; statusText?: string }) {
  const pct = progress != null ? Math.round(progress * 100) : null;

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-[var(--color-void)] overflow-hidden">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-2xl presence-fill opacity-20" />
        <div className="absolute inset-0 rounded-2xl presence-fill opacity-90 shadow-[0_0_40px_-4px_var(--presence-default-a)]" />
        <span className="relative font-serif text-2xl font-bold text-black">P</span>
      </div>

      <div className="flex flex-col items-center gap-2.5">
        {pct === null ? (
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full presence-fill"
                style={{ animation: `preloader-bounce 1.1s ease-in-out ${i * 0.15}s infinite` }}
              />
            ))}
          </div>
        ) : (
          <div className="relative h-1 w-40 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
            <div
              className="absolute inset-y-0 left-0 rounded-full presence-fill transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {statusText && (
          <span key={statusText} className="preloader-fade-in font-mono text-[10.5px] tracking-wide text-[var(--color-ink-faint)]">
            {statusText}
          </span>
        )}
      </div>

      <style>{`
        @keyframes preloader-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes preloader-fade-in {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .preloader-fade-in { animation: preloader-fade-in 0.25s ease-out; }
      `}</style>
    </div>
  );
}
