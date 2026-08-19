'use client';

import { useEffect, useState } from 'react';

interface OgData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

// Matches the first http(s) URL in a string. Deliberately simple —
// this is for spotting "does this message contain a link worth
// previewing", not for validating URLs in general.
const URL_PATTERN = /https?:\/\/[^\s<>()]+/;

export function extractFirstUrl(text: string): string | null {
  const m = URL_PATTERN.exec(text);
  return m ? m[0].replace(/[.,;:!?)]+$/, '') : null; // trim trailing punctuation a sentence might leave attached
}

export function LinkPreviewCard({ url }: { url: string }) {
  const [data, setData] = useState<OgData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error('preview fetch failed');
        return res.json();
      })
      .then((json: OgData) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // No card at all if the fetch failed or came back with nothing
  // useful — a broken/empty preview is worse than no preview, and the
  // link itself is still right there as plain text in the message.
  if (failed || (data && !data.title && !data.description && !data.image)) {
    return null;
  }

  if (!data) {
    return (
      <div className="mt-1.5 max-w-sm animate-pulse rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] p-3">
        <div className="h-3 w-2/3 rounded bg-[var(--color-surface-overlay)]" />
        <div className="mt-2 h-2.5 w-full rounded bg-[var(--color-surface-overlay)]" />
      </div>
    );
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-1.5 flex max-w-sm overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] transition-colors hover:border-[var(--color-hairline-strong)]"
    >
      {data.image && (
        <div className="h-20 w-20 shrink-0 overflow-hidden bg-[var(--color-surface-overlay)]">
          <img src={data.image} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1 p-2.5">
        {data.siteName && (
          <div className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {data.siteName}
          </div>
        )}
        {data.title && <div className="mt-0.5 truncate text-[13px] font-semibold text-[var(--color-ink)]">{data.title}</div>}
        {data.description && (
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--color-ink-muted)]">{data.description}</div>
        )}
      </div>
    </a>
  );
}
