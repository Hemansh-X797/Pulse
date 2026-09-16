'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Share2, VolumeX, Volume2, Plus, X, Play } from 'lucide-react';
import Link from 'next/link';
import { listReels, createReel, deleteReel, toggleReelLike, listReelComments, addReelComment, type Reel, type ReelComment } from '../lib/api/reels';
import { uploadMedia, MediaUploadError } from '../lib/api/media';
import { useAppStore } from '../store/useAppStore';
import { NameStyle, type NameStyleData } from '../components/NameStyle';
import { DecoratedAvatar } from '../components/DecoratedAvatar';
import { renderMarkdown } from '../lib/markdown';

export function Reels() {
  const { data: reels = [], isLoading } = useQuery({ queryKey: ['reels'], queryFn: () => listReels() });
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <div className="relative h-full bg-black">
      {isLoading ? (
        <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-ink-muted)]">Loading reels…</div>
      ) : reels.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <Play size={28} className="text-[var(--color-ink-faint)]" />
          <p className="text-[13.5px] text-[var(--color-ink-muted)]">No reels yet — be the first to post one.</p>
          <button onClick={() => setComposeOpen(true)} className="rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-black">
            Create a reel
          </button>
        </div>
      ) : (
        <div className="h-full snap-y snap-mandatory overflow-y-scroll">
          {reels.map((reel) => (
            <ReelCard key={reel.id} reel={reel} />
          ))}
        </div>
      )}

      <button
        onClick={() => setComposeOpen(true)}
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-transform hover:scale-105"
        aria-label="Create a reel"
      >
        <Plus size={20} />
      </button>

      {composeOpen && <ComposeReelModal onClose={() => setComposeOpen(false)} />}
    </div>
  );
}

