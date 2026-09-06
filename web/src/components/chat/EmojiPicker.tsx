'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { EMOJI_MAP } from '../../lib/emoji';
import { getRecentEmojiCodes, recordEmojiUsed } from '../../lib/recentEmoji';

/**
 * A few shortcodes map to the same emoji (thumbsup/+1, thumbsdown/-1) —
 * dedupe by emoji character so the grid doesn't show the same face
 * twice, picking whichever shortcode key comes first.
 */
const UNIQUE_EMOJIS = Array.from(new Map(Object.entries(EMOJI_MAP).map(([code, emoji]) => [emoji, code])).entries());

export function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const entries = useMemo(() => UNIQUE_EMOJIS, []);
  const [query, setQuery] = useState('');
  // Recomputed on every open (not memoized once) so a freshly-used
  // emoji actually shows up in "Frequently Used" the next time this
  // picker opens, rather than reflecting whatever the list looked like
  // when the component first mounted.
  const recentCodes = getRecentEmojiCodes();
  const recentEntries = recentCodes
    .map((code) => [EMOJI_MAP[code], code] as [string, string])
    .filter(([emoji]) => !!emoji);

  const filtered = query.trim()
    ? entries.filter(([, code]) => code.toLowerCase().includes(query.trim().toLowerCase()))
    : entries;

  function handleSelect(emoji: string, code: string) {
    recordEmojiUsed(code);
    onSelect(emoji);
    onClose();
  }

  return (
    <div className="absolute bottom-full right-0 z-20 mb-2 w-72 rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">Emoji</span>
        <button onClick={onClose} className="text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          Close
        </button>
      </div>
      <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-2 py-1">
        <Search size={12} className="text-[var(--color-ink-faint)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="w-full bg-transparent text-[11.5px] outline-none placeholder:text-[var(--color-ink-faint)]"
        />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {!query.trim() && recentEntries.length > 0 && (
          <div className="mb-2">
            <div className="mb-1 px-1 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">Frequently Used</div>
            <div className="grid grid-cols-7 gap-1">
              {recentEntries.map(([emoji, code]) => (
                <button
                  key={`recent-${code}`}
                  onClick={() => handleSelect(emoji, code)}
                  title={`:${code}:`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-[var(--color-surface-raised)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-7 gap-1">
          {filtered.map(([emoji, code]) => (
            <button
              key={code}
              onClick={() => handleSelect(emoji, code)}
              title={`:${code}:`}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-[var(--color-surface-raised)]"
            >
              {emoji}
            </button>
          ))}
          {filtered.length === 0 && <div className="col-span-7 py-4 text-center text-[11.5px] text-[var(--color-ink-faint)]">No matches.</div>}
        </div>
      </div>
    </div>
  );
}
