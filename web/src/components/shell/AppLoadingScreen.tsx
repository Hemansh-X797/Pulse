'use client';

/**
 * The universal loading screen — shown once, during the initial
 * session check, replacing what used to be a single line of plain
 * "Loading…" text on a bare background. This isn't what makes
 * navigation *between* pages inside the app feel instant though (see
 * the prefetch pass in app/(app)/layout.tsx for that) — this specific
 * screen only covers the one moment before PalSpace knows whether
 * you're logged in at all.
 */
export function AppLoadingScreen() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-5 bg-[var(--color-void)]">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-2xl presence-fill opacity-20" />
        <div className="absolute inset-0 rounded-2xl presence-fill opacity-90" />
        <span className="relative font-serif text-xl font-bold text-black">P</span>
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full presence-fill"
            style={{ animation: `preloader-bounce 1.1s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </div>
      <style>{`
        @keyframes preloader-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
