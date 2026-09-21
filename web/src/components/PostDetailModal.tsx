'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Heart, Share2, Pencil, Trash2 } from 'lucide-react';
import { renderMarkdown } from '../lib/markdown';
import { extractFirstUrl, LinkPreviewCard } from './shared/LinkPreviewCard';
import { useAppStore } from '../store/useAppStore';
import { CommentRow } from './CommentRow';
import { NameStyle, type NameStyleData } from './NameStyle';
import type { FeedItem, PostComment } from '../lib/database.types';

type FeedComment = PostComment & {
  author_username: string;
  author_display_name: string;
  author_avatar_url: string;
  author_accent_top: string;
  author_accent_bottom: string;
  author_name_style?: { font?: string; effect?: string; colors?: string[] } | null;
};

const LIKE_EMOJI = '❤️';

/**
 * Opened by clicking a post's body/image or its comment icon in the
 * feed — post on the left, comments on their own scrollable column on
 * the right (stacked on mobile, same list/detail split as the rest of
 * the app's mobile layout). Closes via the X, Escape, or clicking the
 * backdrop.
 *
 * Deliberately takes the post's live mutation handlers as props
 * (liked/onToggleLike/onShare/onEdit/onDelete) rather than
 * re-implementing them — PostCard already owns that state and the
 * query cache invalidation that goes with it; duplicating it here
 * would just be two sources of truth for the same like count.
 */
