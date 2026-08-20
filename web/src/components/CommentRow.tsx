'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { editComment, deleteComment } from '../lib/api/feed';
import { renderMarkdown } from '../lib/markdown';
import { useAppStore } from '../store/useAppStore';

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export function Avatar({
  url,
  name,
  size = 34,
  accentTop,
  accentBottom,
}: {
  url?: string;
  name: string;
  size?: number;
  accentTop?: string;
  accentBottom?: string;
}) {
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
      style={{ width: size, height: size, fontSize: size * 0.38, ['--p-a' as string]: accentTop, ['--p-b' as string]: accentBottom }}
      className="flex shrink-0 items-center justify-center rounded-full presence-fill font-bold text-black"
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function CommentRow({
  comment,
  postId,
}: {
  comment: {
    id: number;
    author_id: string;
    author_username: string;
    author_display_name: string;
    author_avatar_url: string;
    author_accent_top: string;
    author_accent_bottom: string;
    body_rendered: string;
    edited_at: string | null;
    created_at: string;
  };
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
            <button onClick={() => editMutation.mutate(value)} className="text-[11px] font-semibold text-[var(--color-ink)]">
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
            <span className="text-[10.5px] text-[var(--color-ink-faint)]">
              @{comment.author_username} · {timeAgo(comment.created_at)}
              {comment.edited_at && ' · edited'}
            </span>
            <div className="text-[13.5px] leading-relaxed">{renderMarkdown(comment.body_rendered)}</div>
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
