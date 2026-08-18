'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { listActiveStoryGroups, createStory } from '../lib/api/stories';
import { uploadMedia } from '../lib/api/media';
import { useAppStore } from '../store/useAppStore';

export function Stories() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: groups = [], isLoading } = useQuery({ queryKey: ['story-groups'], queryFn: listActiveStoryGroups });
  const myGroup = groups.find((g) => g.author.id === profile?.id);
  const otherGroups = groups.filter((g) => g.author.id !== profile?.id);

  const createMutation = useMutation({
    mutationFn: createStory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['story-groups'] }),
  });

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      // Pass the already-hydrated session's user id (see uploadMedia's
      // knownUserId param) instead of trusting a fresh getUser() call —
      // this was the fix for the "you must be signed in to upload
      // media" bug reported on this page specifically.
      const url = await uploadMedia(file, session?.user.id);
      await createMutation.mutateAsync(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[62px] shrink-0 items-baseline gap-2.5 border-b border-[var(--color-hairline)] px-7">
        <h2 className="font-serif text-lg font-semibold">Stories</h2>
        <span className="text-xs text-[var(--color-ink-muted)]">visible to friends for 24 hours</span>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {error && (
          <div className="mb-4 flex max-w-md items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
            {error}
            <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-white" aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-5">
          {/* Your own ring — always first, shows a + when you have none yet */}
          <button
            onClick={() => (myGroup ? router.push(`/stories/${profile?.username}`) : fileInputRef.current?.click())}
            className="flex w-20 flex-col items-center gap-1.5"
          >
            <div
              className={`relative flex h-16 w-16 items-center justify-center rounded-full p-[2.5px] ${myGroup ? 'presence-fill' : 'bg-[var(--color-hairline-strong)]'}`}
              style={
                myGroup
                  ? { ['--p-a' as string]: profile?.accent_color_top, ['--p-b' as string]: profile?.accent_color_bottom }
                  : undefined
              }
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-void)] p-0.5">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-sm font-bold">
                    {profile?.display_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              {!myGroup && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--presence-default-a)] text-black">
                  {uploading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" /> : <Plus size={12} />}
                </span>
              )}
            </div>
            <span className="text-[11.5px] text-[var(--color-ink-muted)]">{myGroup ? 'Your story' : 'Add story'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = '';
              }}
            />
          </button>

          {otherGroups.map((g) => (
            <button key={g.author.id} onClick={() => router.push(`/stories/${g.author.username}`)} className="flex w-20 flex-col items-center gap-1.5">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full p-[2.5px] presence-fill"
                style={{ ['--p-a' as string]: g.author.accent_color_top, ['--p-b' as string]: g.author.accent_color_bottom }}
              >
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-void)] p-0.5">
                  {g.author.avatar_url ? (
                    <img src={g.author.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-sm font-bold">
                      {g.author.display_name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <span className="truncate text-[11.5px] text-[var(--color-ink-muted)]">{g.author.display_name}</span>
            </button>
          ))}
        </div>

        {!isLoading && groups.length === 0 && (
          <p className="mt-8 text-[13px] text-[var(--color-ink-muted)]">
            No active stories. Add one, or check back once your friends post something.
          </p>
        )}
      </div>
    </div>
  );
}
