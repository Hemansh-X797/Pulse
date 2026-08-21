'use client';

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Check, X } from 'lucide-react';
import { getProfileByUsername } from '../../lib/api/profile';
import { createOrGetDM } from '../../lib/api/channels';
import { listFriends, listOutgoingRequests, sendFriendRequest } from '../../lib/api/friends';
import { useAppStore } from '../../store/useAppStore';
import { NameStyle, type NameStyleData } from '../NameStyle';
import { isValidNameplateId, nameplateSrc } from '../../lib/nameplates';

export function ProfilePopover({ username, anchorRef, onClose }: { username: string; anchorRef: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const myProfile = useAppStore((s) => s.profile);
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);

  const { data: profile, isLoading } = useQuery({ queryKey: ['profile', username], queryFn: () => getProfileByUsername(username) });
  const { data: friends = [] } = useQuery({ queryKey: ['friends'], queryFn: listFriends });
  const { data: outgoing = [] } = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: listOutgoingRequests });

  const isFriend = profile && friends.some((f) => f.id === profile.id);
  const isRequested = profile && outgoing.some((o) => o.recipient.id === profile.id);
  const isSelf = myProfile?.id === profile?.id;

  const sendMutation = useMutation({
    mutationFn: () => sendFriendRequest(profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
  });

  // Click-outside + Escape to close — standard popover behavior, not
  // wired to a heavier "modal manager" system since this is the only
  // popover-style UI in the app right now.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (avatarLightboxOpen) {
        setAvatarLightboxOpen(false);
        return;
      }
      onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [anchorRef, onClose, avatarLightboxOpen]);

  async function handleMessage() {
    if (!profile) return;
    const channelId = await createOrGetDM(profile.username);
    onClose();
    router.push(`/channels/me/${channelId}`);
  }

  function handleOpenFullProfile() {
    if (!profile) return;
    onClose();
    router.push(`/${profile.username}`);
  }

  return (
    <div
      ref={popoverRef}
      className="absolute z-30 w-72 overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl"
    >
      {isLoading || !profile ? (
        <div className="p-5 text-[13px] text-[var(--color-ink-muted)]">Loading…</div>
      ) : (
        <>
          <div
            className="h-16"
            style={{
              background: profile.banner_url
                ? `url(${profile.banner_url}) center/cover`
                : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
            }}
          />
          <div className="relative px-4 pb-4">
            {isValidNameplateId(profile.equipped_nameplate) && (
              <img
                src={nameplateSrc(profile.equipped_nameplate)}
                alt=""
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full object-cover object-bottom"
              />
            )}
            <div className="relative">
            {/* Click enlarges the avatar in place (lightbox), per your
                screenshot — it no longer navigates away on click.
                "View Full Profile" below is the new, explicit way to
                reach the full page. */}
            <button
              onClick={() => profile.avatar_url && setAvatarLightboxOpen(true)}
              className="-mt-7 mb-2 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[var(--color-surface-overlay)] text-base font-bold text-black"
              style={{
                background: profile.avatar_url
                  ? `url(${profile.avatar_url}) center/cover`
                  : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
              }}
              aria-label={profile.avatar_url ? 'Enlarge profile photo' : undefined}
              title={profile.avatar_url ? 'Enlarge profile photo' : undefined}
            >
              {!profile.avatar_url && profile.display_name.slice(0, 2).toUpperCase()}
            </button>

            <div className="text-[14.5px] font-semibold text-[var(--color-ink)]">
              <NameStyle name={profile.display_name} style={profile.name_style as NameStyleData} />
            </div>
            <div className="mb-2 text-[12px] text-[var(--color-ink-muted)]">
              @{profile.username} {profile.pronouns && `· ${profile.pronouns}`}
            </div>
            {profile.status_text && <div className="mb-2 text-[12.5px] text-[var(--color-ink)]/80">{profile.status_text}</div>}

            {!isSelf && (
              <div className="mt-3 flex gap-2">
                {isFriend ? (
                  <span className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--color-hairline-strong)] py-1.5 text-[12px] font-medium text-[var(--color-ink-muted)]">
                    <Check size={13} /> Friends
                  </span>
                ) : isRequested ? (
                  <span className="flex-1 rounded-full border border-[var(--color-hairline-strong)] py-1.5 text-center text-[12px] font-medium text-[var(--color-ink-muted)]">
                    Requested
                  </span>
                ) : (
                  <button
                    onClick={() => sendMutation.mutate()}
                    disabled={sendMutation.isPending}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--color-ink)] py-1.5 text-[12px] font-semibold text-black"
                  >
                    <UserPlus size={13} /> Add
                  </button>
                )}
                <button
                  onClick={handleMessage}
                  className="flex-1 rounded-full bg-[var(--color-surface-raised)] py-1.5 text-[12px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-hairline-strong)]"
                >
                  Message
                </button>
              </div>
            )}

            <button
              onClick={handleOpenFullProfile}
              className="mt-3 text-[11.5px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline"
            >
              View Full Profile
            </button>
            </div>
          </div>
        </>
      )}

      {avatarLightboxOpen && profile?.avatar_url && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6"
          onClick={() => setAvatarLightboxOpen(false)}
        >
          <button
            onClick={() => setAvatarLightboxOpen(false)}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <img
            src={profile.avatar_url}
            alt={`${profile.display_name}'s profile photo`}
            className="max-h-[80vh] max-w-[80vw] rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
