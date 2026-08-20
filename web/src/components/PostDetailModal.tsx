'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Heart, Share2, Pencil, Trash2 } from 'lucide-react';
import { renderMarkdown } from '../lib/markdown';
import { extractFirstUrl, LinkPreviewCard } from '../components/shared/LinkPreviewCard';
import { useAppStore } from '../store/useAppStore';
import { CommentRow } from '../components/CommentRow';
import type { FeedItem, PostComment } from '../lib/database.types';

type FeedComment = PostComment & {
  author_username: string;
  author_display_name: string;
  author_avatar_url: string;
  author_accent_top: string;
  author_accent_bottom: string;
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
  onSubmitComment: (body: string) => Promise<void>;
  isMine: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const profile = useAppStore((s) => s.profile);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      await onSubmitComment(trimmed);
      setCommentBody('');
    } finally {
      setSubmitting(false);
    }
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
              <div className="text-[13.5px] font-semibold">{post.author_display_name}</div>
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

          <div className="mb-3.5 text-[15px] leading-relaxed">{renderMarkdown(post.body_rendered)}</div>
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

          <div className="mt-auto flex items-center gap-4 pt-3">
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
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black presence-fill"
                    style={{ ['--p-a' as string]: c.author_accent_top, ['--p-b' as string]: c.author_accent_bottom }}
                  >
                    {c.author_avatar_url ? (
                      <img src={c.author_avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      c.author_display_name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px]">
                      <span className="font-semibold">{c.author_display_name}</span>{' '}
                      <span className="text-[10.5px] text-[var(--color-ink-faint)]">{c.author_username}</span>
                    </div>
                    <div className="text-[13px] leading-snug">{renderMarkdown(c.body_rendered)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--color-hairline)] p-3">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black presence-fill"
              style={profile ? { ['--p-a' as string]: profile.accent_color_top, ['--p-b' as string]: profile.accent_color_bottom } : undefined}
            >
              {profile?.display_name.slice(0, 2).toUpperCase()}
            </div>
            <input
              ref={inputRef}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Add a comment…"
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
  );
}
