'use client';

import { useMemo } from 'react';
import { EMOJI_MAP } from '../../lib/emoji';

/**
 * A few shortcodes map to the same emoji (thumbsup/+1, thumbsdown/-1) —
 * dedupe by emoji character so the grid doesn't show the same face
 * twice, picking whichever shortcode key comes first.
 */
const UNIQUE_EMOJIS = Array.from(new Map(Object.entries(EMOJI_MAP).map(([code, emoji]) => [emoji, code])).entries());

export function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const entries = useMemo(() => UNIQUE_EMOJIS, []);
  return (
    <div className="absolute bottom-full right-0 z-20 mb-2 w-72 rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">Emoji</span>
        <button onClick={onClose} className="text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          Close
        </button>
      </div>
      <div className="grid max-h-56 grid-cols-7 gap-1 overflow-y-auto">
        {entries.map(([emoji, code]) => (
          <button
            key={code}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            title={`:${code}:`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg hover:bg-[var(--color-surface-raised)]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
