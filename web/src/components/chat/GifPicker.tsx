'use client';

import { useEffect, useState } from 'react';

// Normalized shape both providers get mapped into, so the render code
// below doesn't care which one answered the query.
interface NormalizedGif {
  id: string;
  previewUrl: string;
  fullUrl: string;
}

interface GiphyResult {
  id: string;
  images: { fixed_width: { url: string }; original: { url: string } };
}

interface TenorResult {
  id: string;
  media_formats: { tinygif?: { url: string }; gif: { url: string } };
}

const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
const TENOR_KEY = process.env.NEXT_PUBLIC_TENOR_API_KEY;

type Provider = 'giphy' | 'tenor';

async function searchGiphy(query: string): Promise<NormalizedGif[]> {
  const endpoint = query.trim()
    ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
  const res = await fetch(endpoint);
  const data = await res.json();
  const items: GiphyResult[] = data.data ?? [];
  return items.map((g) => ({ id: g.id, previewUrl: g.images.fixed_width.url, fullUrl: g.images.original.url }));
}

async function searchTenor(query: string): Promise<NormalizedGif[]> {
  // Tenor v2 API — "featured" is its equivalent of Giphy's "trending"
  // for an empty query. contentfilter=medium roughly matches Giphy's
  // rating=pg-13 here (there's no exact 1:1 mapping between the two
  // providers' rating scales).
  const endpoint = query.trim()
    ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&client_key=palspace_web&limit=24&contentfilter=medium`
    : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&client_key=palspace_web&limit=24&contentfilter=medium`;
  const res = await fetch(endpoint);
  const data = await res.json();
  const items: TenorResult[] = data.results ?? [];
  return items.map((g) => ({
    id: g.id,
    previewUrl: g.media_formats.tinygif?.url ?? g.media_formats.gif.url,
    fullUrl: g.media_formats.gif.url,
  }));
}

export function GifPicker({ onSelect, onClose }: { onSelect: (gifUrl: string) => void; onClose: () => void }) {
  // Default to whichever provider actually has a key configured; if
  // both do, Giphy stays the default since it was already wired and
  // is what people are used to seeing.
  const [provider, setProvider] = useState<Provider>(GIPHY_KEY ? 'giphy' : 'tenor');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NormalizedGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const activeKey = provider === 'giphy' ? GIPHY_KEY : TENOR_KEY;

  useEffect(() => {
    if (!activeKey) return;
    setLoading(true);
    setSearchError(null);
    const handle = setTimeout(() => {
      const run = provider === 'giphy' ? searchGiphy(query) : searchTenor(query);
      run
        .then(setResults)
        .catch(() => {
          setResults([]);
          setSearchError('Could not load GIFs — try again.');
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [query, provider, activeKey]);

  const bothAvailable = Boolean(GIPHY_KEY && TENOR_KEY);

  return (
    <div className="absolute bottom-full right-0 z-20 mb-2 w-80 rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between px-1">
        {bothAvailable ? (
          <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider">
            {(['giphy', 'tenor'] as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  provider === p ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]'
                }`}
              >
                {p === 'giphy' ? 'Giphy' : 'Tenor'}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            GIFs · {provider === 'giphy' ? 'Giphy' : 'Tenor'}
          </span>
        )}
        <button onClick={onClose} className="text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          Close
        </button>
      </div>

      {!activeKey ? (
        <div className="p-3 text-[12.5px] text-[var(--color-ink-muted)]">
          {provider === 'giphy' ? (
            <>
              GIF search needs a free Giphy API key. Get one at{' '}
              <a href="https://developers.giphy.com" target="_blank" rel="noreferrer" className="text-[var(--presence-default-a)] underline">
                developers.giphy.com
              </a>{' '}
              and set <code className="text-[var(--color-ink)]">NEXT_PUBLIC_GIPHY_API_KEY</code> in your env.
            </>
          ) : (
            <>
              Tenor search needs a free API key. Get one at{' '}
              <a href="https://developers.google.com/tenor" target="_blank" rel="noreferrer" className="text-[var(--presence-default-a)] underline">
                developers.google.com/tenor
              </a>{' '}
              and set <code className="text-[var(--color-ink)]">NEXT_PUBLIC_TENOR_API_KEY</code> in your env.
            </>
          )}
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
          {searchError && (
            <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-300">
              {searchError}
            </div>
          )}
          <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
            {loading && <div className="col-span-2 py-6 text-center text-[12px] text-[var(--color-ink-faint)]">Loading…</div>}
            {!loading &&
              results.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => {
                    onSelect(gif.fullUrl);
                    onClose();
                  }}
                  className="overflow-hidden rounded-lg border border-[var(--color-hairline)] hover:border-[var(--presence-default-a)]"
                >
                  <img src={gif.previewUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
