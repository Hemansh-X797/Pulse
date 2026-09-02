'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Camera, Sparkles } from 'lucide-react';
import { updateProfile, getMyProfile } from '../lib/api/profile';
import { uploadMedia, MediaUploadError } from '../lib/api/media';
import { listPublicSpaces, joinPublicSpace } from '../lib/api/spaces';
import { useAppStore } from '../store/useAppStore';
import { setTheme, type ThemeName } from '../hooks/useTheme';
import type { Profile, Space } from '../lib/database.types';

const THEME_SWATCHES: { name: ThemeName; a: string; b: string; corners: string }[] = [
  { name: 'bespoke', a: '#0a0a0a', b: '#161616', corners: '' },
  { name: 'classic', a: '#1a1a22', b: '#212129', corners: 'rounded-full' },
  { name: 'sunroom', a: '#fdfaf3', b: '#c96f4a', corners: 'rounded-full' },
  { name: 'signal', a: '#050806', b: '#3ddc63', corners: '' },
];

const INTEREST_OPTIONS = [
  'gaming', 'art', 'music', 'coding', 'anime', 'study', 'sports', 'movies', 'books', 'food', 'photography', 'fitness',
];

export function Onboarding() {
  const router = useRouter();
  const setStoreProfile = useAppStore((s) => s.setProfile);
  const session = useAppStore((s) => s.session);

  const [step, setStep] = useState<'dob' | 'interests' | 'avatar' | 'theme' | 'spaces' | 'loading'>('loading');
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [dob, setDob] = useState('');
  const [dobError, setDobError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>('bespoke');
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
        setStep('dob');
      })
      .catch(() => router.replace('/login'));
    return () => {
      cancelled = true;
    };
  }, [router]);

  function toggleInterest(tag: string) {
    setSelectedInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleDobSubmit() {
    setDobError(null);
    if (!dob) {
      setDobError('Enter your date of birth.');
      return;
    }
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      setDobError('That date doesn\u2019t look right.');
      return;
    }
    const ageMs = Date.now() - birthDate.getTime();
    const age = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    // Matches the minimum age already stated in /terms — keeping the
    // two consistent rather than enforcing one number in the legal
    // page and a different one here.
    if (age < 13) {
      setDobError('You must be at least 13 years old to use PalSpace.');
      return;
    }
    try {
      await updateProfile({ date_of_birth: dob });
      setStep('interests');
    } catch (e) {
      setDobError(e instanceof Error ? e.message : 'Could not save — try again.');
    }
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

  async function goToThemeStep() {
    setError(null);
    try {
      if (avatarUrl && avatarUrl !== profile?.avatar_url) {
        await updateProfile({ avatar_url: avatarUrl });
      }
      await updateProfile({ interests: selectedInterests });
      setStep('theme');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  async function goToSpacesStep() {
    setError(null);
    try {
      setTheme(selectedTheme);
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
          {(['dob', 'interests', 'avatar', 'theme', 'spaces'] as const).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                (['dob', 'interests', 'avatar', 'theme', 'spaces'] as const).indexOf(step as never) >= (['dob', 'interests', 'avatar', 'theme', 'spaces'] as const).indexOf(s)
                  ? 'presence-fill'
                  : 'bg-[var(--color-hairline)]'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>
        )}

        {step === 'dob' && (
          <>
            <h1 className="mb-1 font-serif text-2xl font-semibold">When&apos;s your birthday?</h1>
            <p className="mb-5 text-[13px] text-[var(--color-ink-muted)]">Never shown to other users — just used to confirm you meet the minimum age.</p>
            {dobError && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{dobError}</div>
            )}
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="mb-6 w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--presence-default-a)]"
            />
            <button onClick={handleDobSubmit} className="w-full rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black">
              Continue
            </button>
          </>
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

            <button onClick={goToThemeStep} className="w-full rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black">
              Continue
            </button>
          </>
        )}

        {step === 'theme' && (
          <>
            <h1 className="mb-1 font-serif text-2xl font-semibold">Pick a look</h1>
            <p className="mb-5 text-[13px] text-[var(--color-ink-muted)]">You can change this anytime in Settings → Appearance.</p>
            <div className="mb-6 grid grid-cols-2 gap-2.5">
              {THEME_SWATCHES.map(({ name, a, b, corners }) => (
                <button
                  key={name}
                  onClick={() => setSelectedTheme(name)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selectedTheme === name ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                  }`}
                >
                  <div className="mb-1.5 flex gap-1">
                    <span className={`h-4 w-4 border border-[var(--color-hairline-strong)] ${corners}`} style={{ background: a }} />
                    <span className={`h-4 w-4 border border-[var(--color-hairline-strong)] ${corners}`} style={{ background: b }} />
                  </div>
                  <div className="flex items-center gap-1 text-[13px] font-medium capitalize">
                    {name}
                    {name === 'bespoke' && <Sparkles size={11} className="text-[var(--presence-default-a)]" />}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={goToSpacesStep}
              className="w-full rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black"
            >
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
