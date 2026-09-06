'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Hash, Check, Search as SearchIcon, Heart, MessageCircle } from 'lucide-react';
import { listPublicSpaces, joinPublicSpace, listMySpaces } from '../lib/api/spaces';
import { listTopPosts, searchPostsByHashtag } from '../lib/api/feed';
import { renderMarkdown } from '../lib/markdown';
import { NameStyle, type NameStyleData } from '../components/NameStyle';
import { useAppStore } from '../store/useAppStore';

type Category = 'spaces' | 'feed';

export function Discover() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams?.get('highlight');
  const tagParam = searchParams?.get('tag');
  const profile = useAppStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Category (Spaces vs Feed) is the primary split now — search and
  // "top choices" live underneath whichever category is active, per
  // your explicit spec: "explore, then options come, spaces and feed,
  // then a searchbar and top choices."
  const [category, setCategory] = useState<Category>(tagParam ? 'feed' : 'spaces');
  // "Your spaces" sub-tab exists specifically so joined spaces stay
  // reachable on mobile — the rail's own scrollable space-icon list is
  // desktop-only. Only relevant within the Spaces category.
  const [spacesSubTab, setSpacesSubTab] = useState<'explore' | 'yours'>('explore');

  useEffect(() => {
    if (tagParam) {
      setCategory('feed');
      setSearchQuery(tagParam);
    }
  }, [tagParam]);

  const { data: spaces = [], isLoading: spacesLoading } = useQuery({
    queryKey: ['public-spaces', profile?.interests],
    queryFn: () => listPublicSpaces(profile?.interests),
    enabled: category === 'spaces' && spacesSubTab === 'explore',
  });

  const { data: mySpaces = [], isLoading: myLoading } = useQuery({
    queryKey: ['spaces'],
    queryFn: listMySpaces,
    enabled: category === 'spaces' && spacesSubTab === 'yours',
  });

  const { data: topPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['top-posts'],
    queryFn: () => listTopPosts(),
    enabled: category === 'feed' && !searchQuery.trim(),
  });

  const { data: hashtagPosts = [], isLoading: hashtagLoading } = useQuery({
    queryKey: ['hashtag-posts', searchQuery],
    queryFn: () => searchPostsByHashtag(searchQuery),
    enabled: category === 'feed' && !!searchQuery.trim(),
  });

  const joinMutation = useMutation({
    mutationFn: joinPublicSpace,
    onSuccess: (_, spaceId) => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      router.push(`/spaces/${spaceId}`);
    },
  });

  const allSpaceTags = Array.from(new Set(spaces.flatMap((s) => s.tags))).sort();
  const spaceSearchLower = category === 'spaces' ? searchQuery.trim().toLowerCase() : '';
  const visibleSpaces = spaces
    .filter((s) => !activeTag || s.tags.includes(activeTag))
    .filter((s) => !spaceSearchLower || s.name.toLowerCase().includes(spaceSearchLower));

  const feedResults = searchQuery.trim() ? hashtagPosts : topPosts;
  const feedLoading = searchQuery.trim() ? hashtagLoading : postsLoading;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-center gap-2.5 border-b border-[var(--color-hairline)] px-4 md:px-7">
        <h2 className="font-serif text-lg font-semibold">Discover</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-6">
        <div className="mb-4 flex gap-1.5">
          <button
            onClick={() => setCategory('spaces')}
            className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
              category === 'spaces' ? 'bg-white text-black' : 'bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            Spaces
          </button>
          <button
            onClick={() => setCategory('feed')}
            className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
              category === 'feed' ? 'bg-white text-black' : 'bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            Feed
          </button>

          {category === 'spaces' && (
            <div className="ml-auto flex gap-1 rounded-lg bg-[var(--color-surface-raised)] p-0.5 md:hidden">
              <button
                onClick={() => setSpacesSubTab('explore')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${spacesSubTab === 'explore' ? 'bg-[var(--color-surface-overlay)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
              >
                Explore
              </button>
              <button
                onClick={() => setSpacesSubTab('yours')}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${spacesSubTab === 'yours' ? 'bg-[var(--color-surface-overlay)] text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}`}
              >
                Yours
              </button>
            </div>
          )}
        </div>

        {!(category === 'spaces' && spacesSubTab === 'yours') && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 py-2">
            <SearchIcon size={14} className="text-[var(--color-ink-faint)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={category === 'spaces' ? 'Search spaces…' : 'Search #hashtags…'}
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--color-ink-faint)]"
            />
          </div>
        )}

        {category === 'spaces' && spacesSubTab === 'yours' && (
          <div className="md:hidden">
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
        )}

        {category === 'spaces' && spacesSubTab === 'explore' && (
          <>
            {allSpaceTags.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveTag(null)}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                    !activeTag ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/15 text-[var(--presence-default-a)]' : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)]'
                  }`}
                >
                  All
                </button>
                {allSpaceTags.map((tag) => (
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

            {spacesLoading && <div className="text-[13px] text-[var(--color-ink-faint)]">Loading spaces…</div>}
            {!spacesLoading && visibleSpaces.length === 0 && (
              <p className="text-[13px] text-[var(--color-ink-muted)]">No public spaces match yet.</p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleSpaces.map((space) => (
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
          </>
        )}

        {category === 'feed' && (
          <>
            {!searchQuery.trim() && (
              <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Top choices</div>
            )}
            {feedLoading && <div className="text-[13px] text-[var(--color-ink-faint)]">Loading…</div>}
            {!feedLoading && feedResults.length === 0 && (
              <p className="text-[13px] text-[var(--color-ink-muted)]">
                {searchQuery.trim() ? `No posts tagged #${searchQuery.replace(/^#/, '')} yet.` : 'Nothing to show yet — check back once people start posting.'}
              </p>
            )}
            <div className="space-y-3">
              {feedResults.map((post) => (
                <button
                  key={post.id}
                  onClick={() => router.push('/home')}
                  className="bespoke-corner block w-full rounded-2xl border border-[var(--color-hairline)] p-4 text-left transition-colors hover:border-[var(--color-hairline-strong)]"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black presence-fill"
                      style={{ ['--p-a' as string]: post.author_accent_top, ['--p-b' as string]: post.author_accent_bottom }}
                    >
                      {post.author_avatar_url ? (
                        <img src={post.author_avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        post.author_display_name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="text-[12.5px] font-semibold">
                      <NameStyle name={post.author_display_name} style={post.author_name_style as NameStyleData} />
                    </span>
                  </div>
                  <div className="mb-2 line-clamp-3 text-[13.5px] leading-relaxed text-[var(--color-ink)]/90">
                    {renderMarkdown(post.body_rendered, profile?.username)}
                  </div>
                  <div className="flex items-center gap-4 text-[11.5px] text-[var(--color-ink-muted)]">
                    <span className="flex items-center gap-1">
                      <Heart size={12} /> {post.reaction_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={12} /> {post.comment_count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
