'use client';

import { useState } from 'react';
import { X, Hash, Volume2 } from 'lucide-react';
import type { SpaceCategory } from '../../lib/api/spaces';

export function CreateChannelModal({
  categories,
  onClose,
  onCreate,
}: {
  categories: SpaceCategory[];
  onClose: () => void;
  onCreate: (opts: { name: string; kind: 'text' | 'voice'; categoryId: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'text' | 'voice'>('text');
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the channel a name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: trimmed, kind, categoryId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create channel.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-5 py-4">
          <h3 className="text-base font-semibold">Create Channel</h3>
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>
          )}

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Channel Type</div>
            <div className="space-y-1.5">
              <button
                onClick={() => setKind('text')}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  kind === 'text' ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                }`}
              >
                <Hash size={16} />
                <div>
                  <div className="text-[13px] font-medium">Text</div>
                  <div className="text-[11px] text-[var(--color-ink-faint)]">Messages, images, GIFs, threads</div>
                </div>
              </button>
              <button
                onClick={() => setKind('voice')}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  kind === 'voice' ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                }`}
              >
                <Volume2 size={16} />
                <div>
                  <div className="text-[13px] font-medium">Voice</div>
                  <div className="text-[11px] text-[var(--color-ink-faint)]">Hang out together with voice</div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Channel Name</label>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2">
              {kind === 'text' ? <Hash size={14} className="text-[var(--color-ink-faint)]" /> : <Volume2 size={14} className="text-[var(--color-ink-faint)]" />}
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="new-channel"
                className="flex-1 bg-transparent text-[14px] outline-none"
              />
            </div>
          </div>

          {categories.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Category</label>
              <select
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value || null)}
                className="w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2 text-[13px] outline-none"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--color-hairline)] p-4">
          <button onClick={onClose} className="flex-1 rounded-lg bg-[var(--color-surface-raised)] py-2.5 text-[13.5px] font-medium hover:bg-[var(--color-hairline)]">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Channel'}
          </button>
        </div>
      </div>
    </div>
  );
}
