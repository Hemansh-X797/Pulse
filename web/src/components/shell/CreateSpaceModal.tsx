'use client';

import { useState } from 'react';
import { X, Lock, Globe } from 'lucide-react';

const TAG_SUGGESTIONS = ['gaming', 'art', 'music', 'coding', 'anime', 'study', 'sports', 'movies', 'books', 'food'];

export function CreateSpaceModal({
  onClose,
  onCreate,
  onJoin,
}: {
  onClose: () => void;
  onCreate: (opts: { name: string; isPrivate: boolean; tags: string[] }) => Promise<void>;
  onJoin: (inviteCode: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [inviteCode, setInviteCode] = useState('');
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your space a name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: trimmed, isPrivate, tags: isPrivate ? [] : tags });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create space.');
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    const code = inviteCode.trim();
    if (!code) {
      setJoinError('Paste an invite code or link.');
      return;
    }
    // Accept either a bare code or a full pasted link
    // (palspace.app/join/abc123) — extract the code either way rather
    // than making someone strip the URL themselves.
    const extracted = code.includes('/') ? code.split('/').filter(Boolean).pop()! : code;
    setJoinSubmitting(true);
    setJoinError(null);
    try {
      await onJoin(extracted);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Could not join — check the code.');
      setJoinSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-[var(--color-surface-raised)] p-0.5">
            <button
              onClick={() => setTab('create')}
              className={`rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors ${tab === 'create' ? 'bg-[var(--color-surface-overlay)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
            >
              Create
            </button>
            <button
              onClick={() => setTab('join')}
              className={`rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors ${tab === 'join' ? 'bg-[var(--color-surface-overlay)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
            >
              Join
            </button>
          </div>
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {tab === 'join' ? (
          <>
            {joinError && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{joinError}</div>
            )}
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Invite link or code</label>
            <input
              autoFocus
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="palspace.app/join/abc123 or abc123"
              className="mb-4 w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2 text-[14px] outline-none focus:border-[var(--presence-default-a)]"
            />
            <button
              onClick={handleJoin}
              disabled={joinSubmitting}
              className="w-full rounded-lg presence-fill py-2 text-[13.5px] font-semibold text-black disabled:opacity-60"
            >
              {joinSubmitting ? 'Joining…' : 'Join space'}
            </button>
          </>
        ) : (
          <>
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>
        )}

        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. Late Night Study Room"
          className="mb-4 w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2 text-[14px] outline-none focus:border-[var(--presence-default-a)]"
        />

        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Visibility</label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setIsPrivate(true)}
            className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              isPrivate ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
            }`}
          >
            <Lock size={14} />
            <span className="text-[12.5px] font-medium">Private</span>
            <span className="text-[10.5px] leading-tight text-[var(--color-ink-faint)]">Invite link only</span>
          </button>
          <button
            onClick={() => setIsPrivate(false)}
            className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              !isPrivate ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
            }`}
          >
            <Globe size={14} />
            <span className="text-[12.5px] font-medium">Public</span>
            <span className="text-[10.5px] leading-tight text-[var(--color-ink-faint)]">Joinable via Explore</span>
          </button>
        </div>

        {!isPrivate && (
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">
              Tags <span className="normal-case text-[var(--color-ink-faint)]">(helps people find it in Explore)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_SUGGESTIONS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                    tags.includes(tag)
                      ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/15 text-[var(--presence-default-a)]'
                      : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)]'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-lg presence-fill py-2 text-[13.5px] font-semibold text-black disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create space'}
        </button>
          </>
        )}
      </div>
    </div>
  );
}
