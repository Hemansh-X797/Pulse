export function Stories() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-baseline gap-2.5 border-b border-white/[0.07] px-7">
        <h2 className="font-serif text-lg font-semibold">Stories</h2>
        <span className="text-xs text-neutral-500">disappear after 24 hours</span>
      </div>
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
        <p>
          Stories reuse the same ephemeral-message machinery as chat (see{' '}
          <code className="text-neutral-400">messages.expires_at</code> in the schema) — the feed UI for browsing
          them by user is the next real slice to build here, flagged rather than faked.
        </p>
      </div>
    </div>
  );
}
