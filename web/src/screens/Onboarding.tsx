'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Camera } from 'lucide-react';
import { updateProfile, getMyProfile } from '../lib/api/profile';
import { uploadMedia, MediaUploadError } from '../lib/api/media';
import { listPublicSpaces, joinPublicSpace } from '../lib/api/spaces';
import { useAppStore } from '../store/useAppStore';
import type { Profile, Space } from '../lib/database.types';

const INTEREST_OPTIONS = [
  'gaming', 'art', 'music', 'coding', 'anime', 'study', 'sports', 'movies', 'books', 'food', 'photography', 'fitness',
];

export function Onboarding() {
  const router = useRouter();
  const setStoreProfile = useAppStore((s) => s.setProfile);
  const session = useAppStore((s) => s.session);

  const [step, setStep] = useState<'interests' | 'avatar' | 'spaces' | 'loading'>('loading');
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [suggestedSpaces, setSuggestedSpaces] = useState<Space[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (cancelled) return;
        if (p.onboarding_completed) {
          router.replace('/home');
          return;
        }
        setProfileState(p);
        setAvatarUrl(p.avatar_url);
        setStep('interests');
      })
      .catch(() => router.replace('/login'));
    return () => {
      cancelled = true;
    };
  }, [router]);

  function toggleInterest(tag: string) {
    setSelectedInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleAvatarUpload(file: File) {
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const url = await uploadMedia(file, session?.user.id);
      setAvatarUrl(url);
    } catch (e) {
      setAvatarError(e instanceof MediaUploadError ? e.message : 'Upload failed.');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function goToSpacesStep() {
    setError(null);
    try {
      if (avatarUrl && avatarUrl !== profile?.avatar_url) {
        await updateProfile({ avatar_url: avatarUrl });
      }
      await updateProfile({ interests: selectedInterests });
      const spaces = await listPublicSpaces(selectedInterests);
      setSuggestedSpaces(spaces.slice(0, 9));
      setStep('spaces');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  async function handleJoin(spaceId: string) {
    try {
      await joinPublicSpace(spaceId);
      setJoinedIds((prev) => new Set(prev).add(spaceId));
    } catch {
      // A double-click racing itself is the only realistic failure here
      // (already joined) — not worth a visible error for that.
    }
  }

  async function finish() {
    setFinishing(true);
    try {
      const updated = await updateProfile({ onboarding_completed: true });
      setStoreProfile(updated);
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish onboarding.');
      setFinishing(false);
    }
  }

  if (step === 'loading') {
    return <div className="flex h-screen w-full items-center justify-center bg-[var(--color-void)] text-[var(--color-ink-muted)]">Loading…</div>;
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--color-void)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-1.5">
          {(['interests', 'avatar', 'spaces'] as const).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                (['interests', 'avatar', 'spaces'] as const).indexOf(step) >= (['interests', 'avatar', 'spaces'] as const).indexOf(s)
                  ? 'presence-fill'
                  : 'bg-[var(--color-hairline)]'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>
        )}

        {step === 'interests' && (
          <>
            <h1 className="mb-1 font-serif text-2xl font-semibold">What are you into?</h1>
            <p className="mb-5 text-[13px] text-[var(--color-ink-muted)]">
              Pick a few — this shapes what spaces we suggest you next. You can change these anytime in Settings.
            </p>
            <div className="mb-6 flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleInterest(tag)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                    selectedInterests.includes(tag)
                      ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/15 text-[var(--presence-default-a)]'
                      : 'border-[var(--color-hairline)] text-[var(--color-ink-muted)] hover:border-[var(--color-hairline-strong)]'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep('avatar')}
              className="w-full rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black"
            >
              Continue
            </button>
          </>
        )}

        {step === 'avatar' && (
          <>
            <h1 className="mb-1 font-serif text-2xl font-semibold">Add a profile picture</h1>
            <p className="mb-5 text-[13px] text-[var(--color-ink-muted)]">Optional — you can skip this and add one later in Settings.</p>

            {avatarError && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{avatarError}</div>
            )}

            <div className="mb-6 flex justify-center">
              <label className="group relative flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-[var(--color-hairline-strong)] bg-[var(--color-surface-raised)] hover:border-[var(--presence-default-a)]">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <Camera size={22} className="text-[var(--color-ink-faint)]" />
                )}
                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAvatarUpload(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <button onClick={goToSpacesStep} className="w-full rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black">
              Continue
            </button>
          </>
        )}

        {step === 'spaces' && (
          <>
            <h1 className="mb-1 font-serif text-2xl font-semibold">Join a few spaces</h1>
            <p className="mb-5 text-[13px] text-[var(--color-ink-muted)]">
              Public spaces picked to match your interests. Optional — you can always find more later in Discover.
            </p>

            {suggestedSpaces.length === 0 ? (
              <p className="mb-6 text-[13px] text-[var(--color-ink-faint)]">No public spaces yet — be the first to create one once you're in.</p>
            ) : (
              <div className="mb-6 grid grid-cols-3 gap-2.5">
                {suggestedSpaces.map((s) => {
                  const joined = joinedIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => (joined ? undefined : handleJoin(s.id))}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors ${
                        joined ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                      }`}
                    >
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold text-black presence-fill"
                        style={{ ['--p-a' as string]: s.accent_color_top, ['--p-b' as string]: s.accent_color_bottom }}
                      >
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="line-clamp-1 text-center text-[11px] font-medium">{s.name}</span>
                      {joined && <Check size={11} className="text-[var(--presence-default-a)]" />}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={finish}
              disabled={finishing}
              className="w-full rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black disabled:opacity-60"
            >
              {finishing ? 'Finishing…' : 'Done — take me to PalSpace'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
