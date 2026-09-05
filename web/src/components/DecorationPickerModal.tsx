'use client';

import { useState } from 'react';
import { X, Search, Check } from 'lucide-react';

export interface DecorationItem {
  id: string;
  label: string;
  icon: string;
  is_animated: boolean;
}

/**
 * Generic searchable grid picker for a decoration catalog — used for
 * both avatar decorations and Profile Decor. Always rendering the full
 * catalog inline (the old approach) works fine at 6-7 items; it falls
 * apart completely once there are ~200, which is exactly the scale
 * this is being built for (see 034_decoration_catalogs.sql). This
 * keeps the settings page itself to a compact "here's what you have
 * equipped, tap to change" control, and only the modal itself deals
 * with the full list, with a search box so finding one of 200 doesn't
 * mean scrolling through all of them.
 */
export function DecorationPickerModal({
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  renderPreview,
}: {
  title: string;
  items: DecorationItem[];
  selectedId: string | null | undefined;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  renderPreview: (item: DecorationItem) => React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const filtered = query.trim() ? items.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase())) : items;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[560px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-3">
          <span className="text-[14px] font-semibold">{title}</span>
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="border-b border-[var(--color-hairline)] px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-2.5 py-1.5">
            <Search size={13} className="text-[var(--color-ink-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--color-ink-faint)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              className={`flex h-20 flex-col items-center justify-center gap-1 rounded-xl border text-[10.5px] text-[var(--color-ink-muted)] ${
                !selectedId ? 'border-[var(--presence-default-a)]' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
              }`}
            >
              None
            </button>
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                title={item.label}
                className={`relative flex h-20 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border bg-[var(--color-void)] p-1.5 ${
                  selectedId === item.id ? 'border-[var(--presence-default-a)]' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                }`}
              >
                {selectedId === item.id && (
                  <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full presence-fill text-black">
                    <Check size={9} />
                  </span>
                )}
                {renderPreview(item)}
                <span className="max-w-full truncate text-[9.5px] text-[var(--color-ink-muted)]">{item.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-3 py-6 text-center text-[12px] text-[var(--color-ink-faint)]">No matches.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