export function PostDetailModal({
  post,
  comments,
  commentsLoading,
  liked,
  onToggleLike,
  onShare,
  onClose,
  onSubmitComment,
  isMine,
  onEdit,
  onDelete,
}: {
  post: FeedItem;
  comments: FeedComment[];
  commentsLoading: boolean;
  liked: boolean;
  onToggleLike: () => void;
  onShare: () => void;
  onClose: () => void;
  onSubmitComment: (body: string, parentCommentId?: number) => Promise<void>;
  isMine: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const profile = useAppStore((s) => s.profile);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Who a reply is currently aimed at — cleared after posting or via the
  // cancel button on the "Replying to @x" chip. Only ever a top-level
  // comment's id (enforced server-side too, see
  // 040_comment_replies.sql's single-level trigger), matching the
  // deliberate one-level-of-nesting design.
  const [replyTarget, setReplyTarget] = useState<FeedComment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Comments arrive as one flat list (order by id) — group them into
  // top-level comments with their replies attached, once per render
  // rather than making CommentRow re-derive this per row. A reply whose
  // parent got deleted (parent_comment_id no longer matches anything
  // live) is deliberately dropped rather than promoted to top-level or
  // shown orphaned — post_comments.parent_comment_id cascades on delete
  // at the DB level, so this case is mostly defensive.
  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesByParent = new Map<number, FeedComment[]>();
  for (const c of comments) {
    if (c.parent_comment_id) {
      const list = repliesByParent.get(c.parent_comment_id) ?? [];
      list.push(c);
      repliesByParent.set(c.parent_comment_id, list);
    }
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function handleSubmit() {
    const trimmed = commentBody.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmitComment(trimmed, replyTarget?.id);
      setCommentBody('');
      setReplyTarget(null);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReply(comment: FeedComment) {
    setReplyTarget(comment);
    inputRef.current?.focus();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 md:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] md:h-[85vh] md:flex-row md:rounded-2xl"
      >
        {/* Post pane */}
        <div className="flex flex-1 flex-col overflow-y-auto border-b border-[var(--color-hairline)] p-5 md:w-[58%] md:flex-none md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-black presence-fill"
              style={{ ['--p-a' as string]: post.author_accent_top, ['--p-b' as string]: post.author_accent_bottom }}
            >
              {post.author_avatar_url ? (
                <img src={post.author_avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                post.author_display_name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold"><NameStyle name={post.author_display_name} style={post.author_name_style as NameStyleData} /></div>
              <div className="text-[11.5px] text-[var(--color-ink-muted)]">@{post.author_username}</div>
            </div>
            {isMine && (
              <div className="flex items-center gap-1">
                {onEdit && (
                  <button onClick={onEdit} className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]" aria-label="Edit">
                    <Pencil size={14} />
                  </button>
                )}
                {onDelete && (
                  <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-red-500/10 hover:text-red-400" aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] md:hidden" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="mb-3.5 text-[15px] leading-relaxed">{renderMarkdown(post.body_rendered, profile?.username)}</div>
          {!post.media_url && extractFirstUrl(post.body_rendered) && (
            <div className="mb-3.5">
              <LinkPreviewCard url={extractFirstUrl(post.body_rendered)!} />
            </div>
          )}
          {post.media_url && (
            <div className="mb-3.5 overflow-hidden rounded-xl border border-[var(--color-hairline)]">
              <img src={post.media_url} alt="" className="max-h-[420px] w-full object-cover" />
            </div>
          )}

          {/* mt-auto pushes this row to the bottom of the post pane — the
              right call on desktop, where the post pane and comments
              pane sit side by side as two independently tall columns
              (md:flex-row below), so anchoring actions to the bottom of
              a fixed-height column looks deliberate. But on mobile these
              two panes stack vertically instead, and mt-auto still tried
              to push this row to the bottom of the *post pane's own
              full height* before the comments pane even begins — for
              any short post (a one-line status with no image), that's a
              large dead gap between the like button and the comments
              section for no visible reason. Scoped to md: only, so
              mobile just gets a plain small top margin instead. */}
          <div className="mt-4 flex items-center gap-4 md:mt-auto md:pt-3">
            <button onClick={onToggleLike} className="group flex items-center gap-1.5" aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}>
              <Heart size={20} strokeWidth={2} className={liked ? 'fill-red-500 text-red-500' : 'text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]'} />
              {post.reaction_count > 0 && (
                <span className={`font-mono text-[12px] ${liked ? 'font-semibold text-red-500' : 'text-[var(--color-ink-muted)]'}`}>{post.reaction_count}</span>
              )}
            </button>
            <button onClick={onShare} className="group flex items-center" aria-label="Share">
              <Share2 size={18} strokeWidth={2} className="text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]" />
            </button>
          </div>
        </div>

        {/* Comments pane */}
        <div className="flex min-h-0 flex-1 flex-col md:w-[42%]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-hairline)] px-4">
            <span className="text-[13px] font-semibold">Comments {post.comment_count > 0 && `(${post.comment_count})`}</span>
            <button onClick={onClose} className="hidden h-7 w-7 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] md:flex" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {commentsLoading && <div className="text-[13px] text-[var(--color-ink-muted)]">Loading comments…</div>}
            {!commentsLoading && comments.length === 0 && (
              <div className="text-[13px] text-[var(--color-ink-muted)]">No comments yet — say something.</div>
            )}
            <div className="space-y-3">
              {topLevel.map((c) => (
                <div key={c.id}>
                  <CommentRow comment={c} postId={post.id} onReply={() => handleReply(c)} />
                  {(repliesByParent.get(c.id) ?? []).length > 0 && (
                    <div className="ml-8 mt-1.5 space-y-2 border-l-2 border-[var(--color-hairline)] pl-3">
                      {(repliesByParent.get(c.id) ?? []).map((r) => (
                        <CommentRow key={r.id} comment={r} postId={post.id} onReply={() => handleReply(c)} isReply />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-[var(--color-hairline)]">
            {replyTarget && (
              <div className="flex items-center justify-between border-b border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-1.5">
                <span className="truncate text-[11.5px] text-[var(--color-ink-muted)]">
                  Replying to <span className="font-semibold text-[var(--color-ink)]">@{replyTarget.author_username}</span>
                </span>
                <button onClick={() => setReplyTarget(null)} className="ml-2 shrink-0 text-[11px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
                  Cancel
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 p-3">
              {/* Used to always render initials here regardless of
                  whether the person actually has an avatar set — every
                  comment row correctly checks author_avatar_url first
                  and only falls back to initials when it's genuinely
                  missing, but this one composer avatar skipped that
                  check entirely, so your own real profile picture never
                  showed here even though it shows everywhere else
                  (comments, feed, DMs). */}
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black presence-fill"
                  style={profile ? { ['--p-a' as string]: profile.accent_color_top, ['--p-b' as string]: profile.accent_color_bottom } : undefined}
                >
                  {profile?.display_name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <input
                ref={inputRef}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder={replyTarget ? `Reply to @${replyTarget.author_username}…` : 'Add a comment…'}
                className="flex-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--presence-default-a)]"
              />
              <button
                onClick={handleSubmit}
                disabled={!commentBody.trim() || submitting}
                className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-black disabled:opacity-40"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
