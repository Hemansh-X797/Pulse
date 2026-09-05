'use client';

import { MessageSquare, UserPlus, MoreHorizontal } from 'lucide-react';
import { NameStyle, type NameStyleData } from './NameStyle';
import { ProfileDecorBackground } from './ProfileDecorBackground';
import { DecoratedAvatar } from './DecoratedAvatar';

/**
 * Real-time mirror of the edit form's current draft state — reads the
 * same local state variables ProfileSettings.tsx already tracks (not a
 * separate fetch), so every keystroke/color pick/upload shows up here
 * instantly, matching your ProfileEdit demo's "live preview" panel.
 * Static/non-functional by design — the actual Message/Add
 * friend/More buttons on a real profile page work; these are a
 * preview of what they'll look like, not live controls.
 */
export function ProfilePreviewCard({
  displayName,
  username,
  bio,
  pronouns,
  statusText,
  accentTop,
  accentBottom,
  avatarUrl,
  bannerUrl,
  nameStyle,
  equippedNameplate,
  equippedAvatarDecoration,
  memberSince,
}: {
  displayName: string;
  username: string;
  bio: string;
  pronouns: string;
  statusText: string;
  accentTop: string;
  accentBottom: string;
  avatarUrl: string;
  bannerUrl: string;
  nameStyle: NameStyleData | null;
  equippedNameplate: string | null;
  equippedAvatarDecoration: string | null;
  memberSince: string;
}) {
  return (
    <div className="sticky top-6 w-[300px] shrink-0 overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-void)] shadow-2xl">
      <div
        className="h-24 w-full"
        style={
          bannerUrl
            ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: `linear-gradient(150deg, ${accentTop}, ${accentBottom})` }
        }
      />

      <div className="relative px-4 pb-4">
        {/* Profile Decor now covers the whole card body (everything
            below the banner), not just a strip along the bottom — see
            ProfileDecorBackground for why. */}
        <ProfileDecorBackground decorId={equippedNameplate} />
        <div className="relative z-10">
          <DecoratedAvatar decorationId={equippedAvatarDecoration} size={72}>
            <div
              className="-mt-9 mb-2.5 flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full border-4 border-[var(--color-void)] bg-[var(--color-surface-raised)] text-xl font-bold"
              style={
                avatarUrl
                  ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: `linear-gradient(150deg, ${accentTop}, ${accentBottom})`, color: '#000' }
              }
            >
              {!avatarUrl && (displayName || '?').slice(0, 2).toUpperCase()}
            </div>
          </DecoratedAvatar>

          <div className="mb-3">
            <div className="text-[17px] font-bold">
              <NameStyle name={displayName || 'YourName'} style={nameStyle} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
              <span>{username}</span>
              {pronouns && (
                <>
                  <span>·</span>
                  <span className="italic">{pronouns}</span>
                </>
              )}
            </div>
          </div>

          <div className="mb-3 flex items-center gap-1.5">
            <button className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-semibold text-white" style={{ background: accentTop }}>
              <MessageSquare size={13} /> Message
            </button>
            <button className="rounded-md bg-[var(--color-surface-overlay)] p-1.5">
              <UserPlus size={14} />
            </button>
            <button className="rounded-md bg-[var(--color-surface-overlay)] p-1.5">
              <MoreHorizontal size={14} />
            </button>
          </div>

          {statusText && (
            <div className="mb-3 flex max-w-full items-start gap-1.5 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-[10.5px] leading-tight text-[var(--color-ink-muted)]">
              <span className="truncate">{statusText}</span>
            </div>
          )}

          <div className="my-3 h-px bg-[var(--color-hairline)]" />

          {bio && (
            <p className="mb-3 border-l-2 border-[var(--presence-default-a)] pl-3 text-[12px] italic leading-relaxed text-[var(--color-ink-muted)]">
              {bio}
            </p>
          )}

          <div className="space-y-0.5">
            <span className="block font-mono text-[9.5px] uppercase tracking-widest text-[var(--color-ink-faint)]">Member Since</span>
            <span className="text-[12px]">{memberSince}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
