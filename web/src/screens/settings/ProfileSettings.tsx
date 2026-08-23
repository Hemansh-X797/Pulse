'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, X, Sparkles } from 'lucide-react';
import { uploadMedia, MediaUploadError } from '../../lib/api/media';
import { getMyProfile, updateProfile } from '../../lib/api/profile';
import { useAppStore } from '../../store/useAppStore';
import { Field, inputClass } from './shared';
import { CropModal } from '../../components/settings/CropModal';
import { NameStyle, type NameStyleData } from '../../components/NameStyle';
import { NameStyleModal } from '../../components/NameStyleModal';
import { NAMEPLATES, nameplateSrc } from '../../lib/nameplates';
import { ProfilePreviewCard } from '../../components/ProfilePreviewCard';

const ACCENT_PRESETS: [string, string][] = [
  ['#2dd4bf', '#a78bfa'], // PalSpace default — teal → violet
  ['#f472b6', '#818cf8'],
  ['#fb923c', '#f43f5e'],
  ['#34d399', '#22d3ee'],
  ['#facc15', '#fb923c'],
  ['#a78bfa', '#f472b6'],
];

export function ProfileSettings() {
  const queryClient = useQueryClient();
  const storeProfile = useAppStore((s) => s.profile);
  const setStoreProfile = useAppStore((s) => s.setProfile);
  const session = useAppStore((s) => s.session);

  const { data: profile } = useQuery({ queryKey: ['my-profile'], queryFn: getMyProfile, initialData: storeProfile ?? undefined });

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [nameStyleOpen, setNameStyleOpen] = useState(false);
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
  const [cropTarget, setCropTarget] = useState<{ file: File; kind: 'avatar' | 'banner' } | null>(null);
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
    // File-select opens the crop modal first now (see CropModal) rather
    // than uploading whatever aspect ratio the original file happened to
    // be — this function now receives an already-cropped Blob from
    // handleCropApply below, not the raw file-picker File.
    setUploadError(null);
    kind === 'avatar' ? setAvatarUploading(true) : setBannerUploading(true);
    try {
      const url = await uploadMedia(file, session?.user.id);
      kind === 'avatar' ? setAvatarUrl(url) : setBannerUrl(url);
    } catch (e) {
      setUploadError(e instanceof MediaUploadError || e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      kind === 'avatar' ? setAvatarUploading(false) : setBannerUploading(false);
    }
  }

  function handleCropApply(blob: Blob) {
    if (!cropTarget) return;
    const croppedFile = new File([blob], `${cropTarget.kind}.png`, { type: 'image/png' });
    setCropTarget(null);
    handleImageUpload(croppedFile, cropTarget.kind);
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
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
    <div className="min-w-0 flex-1">
      <h1 className="mb-6 font-serif text-2xl font-semibold">Profile</h1>

      <section className="overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)]">
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
              if (f) setCropTarget({ file: f, kind: 'banner' });
              e.target.value = '';
            }}
          />
        </div>

        <div className="px-5 pb-5">
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
                if (f) setCropTarget({ file: f, kind: 'avatar' });
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

          <button
            onClick={() => setNameStyleOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-[var(--color-hairline)] px-3.5 py-2.5 text-left hover:border-[var(--color-hairline-strong)]"
          >
            <div>
              <div className="flex items-center gap-1.5 text-[13px] font-medium">
                <Sparkles size={13} className="text-[var(--presence-default-a)]" />
                Display name style
              </div>
              <div className="mt-0.5 text-[16px] font-bold">
                <NameStyle name={displayName || profile?.display_name || 'YourName'} style={profile?.name_style as NameStyleData} />
              </div>
            </div>
            <span className="text-[11px] text-[var(--color-ink-muted)]">Edit</span>
          </button>

          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">
              Nameplate <span className="normal-case text-[var(--color-ink-faint)]">(shows behind your name on your profile)</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              <button
                onClick={async () => {
                  const updated = await updateProfile({ equipped_nameplate: null });
                  setStoreProfile(updated);
                  queryClient.invalidateQueries({ queryKey: ['my-profile'] });
                }}
                className={`flex h-12 items-center justify-center rounded-lg border text-[10.5px] text-[var(--color-ink-muted)] ${
                  !profile?.equipped_nameplate ? 'border-[var(--presence-default-a)]' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                }`}
              >
                None
              </button>
              {NAMEPLATES.map((n) => (
                <button
                  key={n.id}
                  onClick={async () => {
                    const updated = await updateProfile({ equipped_nameplate: n.id });
                    setStoreProfile(updated);
                    queryClient.invalidateQueries({ queryKey: ['my-profile'] });
                  }}
                  title={n.label}
                  className={`h-12 overflow-hidden rounded-lg border bg-[var(--color-void)] ${
                    profile?.equipped_nameplate === n.id ? 'border-[var(--presence-default-a)]' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                  }`}
                >
                  <img src={nameplateSrc(n.id)} alt={n.label} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <Field label="Status">
            <input value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={80} placeholder="What are you up to?" className={inputClass} />
          </Field>

          <Field label="Bio">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={3} className={`${inputClass} resize-none`} />
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

      {cropTarget && (
        <CropModal
          file={cropTarget.file}
          kind={cropTarget.kind}
          onCancel={() => setCropTarget(null)}
          onApply={handleCropApply}
        />
      )}

      {nameStyleOpen && (
        <NameStyleModal
          displayName={displayName || profile?.display_name || ''}
          initial={(profile?.name_style as NameStyleData) ?? null}
          onClose={() => setNameStyleOpen(false)}
          onSave={async (style) => {
            const updated = await updateProfile({ name_style: style });
            setStoreProfile(updated);
            queryClient.invalidateQueries({ queryKey: ['my-profile'] });
          }}
        />
      )}
    </div>

    <div className="hidden xl:block">
      <ProfilePreviewCard
        displayName={displayName}
        username={`@${profile?.username ?? ''}`}
        bio={bio}
        pronouns={pronouns}
        statusText={statusText}
        accentTop={accentTop}
        accentBottom={accentBottom}
        avatarUrl={avatarUrl}
        bannerUrl={bannerUrl}
        nameStyle={(profile?.name_style as NameStyleData) ?? null}
        equippedNameplate={profile?.equipped_nameplate ?? null}
        memberSince={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
      />
    </div>
    </div>
  );
}
