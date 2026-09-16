'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, UserPlus, Check, ShieldOff, Shield, X, Users } from 'lucide-react';
import { getProfileByUsername } from '../lib/api/profile';
import { listUserPosts, listComments, addComment, toggleReaction as togglePostReaction, deletePost, editPost } from '../lib/api/feed';
import { useOpenDm } from '../hooks/useOpenDm';
import { listFriends, listOutgoingRequests, sendFriendRequest, getMutualFriends } from '../lib/api/friends';
import { listBlockedUsers, blockUser, unblockUser } from '../lib/api/blocking';
import { followUser, unfollowUser, isFollowing, getFollowCounts } from '../lib/api/follows';
import { useAppStore } from '../store/useAppStore';
import { NameStyle, type NameStyleData } from '../components/NameStyle';
import { DecoratedAvatar } from '../components/DecoratedAvatar';
import { ProfileDecorBackground } from '../components/ProfileDecorBackground';
import { ProfileBadges } from '../components/ProfileBadges';
import { PostDetailModal } from '../components/PostDetailModal';
import type { FeedItem } from '../lib/database.types';

export function UserProfile() {
  const params = useParams<{ username: string }>()!;
  const username = params.username;
  const openDm = useOpenDm();
  const queryClient = useQueryClient();
  const myProfile = useAppStore((s) => s.profile);
  const [menuOpen, setMenuOpen] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [alreadyFriendsNotice, setAlreadyFriendsNotice] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => getProfileByUsername(username),
  });

  const { data: friends = [] } = useQuery({ queryKey: ['friends'], queryFn: listFriends });
  const { data: outgoing = [] } = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: listOutgoingRequests });
  const { data: blocked = [] } = useQuery({ queryKey: ['blocked-users'], queryFn: listBlockedUsers });
  const { data: following = false } = useQuery({
    queryKey: ['is-following', profile?.id],
    queryFn: () => isFollowing(profile!.id),
    enabled: !!profile && !isLoading,
  });
  const { data: followCounts } = useQuery({
    queryKey: ['follow-counts', profile?.id],
    queryFn: () => getFollowCounts(profile!.id),
    enabled: !!profile,
  });
  const { data: mutualFriends = [] } = useQuery({
    queryKey: ['mutual-friends', profile?.id],
    queryFn: () => getMutualFriends(profile!.id),
    enabled: !!profile && myProfile?.id !== profile?.id,
  });

  const isFriend = profile && friends.some((f) => f.id === profile.id);
  const isRequested = profile && outgoing.some((o) => o.recipient.id === profile.id);
  const isBlocked = profile && blocked.some((b) => b.blocked_id === profile.id);
  const isSelf = myProfile?.id === profile?.id;

  const sendMutation = useMutation({
    mutationFn: () => sendFriendRequest(profile!.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      if (result === 'already_friends') {
        // The other person had already requested you — the RPC
        // resolved it to an accepted friendship instead of leaving two
        // confusing pending requests. Friends list needs invalidating
        // too here specifically (not just requests), since this path
        // skips the normal accept flow that would otherwise do that.
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        setAlreadyFriendsNotice(true);
        setTimeout(() => setAlreadyFriendsNotice(false), 5000);
      }
    },
  });
  const followMutation = useMutation({
    mutationFn: () => (following ? unfollowUser(profile!.id) : followUser(profile!.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-following', profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['follow-counts', profile?.id] });
    },
  });
  const blockMutation = useMutation({
    mutationFn: () => blockUser(profile!.id),
    onSuccess: () => {
      setMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const unblockMutation = useMutation({
    mutationFn: () => unblockUser(profile!.id),
    onSuccess: () => {
      setMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
    },
  });

  async function handleMessage() {
    setMessageError(null);
    try {
      await openDm(username);
      queryClient.invalidateQueries({ queryKey: ['my-dms'] });
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : 'Could not start conversation.');
    }
  }

  if (isLoading) return null;
  if (!profile) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted)]">User not found.</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="h-40"
        style={{
          background: profile.banner_url
            ? `url(${profile.banner_url}) center/cover`
            : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
        }}
      />
      <div className="px-8 pb-8">
        {messageError && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
            {messageError}
            <button onClick={() => setMessageError(null)} className="ml-3 text-red-400 hover:text-[var(--color-ink)]" aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        )}
        {alreadyFriendsNotice && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-[var(--presence-default-a)]/30 bg-[var(--presence-default-a)]/10 px-3 py-2 text-[12.5px] text-[var(--presence-default-a)]">
            {profile.display_name} already requested to add you — since you added them too, you&apos;re both friends now.
            <button onClick={() => setAlreadyFriendsNotice(false)} className="ml-3 hover:opacity-70" aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        )}
        <div className="relative">
          {/* Profile Decor now covers the whole card body — see
              ProfileDecorBackground. The old version used a raw -z-10
              on this element, which (depending on ancestor stacking
              contexts elsewhere on the page) could push it fully
              behind unrelated content and make it invisible outright,
              not just visually subtle. Proper z-0/z-10 layering here
              instead. */}
          <ProfileDecorBackground decorId={profile.equipped_nameplate} />
        <div className="relative z-10 flex items-end justify-between">
          <DecoratedAvatar decorationId={profile.equipped_avatar_decoration} size={80}>
            <div
              className="-mt-10 mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[var(--color-void)] text-2xl font-bold text-black"
              style={{
                background: profile.avatar_url
                  ? `url(${profile.avatar_url}) center/cover`
                  : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
              }}
            >
              {!profile.avatar_url && profile.display_name.slice(0, 2).toUpperCase()}
            </div>
          </DecoratedAvatar>

          {!isSelf && (
            <div className="relative mb-4 flex items-center gap-2">
              <button
                onClick={() => followMutation.mutate()}
                disabled={followMutation.isPending}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium ${
                  following
                    ? 'border border-[var(--color-hairline-strong)] text-[var(--color-ink-muted)] hover:border-red-400 hover:text-red-400'
                    : 'bg-[var(--color-surface-raised)] text-[var(--color-ink)] hover:bg-[var(--color-hairline-strong)]'
                }`}
              >
                {following ? 'Following' : 'Follow'}
              </button>
              {isFriend ? (
                <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-hairline-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-ink-muted)]">
                  <Check size={14} /> Friends
                </span>
              ) : isRequested ? (
                <span className="rounded-full border border-[var(--color-hairline-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-ink-muted)]">
                  Requested
                </span>
              ) : (
                <button
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3.5 py-2 text-[13px] font-semibold text-black"
                >
                  <UserPlus size={14} /> Add Friend
                </button>
              )}
              <button
                onClick={handleMessage}
                className="rounded-full bg-[var(--color-surface-raised)] px-3.5 py-2 text-[13px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-overlay)]"
              >
                Message
              </button>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
                aria-label="More options"
                aria-haspopup="true"
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] text-[12.5px] shadow-xl">
                  {isBlocked ? (
                    <button
                      onClick={() => unblockMutation.mutate()}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[var(--color-ink)] hover:bg-[var(--color-surface-raised)]"
                    >
                      <Shield size={13} /> Unblock
                    </button>
                  ) : (
                    <button
                      onClick={() => blockMutation.mutate()}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-red-300 hover:bg-red-500/10"
                    >
                      <ShieldOff size={13} /> Block
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl font-semibold"><NameStyle name={profile.display_name} style={profile.name_style as NameStyleData} /></h1>
          <ProfileBadges userId={profile.id} size={18} />
        </div>
        <p className="mb-1 text-sm text-[var(--color-ink-muted)]">
          @{profile.username} {profile.pronouns && `· ${profile.pronouns}`}
        </p>
        {followCounts && (
          <p className="mb-1 flex items-center gap-1 text-[12.5px] text-[var(--color-ink-muted)]">
            <Users size={12} />
            <span className="font-semibold text-[var(--color-ink)]">{followCounts.followers}</span> followers
            <span className="mx-0.5">·</span>
            <span className="font-semibold text-[var(--color-ink)]">{followCounts.following}</span> following
          </p>
        )}
        {mutualFriends.length > 0 && (
          <div className="mb-1 flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {mutualFriends.slice(0, 4).map((f) => (
                <div
                  key={f.id}
                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--color-void)] text-[8px] font-bold text-black presence-fill"
                  style={{ ['--p-a' as string]: f.accent_color_top, ['--p-b' as string]: f.accent_color_bottom }}
                  title={f.display_name}
                >
                  {f.avatar_url ? (
                    <img src={f.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    f.display_name.slice(0, 1).toUpperCase()
                  )}
                </div>
              ))}
            </div>
            <span className="text-[12px] text-[var(--color-ink-muted)]">
              {mutualFriends.length} mutual friend{mutualFriends.length !== 1 && 's'}
            </span>
          </div>
        )}
        </div>
        {profile.bio && <p className="mt-3 max-w-lg text-[14px] text-[var(--color-ink)]/80">{profile.bio}</p>}

        {/* Real media grid now — this used to be an explicit placeholder
            ("Media grid — next slice, not stubbed here on purpose") and
            was the one genuine dead end on an otherwise complete profile
            page: there was no way to see someone's post history from
            their profile at all, only the global/following feed. */}
        {profile && <ProfilePostsGrid authorId={profile.id} />}
      </div>
    </div>
  );
}

function ProfilePostsGrid({ authorId }: { authorId: string }) {
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['user-posts', authorId],
    queryFn: () => listUserPosts(authorId),
  });
  const [selected, setSelected] = useState<FeedItem | null>(null);
  // "Shared Media" is specifically about posts with an attached image —
  // a text-only post has nowhere sensible to render as a grid thumbnail,
  // and this section already existed with that exact label rather than
  // a generic "Posts" heading, so scoping to media-bearing posts matches
  // what was already promised rather than silently redefining the
  // section to mean something else.
  const mediaPosts = posts.filter((p) => p.media_url);

  return (
    <div className="mt-10 border-t border-[var(--color-hairline)] pt-6">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-ink-muted)]">Shared Media</h2>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-md bg-[var(--color-surface-raised)]" />
          ))}
        </div>
      ) : mediaPosts.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">No shared media yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {mediaPosts.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="group relative aspect-square overflow-hidden rounded-md bg-[var(--color-surface-raised)]"
            >
              <img src={p.media_url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              {(p.reaction_count > 0 || p.comment_count > 0) && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 text-[12px] font-semibold text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                  {p.reaction_count > 0 && <span>♥ {p.reaction_count}</span>}
                  {p.comment_count > 0 && <span>💬 {p.comment_count}</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {selected && <ProfilePostModal post={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// Same interaction wiring PostCard uses in HomeFeed.tsx (comments query,
// like-toggle mutation, share via Web Share API with a clipboard
// fallback) — duplicated rather than importing PostCard directly, since
// PostCard also owns its own feed-row layout (avatar/name header, action
// bar) that doesn't apply here; only the *modal* behavior needed reusing,
// which is what PostDetailModal already encapsulates.
function ProfilePostModal({ post, onClose }: { post: FeedItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const isMine = profile?.id === post.author_id;
  const LIKE_EMOJI = '❤️';

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ['comments', post.id],
    queryFn: () => listComments(post.id),
  });

  const reactMutation = useMutation({
    mutationFn: (emoji: string) => togglePostReaction(post.id, emoji, post.my_reactions.includes(emoji)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['user-posts', post.author_id] });
    },
  });

  async function handleShare() {
    const url = `${window.location.origin}/${post.author_username}#post-${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `${post.author_display_name} on PalSpace` });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      // navigator.share throws on user cancel — not an error worth surfacing.
    }
  }

  return (
    <PostDetailModal
      post={post}
      comments={comments}
      commentsLoading={commentsLoading}
      liked={post.my_reactions.includes(LIKE_EMOJI)}
      onToggleLike={() => reactMutation.mutate(LIKE_EMOJI)}
      onShare={handleShare}
      onClose={onClose}
      isMine={isMine}
      onSubmitComment={async (body, parentCommentId) => {
        await addComment(post.id, body, parentCommentId);
        queryClient.invalidateQueries({ queryKey: ['comments', post.id] });
        queryClient.invalidateQueries({ queryKey: ['user-posts', post.author_id] });
      }}
      onEdit={isMine ? () => {
        const next = window.prompt('Edit post', post.body_rendered);
        if (next && next.trim()) {
          editPost(post.id, next.trim()).then(() => queryClient.invalidateQueries({ queryKey: ['user-posts', post.author_id] }));
        }
      } : undefined}
      onDelete={
        isMine
          ? () => {
              if (window.confirm('Delete this post?')) {
                deletePost(post.id).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['user-posts', post.author_id] });
                  onClose();
                });
              }
            }
          : undefined
      }
    />
  );
}