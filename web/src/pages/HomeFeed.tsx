'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Flame, Heart, ImagePlus } from 'lucide-react';
import { listFeed, createPost, reactToPost, listComments, addComment } from '../lib/api/feed';
import { uploadMedia } from '../lib/api/media';
import type { FeedItem } from '../lib/database.types';

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function HomeFeed() {
  const queryClient = useQueryClient();
  const { data: posts = [] } = useQuery({ queryKey: ['feed'], queryFn: () => listFeed() });

  const [body, setBody] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const postMutation = useMutation({
    mutationFn: () => createPost(body, pendingImage ?? undefined),
    onSuccess: () => {
      setBody('');
      setPendingImage(null);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  async function handleAttach(file: File) {
    const url = await uploadMedia(file);
    setPendingImage(url);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-baseline gap-2.5 border-b border-white/[0.07] px-7">
        <h2 className="font-serif text-lg font-semibold">Feed</h2>
        <span className="text-xs text-neutral-500">posts from everyone on PalSpace</span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto px-7 py-7">
        <div className="w-full max-w-[560px] rounded-2xl border border-white/[0.07] bg-neutral-900 p-4.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's happening? Try :fire: :rocket: :100:"
            className="min-h-[46px] w-full resize-none bg-transparent text-sm text-white placeholder-neutral-500 outline-none"
          />
          {pendingImage && (
            <div className="relative mt-2 inline-block">
              <img src={pendingImage} alt="" className="max-h-36 rounded-lg border border-white/10" />
              <button
                onClick={() => setPendingImage(null)}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-xs text-white"
              >
                ×
              </button>
            </div>
          )}
          <div className="mt-2.5 flex items-center justify-between">
            <label className="flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-full border border-white/[0.07] bg-neutral-800 text-neutral-400 hover:text-white">
              <ImagePlus size={15} />
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAttach(file);
                }}
              />
            </label>
            <button
              onClick={() => postMutation.mutate()}
              disabled={!body.trim()}
              className="rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-black disabled:opacity-40"
            >
              Post
            </button>
          </div>
        </div>

        {posts.length === 0 && <div className="mt-16 text-[13px] text-neutral-500">No posts yet — be the first.</div>}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}

function PostCard({ post }: { post: FeedItem }) {
  const queryClient = useQueryClient();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentBody, setCommentBody] = useState('');

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', post.id],
    queryFn: () => listComments(post.id),
    enabled: commentsOpen,
  });

  const reactMutation = useMutation({
    mutationFn: (emoji: string) => reactToPost(post.id, emoji),
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

  const initials = post.author_display_name.slice(0, 2).toUpperCase();

  return (
    <div className="w-full max-w-[560px] rounded-2xl border border-white/[0.07] bg-neutral-900 p-5 transition-colors hover:border-white/[0.13]">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-pink-400 text-xs font-bold text-black">
          {initials}
        </div>
        <div>
          <div className="text-[13.5px] font-semibold">{post.author_display_name}</div>
          <div className="text-[11.5px] text-neutral-500">
            @{post.author_username} · {timeAgo(post.created_at)}
          </div>
        </div>
      </div>
      <div className="mb-3.5 whitespace-pre-wrap text-[15px] leading-relaxed">{post.body_rendered}</div>
      {post.media_url && (
        <div className="-mt-1 mb-3.5 overflow-hidden rounded-xl border border-white/[0.07]">
          <img src={post.media_url} alt="" className="max-h-[480px] w-full object-cover" />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => reactMutation.mutate('🔥')}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.07] bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
        >
          <Flame size={13} />
        </button>
        <button
          onClick={() => reactMutation.mutate('❤️')}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.07] bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
        >
          <Heart size={13} />
        </button>
        <button
          onClick={() => reactMutation.mutate('💯')}
          className="flex h-8 items-center justify-center rounded-full border border-white/[0.07] bg-neutral-800 px-2.5 font-mono text-[10.5px] text-neutral-400 hover:bg-neutral-700 hover:text-white"
        >
          100
        </button>
        <button
          onClick={() => setCommentsOpen((v) => !v)}
          className="ml-auto font-mono text-[11.5px] text-neutral-500 hover:text-white"
        >
          {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}
        </button>
      </div>

      {commentsOpen && (
        <div className="mt-3.5 border-t border-white/[0.07] pt-3">
          {comments.length === 0 && <div className="mb-2 text-[13px] text-neutral-500">No comments yet.</div>}
          {comments.map((c) => (
            <div key={c.id} className="mb-2 text-[13px] text-neutral-400">
              <b className="font-semibold text-white">{c.author_username}</b> {c.body_rendered}
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commentMutation.mutate()}
              placeholder="Write a comment..."
              className="flex-1 rounded-full border border-white/[0.07] bg-neutral-800 px-3.5 py-2 text-xs text-white placeholder-neutral-500 outline-none"
            />
            <button
              onClick={() => commentMutation.mutate()}
              className="rounded-full bg-neutral-800 px-3.5 py-2 text-xs text-white"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
