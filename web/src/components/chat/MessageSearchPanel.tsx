'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { searchMessages } from '../../lib/api/channels';

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * There was previously no way to find an older message in a
 * conversation short of scrolling all the way back through it
 * manually — every real chat product treats this as table stakes.
 * Backed by searchMessages() (ilike substring match within the
 * channel); clicking a result hands off to jumpToMessage in ChatView,
 * which knows how to load a fresh window around a result that's
 * older than what's currently loaded in the DOM.
 */
export function MessageSearchPanel({
  channelId,
  onClose,
  onJumpTo,
}: {
  channelId: string;
  onClose: () => void;
  onJumpTo: (messageId: number) => void;
}) {
  const [query, setQuery] = useState('');
  const { data: results, isFetching } = useQuery({
    queryKey: ['message-search', channelId, query],
    queryFn: () => searchMessages(channelId, query),
    enabled: query.trim().length > 1,
  });

  return (
    <div className="border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-2.5 md:px-7">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-1.5">
        <Search size={13} className="text-[var(--color-ink-faint)]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Search this conversation…"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--color-ink-faint)]"
        />
        {isFetching && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-transparent" />}
        <button onClick={onClose} className="shrink-0 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close search">
          <X size={14} />
        </button>
      </div>

      {query.trim().length > 1 && (
        <div className="max-h-64 overflow-y-auto">
          {results && results.length > 0 ? (
            results.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onJumpTo(m.id);
                  onClose();
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--color-surface-raised)]"
              >
                <div className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[var(--color-ink)]">{m.sender_display_name}</span>
                  <span className="shrink-0 text-[10px] text-[var(--color-ink-faint)]">{timeLabel(m.created_at)}</span>
                </div>
                <span className="line-clamp-1 text-[12px] text-[var(--color-ink-muted)]">{m.body_rendered}</span>
              </button>
            ))
          ) : (
            !isFetching && <p className="px-2.5 py-3 text-center text-[12px] text-[var(--color-ink-faint)]">No messages found.</p>
          )}
        </div>
      )}
    </div>
  );
}
