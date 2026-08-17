'use client';

import { useEffect, useState } from 'react';

interface GiphyResult {
  id: string;
  images: { fixed_width: { url: string; width: string; height: string }; original: { url: string } };
}

const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

export function GifPicker({ onSelect, onClose }: { onSelect: (gifUrl: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GiphyResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!GIPHY_KEY) return;
    setLoading(true);
    const handle = setTimeout(() => {
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
      fetch(endpoint)
        .then((r) => r.json())
        .then((data) => setResults(data.data ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="absolute bottom-full right-0 z-20 mb-2 w-80 rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">GIFs · Giphy</span>
        <button onClick={onClose} className="text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          Close
        </button>
      </div>

      {!GIPHY_KEY ? (
        <div className="p-3 text-[12.5px] text-[var(--color-ink-muted)]">
          GIF search needs a free Giphy API key. Get one at{' '}
          <a href="https://developers.giphy.com" target="_blank" rel="noreferrer" className="text-[var(--presence-default-a)] underline">
            developers.giphy.com
          </a>{' '}
          and set <code className="text-[var(--color-ink)]">NEXT_PUBLIC_GIPHY_API_KEY</code> in your env.
        </div>
      ) : (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs..."
            className="mb-2 w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--presence-default-a)]"
          />
          <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
            {loading && <div className="col-span-2 py-6 text-center text-[12px] text-[var(--color-ink-faint)]">Loading…</div>}
            {!loading &&
              results.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => {
                    onSelect(gif.images.original.url);
                    onClose();
                  }}
                  className="overflow-hidden rounded-lg border border-[var(--color-hairline)] hover:border-[var(--presence-default-a)]"
                >
                  <img src={gif.images.fixed_width.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
