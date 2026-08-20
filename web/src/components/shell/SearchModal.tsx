'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Search as SearchIcon, Hash } from 'lucide-react';
import { searchUsers, type FriendProfile } from '../../lib/api/friends';
import { listPublicSpaces } from '../../lib/api/spaces';
import type { Space } from '../../lib/database.types';

export function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<FriendProfile[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setUsers([]);
      setSpaces([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      Promise.all([searchUsers(trimmed), listPublicSpaces()])
        .then(([u, allPublic]) => {
          setUsers(u);
          // listPublicSpaces has no name-search param — filter
          // client-side rather than adding a second API shape for what's
          // already a small, cached-by-nothing public list.
          setSpaces(allPublic.filter((s) => s.name.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 10));
        })
        .catch(() => {
          setUsers([]);
          setSpaces([]);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] px-4 py-3">
          <SearchIcon size={16} className="text-[var(--color-ink-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or spaces…"
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--color-ink-faint)]"
          />
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {loading && <div className="px-4 py-6 text-center text-[12.5px] text-[var(--color-ink-faint)]">Searching…</div>}

          {!loading && query.trim() && users.length === 0 && spaces.length === 0 && (
            <div className="px-4 py-6 text-center text-[12.5px] text-[var(--color-ink-faint)]">No results for &ldquo;{query}&rdquo;.</div>
          )}

          {!loading && users.length > 0 && (
            <div className="py-1.5">
              <div className="px-4 py-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">People</div>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onClose();
                    router.push(`/${u.username}`);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-[var(--color-surface-raised)]"
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full p-[2px] presence-fill"
                    style={{ ['--p-a' as string]: u.accent_color_top, ['--p-b' as string]: u.accent_color_bottom }}
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-void)]">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold">{u.display_name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{u.display_name}</div>
                    <div className="truncate text-[11px] text-[var(--color-ink-faint)]">@{u.username}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && spaces.length > 0 && (
            <div className="border-t border-[var(--color-hairline)] py-1.5">
              <div className="px-4 py-1 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Public spaces</div>
              {spaces.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onClose();
                    router.push(`/discover?highlight=${s.id}`);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-[var(--color-surface-raised)]"
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-bold text-black presence-fill"
                    style={{ ['--p-a' as string]: s.accent_color_top, ['--p-b' as string]: s.accent_color_bottom }}
                  >
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{s.name}</div>
                    {s.tags.length > 0 && (
                      <div className="flex items-center gap-1 truncate text-[11px] text-[var(--color-ink-faint)]">
                        <Hash size={9} /> {s.tags.slice(0, 3).join(', ')}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
