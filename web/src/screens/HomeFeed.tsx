'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Send, ImagePlus, MoreHorizontal, Pencil, Trash2, X, Share2 } from 'lucide-react';
import {
  listFeed,
  createPost,
  editPost,
  deletePost,
  toggleReaction,
  listComments,
  addComment,
  editComment,
  deleteComment,
} from '../lib/api/feed';
import { uploadMedia } from '../lib/api/media';
import { useAppStore } from '../store/useAppStore';
import type { FeedItem } from '../lib/database.types';

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Single-heart Instagram-style reaction — replaced the 3-emoji bar
// (🔥/❤️/💯) you called out. `post.my_reactions` still comes back as an
// array from the DB (any-emoji schema, unchanged — see migration 003),
// this UI just only ever uses the ❤️ slot of it now.
const LIKE_EMOJI = '❤️';

export function HomeFeed() {
  const queryClient = useQueryClient();
  const { data: posts = [], isLoading } = useQuery({ queryKey: ['feed'], queryFn: () => listFeed() });

  const [body, setBody] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const postMutation = useMutation({
    mutationFn: () => createPost(body, pendingImage ?? undefined),
    onSuccess: () => {
      setBody('');
      setPendingImage(null);
      setComposeError(null);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (e) => setComposeError(e instanceof Error ? e.message : 'Failed to post.'),
  });

  async function handleAttach(file: File) {
    setComposeError(null);
    setUploading(true);
    try {
      const url = await uploadMedia(file);
      setPendingImage(url);
    } catch (e) {
      // Previously unhandled entirely — a failed upload just did nothing
      // visible. This is almost certainly what "images don't work in
      // posts" actually was: not a PNG-specific bug, a swallowed error.
      setComposeError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-baseline gap-2.5 border-b border-[var(--color-hairline)] px-7">
        <h2 className="font-serif text-lg font-semibold">Feed</h2>
        <span className="text-xs text-[var(--color-ink-muted)]">posts from everyone on PalSpace</span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto px-7 py-7">
        <div className="w-full max-w-[560px] rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's happening? Try :fire: :rocket: :100:"
            className="min-h-[46px] w-full resize-none bg-transparent text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-faint)] outline-none"
          />
          {pendingImage && (
            <div className="relative mt-2 inline-block">
              <img src={pendingImage} alt="" className="max-h-36 rounded-lg border border-[var(--color-hairline-strong)]" />
              <button
                onClick={() => setPendingImage(null)}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface-overlay)] text-xs text-[var(--color-ink)]"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          )}
          {composeError && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
              {composeError}
              <button onClick={() => setComposeError(null)} className="ml-3 text-red-400 hover:text-[var(--color-ink)]" aria-label="Dismiss">
                <X size={13} />
              </button>
            </div>
          )}
          <div className="mt-2.5 flex items-center justify-between">
            <label
              className={`flex h-7.5 w-7.5 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] ${
                uploading ? 'cursor-wait opacity-60' : 'cursor-pointer'
              }`}
            >
              {uploading ? (
                <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-ink-faint)] border-t-[var(--color-ink)]" />
              ) : (
                <ImagePlus size={15} />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAttach(file);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              onClick={() => postMutation.mutate()}
              disabled={!body.trim() || postMutation.isPending}
              className="rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-black disabled:opacity-40"
            >
              {postMutation.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>

        {!isLoading && posts.length === 0 && <EmptyFeed />}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 text-center">
      <div className="text-[13px] text-[var(--color-ink-muted)]">No posts yet — be the first.</div>
    </div>
  );
}

function Avatar({ url, name, size = 34, accentTop, accentBottom }: { url?: string; name: string; size?: number; accentTop?: string; accentBottom?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        ...(accentTop ? { ['--p-a' as string]: accentTop, ['--p-b' as string]: accentBottom } : {}),
      }}
      className="flex shrink-0 items-center justify-center rounded-full presence-fill font-bold text-black"
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function PostCard({ post }: { post: FeedItem }) {
  const queryClient = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const isMine = profile?.id === post.author_id;

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(post.body_rendered);

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ['comments', post.id],
    queryFn: () => listComments(post.id),
    enabled: commentsOpen,
  });

  const reactMutation = useMutation({
    mutationFn: (emoji: string) => toggleReaction(post.id, emoji, post.my_reactions.includes(emoji)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });
  const liked = post.my_reactions.includes(LIKE_EMOJI);

  const [shareStatus, setShareStatus] = useState<string | null>(null);
  async function handleShare() {
    const url = `${window.location.origin}/${post.author_username}#post-${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `${post.author_display_name} on PalSpace` });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus('Link copied');
      setTimeout(() => setShareStatus(null), 1800);
    } catch {
      // navigator.share throws if the user just cancels the native
      // share sheet — that's not an error worth surfacing.
    }
  }

  const editMutation = useMutation({
    mutationFn: (body: string) => editPost(post.id, body),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  const commentMutation = useMutation({
    mutationFn: () => addComment(post.id, commentBody),
    onSuccess: () => {
      setCommentBody('');
      queryClient.invalidateQueries({ queryKey: ['comments', post.id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  function handleDelete() {
    if (!window.confirm('Delete this post? This can\'t be undone.')) return;
    deleteMutation.mutate();
  }

  return (
    <div className="w-full max-w-[560px] rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-hairline-strong)]">
      <div className="mb-3 flex items-center gap-2.5">
        <Link href={`/${post.author_username}`} className="shrink-0">
          <Avatar
            url={post.author_avatar_url}
            name={post.author_display_name}
            size={34}
            accentTop={post.author_accent_top}
            accentBottom={post.author_accent_bottom}
          />
        </Link>
        <Link href={`/${post.author_username}`} className="min-w-0 flex-1 hover:opacity-80">
          <div className="text-[13.5px] font-semibold">{post.author_display_name}</div>
          <div className="text-[11.5px] text-[var(--color-ink-muted)]">
            @{post.author_username} · {timeAgo(post.created_at)}
            {post.edited_at && ' · edited'}
          </div>
        </Link>

        {isMine && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
              aria-label="Post options"
              aria-haspopup="true"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded-xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-raised)] text-[12.5px] shadow-xl">
                <button
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[var(--color-ink)] hover:bg-[var(--color-surface-overlay)]"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="mb-3.5">
          <textarea
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="min-h-[60px] w-full resize-none rounded-lg border border-[var(--presence-default-b)] bg-[var(--color-surface-raised)] p-2.5 text-[15px] text-[var(--color-ink)] outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => editMutation.mutate(editValue)}
              disabled={!editValue.trim() || editMutation.isPending}
              className="rounded-full bg-white px-4 py-1.5 text-[12.5px] font-semibold text-black disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEditValue(post.body_rendered);
              }}
              className="rounded-full px-4 py-1.5 text-[12.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3.5 whitespace-pre-wrap text-[15px] leading-relaxed">{post.body_rendered}</div>
      )}

      {post.media_url && (
        <div className="-mt-1 mb-3.5 overflow-hidden rounded-xl border border-[var(--color-hairline)]">
          <img src={post.media_url} alt="" className="max-h-[480px] w-full object-cover" />
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={() => reactMutation.mutate(LIKE_EMOJI)}
          disabled={reactMutation.isPending}
          className="group flex items-center gap-1.5"
          aria-pressed={liked}
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          <Heart
            size={22}
            strokeWidth={2}
            className={liked ? 'fill-red-500 text-red-500' : 'text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]'}
          />
          {post.reaction_count > 0 && (
            <span className={`font-mono text-[12px] ${liked ? 'font-semibold text-red-500' : 'text-[var(--color-ink-muted)]'}`}>
              {post.reaction_count}
            </span>
          )}
        </button>

        <button
          onClick={() => setCommentsOpen((v) => !v)}
          className="group flex items-center gap-1.5"
          aria-label="Comments"
          aria-expanded={commentsOpen}
        >
          <MessageCircle size={21} strokeWidth={2} className="text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]" />
          {post.comment_count > 0 && <span className="font-mono text-[12px] text-[var(--color-ink-muted)]">{post.comment_count}</span>}
        </button>

        <button onClick={handleShare} className="group flex items-center" aria-label="Share">
          <Share2 size={20} strokeWidth={2} className="text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]" />
        </button>

        {shareStatus && <span className="text-[11px] text-[var(--color-ink-faint)]">{shareStatus}</span>}
      </div>

      {commentsOpen && (
        <div className="mt-3.5 border-t border-[var(--color-hairline)] pt-3">
          {commentsLoading && <div className="mb-2 text-[13px] text-[var(--color-ink-muted)]">Loading comments…</div>}
          {!commentsLoading && comments.length === 0 && (
            <div className="mb-2 text-[13px] text-[var(--color-ink-muted)]">No comments yet — say something.</div>
          )}
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} postId={post.id} />
          ))}
          <div className="mt-2 flex items-center gap-2">
            <Avatar
              url={profile?.avatar_url}
              name={profile?.display_name ?? '?'}
              size={24}
              accentTop={profile?.accent_color_top}
              accentBottom={profile?.accent_color_bottom}
            />
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commentBody.trim() && commentMutation.mutate()}
              placeholder="Write a comment..."
              className="flex-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3.5 py-2 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-faint)] outline-none"
            />
            <button
              onClick={() => commentMutation.mutate()}
              disabled={!commentBody.trim() || commentMutation.isPending}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
              aria-label="Send comment"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  postId,
}: {
  comment: { id: number; author_id: string; author_username: string; author_display_name: string; author_avatar_url: string; author_accent_top: string; author_accent_bottom: string; body_rendered: string; edited_at: string | null; created_at: string };
  postId: number;
}) {
  const queryClient = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const isMine = profile?.id === comment.author_id;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(comment.body_rendered);

  const editMutation = useMutation({
    mutationFn: (body: string) => editComment(comment.id, body),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  return (
    <div className="group mb-2.5 flex items-start gap-2">
      <Link href={`/${comment.author_username}`} className="shrink-0">
        <Avatar
          url={comment.author_avatar_url}
          name={comment.author_display_name}
          size={24}
          accentTop={comment.author_accent_top}
          accentBottom={comment.author_accent_bottom}
        />
      </Link>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && value.trim() && editMutation.mutate(value)}
              className="min-w-[160px] flex-1 rounded-full border border-[var(--presence-default-b)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-[12.5px] text-[var(--color-ink)] outline-none"
            />
            <button
              onClick={() => editMutation.mutate(value)}
              className="text-[11px] font-semibold text-[var(--color-ink)]"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-[11px] text-[var(--color-ink-muted)]">
              Cancel
            </button>
          </div>
        ) : (
          <div className="text-[13px] leading-snug text-[var(--color-ink-muted)]">
            <Link href={`/${comment.author_username}`} className="font-semibold text-[var(--color-ink)] hover:underline">
              {comment.author_display_name}
            </Link>{' '}
            <span className="text-[10.5px] text-[var(--color-ink-faint)]">@{comment.author_username} · {timeAgo(comment.created_at)}{comment.edited_at && ' · edited'}</span>
            <div>{comment.body_rendered}</div>
          </div>
        )}
      </div>
      {isMine && !editing && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => setEditing(true)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            aria-label="Edit comment"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={() => window.confirm('Delete this comment?') && deleteMutation.mutate()}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:text-red-400"
            aria-label="Delete comment"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