function ReelCard({ reel }: { reel: Reel }) {
  const queryClient = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const isMine = profile?.id === reel.author_id;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  // Autoplay only while actually scrolled into view, pause the instant
  // it isn't — a vertical reels feed with several video elements all
  // playing at once would be both a real performance problem (multiple
  // concurrent video decodes) and genuinely unusable (audio from
  // whichever one isn't even on screen). threshold 0.6 means "mostly
  // in view", not just a single visible pixel at the very edge.
  useEffect(() => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el || !video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {
            // Autoplay can still be blocked even when muted, on some
            // mobile browsers until the very first user interaction
            // anywhere on the page — not worth surfacing as an error,
            // the paused-state play button below covers it.
          });
          setPaused(false);
        } else {
          video.pause();
          video.currentTime = 0;
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  }

  const likeMutation = useMutation({
    mutationFn: () => toggleReelLike(reel.id, reel.liked_by_me),
    // Optimistic like — same instant-paint reasoning as everywhere else
    // in this app that touches a reaction/like: a heart tap is exactly
    // the kind of rapid-fire interaction that feels broken if it waits
    // on a network round-trip before showing anything.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['reels'] });
      const previous = queryClient.getQueryData<Reel[]>(['reels']);
      queryClient.setQueryData<Reel[]>(['reels'], (old) =>
        (old ?? []).map((r) =>
          r.id === reel.id ? { ...r, liked_by_me: !r.liked_by_me, like_count: r.like_count + (r.liked_by_me ? -1 : 1) } : r
        )
      );
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(['reels'], context.previous);
    },
  });

  async function handleShare() {
    const url = `${window.location.origin}/reels#${reel.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `${reel.author_display_name} on PalSpace` });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      // user cancelled the native share sheet — not an error
    }
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteReel(reel.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reels'] }),
  });

  return (
    <div ref={containerRef} className="relative flex h-full w-full snap-start snap-always items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={reel.video_url}
        muted={muted}
        loop
        playsInline
        onClick={togglePlay}
        className="h-full w-full object-contain"
      />

      {paused && (
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40">
            <Play size={28} className="ml-1 text-white" fill="white" />
          </span>
        </button>
      )}

      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      {/* Right-side action rail — heart/comment/share stacked, same
          vertical layout every real short-form video product uses so
          they're reachable by thumb without covering the video itself. */}
      <div className="absolute bottom-24 right-3 z-10 flex flex-col items-center gap-5">
        <button onClick={() => likeMutation.mutate()} className="flex flex-col items-center gap-1 text-white">
          <Heart size={26} className={reel.liked_by_me ? 'fill-red-500 text-red-500' : ''} />
          <span className="text-[11px] font-semibold">{reel.like_count}</span>
        </button>
        <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1 text-white">
          <MessageCircle size={25} />
          <span className="text-[11px] font-semibold">{reel.comment_count}</span>
        </button>
        <button onClick={handleShare} className="flex flex-col items-center gap-1 text-white">
          <Share2 size={24} />
        </button>
        {isMine && (
          <button
            onClick={() => window.confirm('Delete this reel?') && deleteMutation.mutate()}
            className="flex flex-col items-center gap-1 text-white/70 hover:text-red-400"
          >
            <X size={22} />
          </button>
        )}
      </div>

      {/* Bottom-left author + caption overlay */}
      <div className="absolute bottom-6 left-4 right-20 z-10 text-white">
        <Link href={`/${reel.author_username}`} className="mb-1.5 flex items-center gap-2">
          <DecoratedAvatar decorationId={reel.author_avatar_decoration} size={30}>
            {reel.author_avatar_url ? (
              <img src={reel.author_avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center rounded-full text-[11px] font-bold text-black presence-fill"
                style={{ ['--p-a' as string]: reel.author_accent_top, ['--p-b' as string]: reel.author_accent_bottom }}
              >
                {reel.author_display_name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </DecoratedAvatar>
          <span className="text-[13.5px] font-semibold drop-shadow">
            <NameStyle name={reel.author_display_name} style={reel.author_name_style as NameStyleData} />
          </span>
        </Link>
        {reel.caption_rendered && <p className="text-[13px] leading-snug drop-shadow">{renderMarkdown(reel.caption_rendered)}</p>}
      </div>

      {commentsOpen && <ReelCommentsSheet reel={reel} onClose={() => setCommentsOpen(false)} />}
    </div>
  );
}

function ReelCommentsSheet({ reel, onClose }: { reel: Reel; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['reel-comments', reel.id],
    queryFn: () => listReelComments(reel.id),
  });

  const submitMutation = useMutation({
    mutationFn: (text: string) => addReelComment(reel.id, text),
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['reel-comments', reel.id] });
      queryClient.invalidateQueries({ queryKey: ['reels'] });
    },
  });

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button className="flex-1" onClick={onClose} aria-label="Close comments" />
      <div className="max-h-[65%] rounded-t-2xl bg-[var(--color-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13.5px] font-semibold text-[var(--color-ink)]">{reel.comment_count} comments</h3>
          <button onClick={onClose} className="text-[var(--color-ink-muted)]">
            <X size={18} />
          </button>
        </div>
        <div className="mb-3 max-h-[50vh] space-y-3 overflow-y-auto">
          {isLoading && <p className="text-[12.5px] text-[var(--color-ink-faint)]">Loading…</p>}
          {!isLoading && comments.length === 0 && <p className="text-[12.5px] text-[var(--color-ink-faint)]">No comments yet.</p>}
          {comments.map((c: ReelComment) => (
            <div key={c.id} className="flex items-start gap-2">
              <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--color-surface-raised)]">
                {c.author_avatar_url && <img src={c.author_avatar_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="text-[13px] text-[var(--color-ink)]">
                <span className="mr-1.5 font-semibold">{c.author_display_name}</span>
                {renderMarkdown(c.body_rendered)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && body.trim() && submitMutation.mutate(body)}
            placeholder="Add a comment…"
            className="flex-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3.5 py-2 text-[13px] outline-none focus:border-[var(--presence-default-a)]"
          />
          <button
            onClick={() => body.trim() && submitMutation.mutate(body)}
            disabled={!body.trim()}
            className="rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-black disabled:opacity-40"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

function ComposeReelModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePickFile(f: File) {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError(null);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('pick a video first');
      const videoUrl = await uploadMedia(file, profile?.id);
      return createReel(videoUrl, caption);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reels'] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Failed to post reel.'),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-[var(--color-ink)]">New reel</h2>
          <button onClick={onClose} className="text-[var(--color-ink-muted)]">
            <X size={18} />
          </button>
        </div>

        {error && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>}

        {previewUrl ? (
          <div className="relative mb-3 aspect-[9/16] max-h-64 overflow-hidden rounded-lg bg-black">
            <video src={previewUrl} className="h-full w-full object-contain" controls muted />
            <button
              onClick={() => {
                setFile(null);
                setPreviewUrl(null);
              }}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mb-3 flex aspect-[9/16] max-h-64 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-hairline-strong)] text-[var(--color-ink-muted)]"
          >
            <Plus size={22} />
            <span className="text-[12.5px]">Choose a video (MP4/WebM, up to 40MB)</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePickFile(f);
            e.target.value = '';
          }}
        />

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption…"
          rows={2}
          className="mb-4 w-full resize-none rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2 text-[13.5px] text-[var(--color-ink)] outline-none focus:border-[var(--presence-default-a)]"
        />

        <button
          onClick={async () => {
            setUploading(true);
            try {
              await createMutation.mutateAsync();
            } catch (e) {
              if (e instanceof MediaUploadError) setError(e.message);
            } finally {
              setUploading(false);
            }
          }}
          disabled={!file || uploading}
          className="w-full rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black disabled:opacity-40"
        >
          {uploading ? 'Posting…' : 'Post reel'}
        </button>
      </div>
    </div>
  );
}
