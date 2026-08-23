'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hash, Check } from 'lucide-react';
import { listPublicSpaces, joinPublicSpace, listMySpaces } from '../lib/api/spaces';
import { useAppStore } from '../store/useAppStore';

export function Discover() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams?.get('highlight');
  const profile = useAppStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // "Your spaces" tab exists specifically so joined spaces stay
  // reachable on mobile — the rail's own scrollable space-icon list is
  // desktop-only (no room for it in a 6-item bottom bar), so this is
  // the mobile path to spaces you're already in. Hidden entirely on
  // desktop (md:hidden below) since the rail already covers that case
  // there.
  const [tab, setTab] = useState<'explore' | 'yours'>('explore');

  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ['public-spaces', profile?.interests],
    // Uses your own interests as the initial filter (server does the
    // overlap match, falling back to all public spaces if nothing
    // matches yet — see listPublicSpaces) — the tag pills below let you
    // narrow further or clear back to everything.
    queryFn: () => listPublicSpaces(profile?.interests),
    enabled: tab === 'explore',
  });

  const { data: mySpaces = [], isLoading: myLoading } = useQuery({
    queryKey: ['spaces'],
    queryFn: listMySpaces,
    enabled: tab === 'yours',
  });

  const joinMutation = useMutation({
    mutationFn: joinPublicSpace,
    onSuccess: (_, spaceId) => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      router.push(`/spaces/${spaceId}`);
    },
  });

  const allTags = Array.from(new Set(spaces.flatMap((s) => s.tags))).sort();
  const visible = activeTag ? spaces.filter((s) => s.tags.includes(activeTag)) : spaces;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-center gap-2.5 border-b border-[var(--color-hairline)] px-4 md:px-7">
        <h2 className="font-serif text-lg font-semibold">Discover</h2>
        <span className="hidden text-xs text-[var(--color-ink-muted)] sm:inline">public spaces you can join instantly</span>
        <div className="ml-auto flex gap-1 rounded-lg bg-[var(--color-surface-raised)] p-0.5 md:hidden">
          <button
            onClick={() => setTab('explore')}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${tab === 'explore' ? 'bg-[var(--color-surface-overlay)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
          >
            Explore
          </button>
          <button
            onClick={() => setTab('yours')}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${tab === 'yours' ? 'bg-[var(--color-surface-overlay)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
          >
            Yours
          </button>
        </div>
      </div>

      {tab === 'yours' ? (
        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-6 md:hidden">
          {myLoading && <div className="text-[13px] text-[var(--color-ink-faint)]">Loading…</div>}
          {!myLoading && mySpaces.length === 0 && (
            <p className="text-[13px] text-[var(--color-ink-muted)]">You haven&apos;t joined any spaces yet — switch to Explore.</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {mySpaces.map((space) => (
              <button
                key={space.id}
                onClick={() => router.push(`/spaces/${space.id}`)}
                className="bespoke-corner flex flex-col items-start gap-2 rounded-2xl border border-[var(--color-hairline)] p-4 text-left hover:border-[var(--color-hairline-strong)]"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-[14px] font-bold text-black presence-fill"
                  style={{ ['--p-a' as string]: space.accent_color_top, ['--p-b' as string]: space.accent_color_bottom }}
                >
                  {space.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="truncate text-[13px] font-medium">{space.name}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-6">
        {allTags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                !activeTag ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/15 text-[var(--presence-default-a)]' : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)]'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                  activeTag === tag ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/15 text-[var(--presence-default-a)]' : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)]'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {isLoading && <div className="text-[13px] text-[var(--color-ink-faint)]">Loading spaces…</div>}

        {!isLoading && visible.length === 0 && (
          <p className="text-[13px] text-[var(--color-ink-muted)]">No public spaces yet — be the first to create one.</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((space) => (
            <div
              key={space.id}
              className={`bespoke-corner rounded-2xl border p-4 transition-colors ${
                highlightId === space.id ? 'border-[var(--presence-default-a)]' : 'border-[var(--color-hairline)]'
              }`}
            >
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-[14px] font-bold text-black presence-fill"
                style={{ ['--p-a' as string]: space.accent_color_top, ['--p-b' as string]: space.accent_color_bottom }}
              >
                {space.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="mb-1 truncate text-[14px] font-semibold">{space.name}</div>
              {space.tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {space.tags.map((t) => (
                    <span key={t} className="flex items-center gap-0.5 text-[10.5px] text-[var(--color-ink-faint)]">
                      <Hash size={9} />
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => joinMutation.mutate(space.id)}
                disabled={joinMutation.isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-surface-raised)] py-1.5 text-[12.5px] font-medium hover:bg-[var(--color-surface-overlay)] disabled:opacity-60"
              >
                <Check size={13} /> Join
              </button>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
