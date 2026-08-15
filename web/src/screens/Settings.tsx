'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, X, Camera, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadMedia, MediaUploadError } from '../lib/api/media';
import { getMyProfile, updateProfile } from '../lib/api/profile';
import { useAppStore } from '../store/useAppStore';

const ACCENT_PRESETS: [string, string][] = [
  ['#2dd4bf', '#a78bfa'], // PalSpace default — teal → violet
  ['#f472b6', '#818cf8'],
  ['#fb923c', '#f43f5e'],
  ['#34d399', '#22d3ee'],
  ['#facc15', '#fb923c'],
  ['#a78bfa', '#f472b6'],
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-ink-faint)]">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-2 text-[13.5px] text-[var(--color-ink)] outline-none focus:border-[var(--presence-default-a)]';

export function Settings() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const storeProfile = useAppStore((s) => s.profile);
  const setStoreProfile = useAppStore((s) => s.setProfile);
  const reset = useAppStore((s) => s.reset);

  const { data: profile } = useQuery({
    queryKey: ['my-profile'],
    queryFn: getMyProfile,
    initialData: storeProfile ?? undefined,
  });

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? '');
  const [statusText, setStatusText] = useState(profile?.status_text ?? '');
  const [accentTop, setAccentTop] = useState(profile?.accent_color_top ?? ACCENT_PRESETS[0][0]);
  const [accentBottom, setAccentBottom] = useState(profile?.accent_color_bottom ?? ACCENT_PRESETS[0][1]);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [bannerUrl, setBannerUrl] = useState(profile?.banner_url ?? '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfile({
        display_name: displayName.trim() || profile?.display_name || '',
        bio: bio.trim(),
        pronouns: pronouns.trim(),
        status_text: statusText.trim(),
        accent_color_top: accentTop,
        accent_color_bottom: accentBottom,
        avatar_url: avatarUrl,
        banner_url: bannerUrl,
      }),
    onSuccess: (updated) => {
      setStoreProfile(updated);
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    },
  });

  async function handleImageUpload(file: File, kind: 'avatar' | 'banner') {
    setUploadError(null);
    kind === 'avatar' ? setAvatarUploading(true) : setBannerUploading(true);
    try {
      const url = await uploadMedia(file);
      kind === 'avatar' ? setAvatarUrl(url) : setBannerUrl(url);
    } catch (e) {
      setUploadError(e instanceof MediaUploadError || e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      kind === 'avatar' ? setAvatarUploading(false) : setBannerUploading(false);
    }
  }

  async function handleConfirmLogout() {
    await supabase.auth.signOut();
    reset();
    router.push('/login');
  }

  const dirty =
    profile &&
    (displayName !== profile.display_name ||
      bio !== profile.bio ||
      pronouns !== profile.pronouns ||
      statusText !== profile.status_text ||
      accentTop !== profile.accent_color_top ||
      accentBottom !== profile.accent_color_bottom ||
      avatarUrl !== profile.avatar_url ||
      bannerUrl !== profile.banner_url);

  return (
    <div className="mx-auto h-full max-w-xl overflow-y-auto px-8 py-9">
      <h1 className="mb-6 font-serif text-2xl font-semibold">Settings</h1>

      <section className="mb-6 overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)]">
        {/* Banner */}
        <div
          className="group relative h-28 cursor-pointer bg-[var(--color-surface-raised)]"
          style={
            bannerUrl
              ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { ['--p-a' as string]: accentTop, ['--p-b' as string]: accentBottom, background: 'linear-gradient(150deg, var(--p-a), var(--p-b))' }
          }
          onClick={() => bannerInputRef.current?.click()}
        >
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
            {bannerUploading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                <Camera size={14} /> Change banner
              </span>
            )}
          </div>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImageUpload(f, 'banner');
              e.target.value = '';
            }}
          />
        </div>

        <div className="px-5 pb-5">
          {/* Avatar, overlapping the banner */}
          <div
            className="group relative -mt-8 mb-3 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border-4 border-[var(--color-surface)] text-lg font-bold text-black"
            style={
              avatarUrl
                ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { ['--p-a' as string]: accentTop, ['--p-b' as string]: accentBottom, background: 'linear-gradient(150deg, var(--p-a), var(--p-b))' }
            }
            onClick={() => avatarInputRef.current?.click()}
          >
            {!avatarUrl && (displayName || '?').slice(0, 2).toUpperCase()}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100">
              {avatarUploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Camera size={14} className="text-white" />
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageUpload(f, 'avatar');
                e.target.value = '';
              }}
            />
          </div>

          {uploadError && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
              {uploadError}
              <button onClick={() => setUploadError(null)} className="ml-3 text-red-400 hover:text-white" aria-label="Dismiss">
                <X size={13} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4">
            <Field label="Display name">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className={inputClass} />
            </Field>
            <Field label="Pronouns">
              <input value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={30} placeholder="they/them" className={inputClass} />
            </Field>
          </div>

          <Field label="Username" hint="Not editable yet.">
            <input value={profile ? `@${profile.username}` : ''} disabled className={`${inputClass} cursor-not-allowed opacity-60`} />
          </Field>

          <Field label="Status">
            <input value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={80} placeholder="What are you up to?" className={inputClass} />
          </Field>

          <Field label="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <Field label="Accent colors" hint="Your gradient — shows on your avatar, messages, and posts across PalSpace.">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map(([a, b]) => {
                const active = accentTop === a && accentBottom === b;
                return (
                  <button
                    key={`${a}-${b}`}
                    onClick={() => {
                      setAccentTop(a);
                      setAccentBottom(b);
                    }}
                    className="relative h-8 w-8 shrink-0 rounded-full"
                    style={{ background: `linear-gradient(150deg, ${a}, ${b})` }}
                    aria-label={`Use gradient ${a} to ${b}`}
                    aria-pressed={active}
                  >
                    {active && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/25">
                        <Check size={14} className="text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="flex items-center gap-1.5 pl-1">
                <input
                  type="color"
                  value={accentTop}
                  onChange={(e) => setAccentTop(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded-full border border-[var(--color-hairline)] bg-transparent p-0"
                  aria-label="Custom top color"
                />
                <input
                  type="color"
                  value={accentBottom}
                  onChange={(e) => setAccentBottom(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded-full border border-[var(--color-hairline)] bg-transparent p-0"
                  aria-label="Custom bottom color"
                />
              </div>
            </div>
          </Field>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            className="mt-2 rounded-full bg-[var(--color-ink)] px-5 py-2 text-[13px] font-semibold text-black disabled:opacity-40"
          >
            {saveMutation.isPending ? 'Saving…' : saveMutation.isSuccess && !dirty ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5">
        <h2 className="mb-1 text-sm font-semibold text-red-300">Account</h2>
        <p className="mb-4 text-[13px] text-[var(--color-ink-muted)]">Sign out of PalSpace on this device.</p>

        {!confirmingLogout ? (
          <button
            onClick={() => setConfirmingLogout(true)}
            className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-[13px] font-medium text-red-300 hover:bg-red-500/20"
          >
            <LogOut size={14} /> Log out
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <span className="text-[13px] text-red-200">Log out of PalSpace?</span>
            <button
              onClick={handleConfirmLogout}
              className="rounded-full bg-red-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-red-400"
            >
              Yes, log out
            </button>
            <button
              onClick={() => setConfirmingLogout(false)}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
