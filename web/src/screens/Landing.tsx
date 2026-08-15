import Link from 'next/link';

export function Landing() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--color-void)] text-[var(--color-ink)]">
      <div className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full presence-fill" />
          <span className="font-serif text-3xl font-semibold">PalSpace</span>
        </div>
        <p className="mb-8 text-sm text-[var(--color-ink-muted)]">chat, feed, spaces, stories — one app</p>
        <Link
          href="/login"
          className="inline-block rounded-full bg-white px-8 py-3 text-sm font-semibold text-black transition hover:bg-[var(--color-ink)]/90"
        >
          Get started
        </Link>
      </div>
    </div>
  );
}
