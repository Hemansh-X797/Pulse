export function Stories() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-baseline gap-2.5 border-b border-[var(--color-hairline)] px-7">
        <h2 className="font-serif text-lg font-semibold">Stories</h2>
        <span className="text-xs text-[var(--color-ink-muted)]">disappear after 24 hours</span>
      </div>
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-ink-muted)]">
        <p>
          Stories reuse the same ephemeral-message machinery as chat (see{' '}
          <code className="text-[var(--color-ink-muted)]">messages.expires_at</code> in the schema) — the feed UI for browsing
          them by user is the next real slice to build here, flagged rather than faked.
        </p>
      </div>
    </div>
  );
}
