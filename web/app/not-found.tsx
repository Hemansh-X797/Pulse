'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[var(--color-void)] px-6 text-center text-[var(--color-ink)]">
      <img
        src="/logo.svg"
        alt=""
        className="mb-8 h-12 w-12 opacity-70 grayscale"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />

      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-ink-faint)]">Error 404</div>
      <h1 className="mb-3 font-serif text-4xl font-semibold">Nothing here.</h1>
      <p className="mb-10 max-w-sm text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
        Whatever you were looking for either moved, was deleted, or never existed at this address.
      </p>

      <Link
        href="/home"
        className="rounded-full bg-white px-6 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-black transition-colors hover:bg-[var(--color-ink-muted)]"
      >
        Back to PalSpace
      </Link>
    </div>
  );
}
