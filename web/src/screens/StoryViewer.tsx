'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { listActiveStoryGroups, deleteStory } from '../lib/api/stories';
import { useAppStore } from '../store/useAppStore';

const IMAGE_STORY_DURATION_MS = 5000;

export function StoryViewer() {
  const params = useParams<{ username: string }>()!;
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const { data: groups = [] } = useQuery({ queryKey: ['story-groups'], queryFn: listActiveStoryGroups });

  const groupIndex = useMemo(() => groups.findIndex((g) => g.author.username === params.username), [groups, params.username]);
  const group = groupIndex >= 0 ? groups[groupIndex] : undefined;

  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: deleteStory,
    onSuccess: () => goNext(),
  });

  function goNext() {
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex((i) => i + 1);
      setProgress(0);
      return;
    }
    // Last story in this person's group — advance to the next person's
    // group (Instagram's own tray-advance behavior), or close if none.
    const nextGroup = groups[groupIndex + 1];
    if (nextGroup) {
      router.replace(`/stories/${nextGroup.author.username}`);
    } else {
      router.push('/stories');
    }
  }

  function goPrev() {
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
      setProgress(0);
      return;
    }
    const prevGroup = groups[groupIndex - 1];
    if (prevGroup) router.replace(`/stories/${prevGroup.author.username}`);
  }

  useEffect(() => {
    setStoryIndex(0);
    setProgress(0);
  }, [params.username]);

  useEffect(() => {
    if (!group || paused) return;
    const currentStory = group.stories[storyIndex];
    // Video stories run for their own recorded length (capped, same as
    // the 30s recording cap) rather than the fixed image duration —
    // otherwise a 20s video would get cut off at 5s or a 3s clip would
    // sit on a black frame for 2 extra seconds.
    const durationMs =
      currentStory?.media_type === 'video' && currentStory.duration_seconds
        ? currentStory.duration_seconds * 1000
        : IMAGE_STORY_DURATION_MS;
    const start = Date.now() - progress * durationMs;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / durationMs);
      setProgress(pct);
      if (pct >= 1) goNext();
    }, 50);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, storyIndex, paused]);

  if (!group) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-sm text-[var(--color-ink-muted)]">
        No active story for this person.
      </div>
    );
  }

  const currentStory = group.stories[storyIndex];
  const isMine = group.author.id === profile?.id;

  return (
    <div className="relative flex h-full items-center justify-center bg-black">
      <div className="absolute left-0 top-0 z-10 flex w-full gap-1 p-3">
        {group.stories.map((s, i) => (
          <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full bg-white"
              style={{ width: i < storyIndex ? '100%' : i === storyIndex ? `${progress * 100}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      <div className="absolute left-3 top-8 z-10 flex items-center gap-2">
        {group.author.avatar_url ? (
          <img src={group.author.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-[11px] font-bold text-white">
            {group.author.display_name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="text-[13px] font-medium text-white">{group.author.display_name}</span>
      </div>

      <div className="absolute right-3 top-8 z-10 flex items-center gap-2">
        {isMine && (
          <button
            onClick={() => deleteMutation.mutate(currentStory.id)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
            aria-label="Delete story"
          >
            <Trash2 size={16} />
          </button>
        )}
        <button onClick={() => router.push('/stories')} className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <button
        onClick={goPrev}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        className="absolute left-0 top-0 z-[5] flex h-full w-1/3 items-center justify-start pl-2 text-white/0 hover:text-white/60"
        aria-label="Previous story"
      >
        <ChevronLeft size={28} />
      </button>
      <button
        onClick={() => goNext()}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        className="absolute right-0 top-0 z-[5] flex h-full w-1/3 items-center justify-end pr-2 text-white/0 hover:text-white/60"
        aria-label="Next story"
      >
        <ChevronRight size={28} />
      </button>

      {currentStory.media_type === 'video' ? (
        <video
          key={currentStory.id}
          src={currentStory.media_url}
          autoPlay
          playsInline
          muted={false}
          className="max-h-full max-w-full object-contain"
          onEnded={() => goNext()}
        />
      ) : (
        <img src={currentStory.media_url} alt="" className="max-h-full max-w-full object-contain" />
      )}
    </div>
  );
}
