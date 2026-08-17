'use client';

import { useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Check } from 'lucide-react';
import { getProfileByUsername } from '../../lib/api/profile';
import { createOrGetDM } from '../../lib/api/channels';
import { listFriends, listOutgoingRequests, sendFriendRequest } from '../../lib/api/friends';
import { useAppStore } from '../../store/useAppStore';

export function ProfilePopover({ username, anchorRef, onClose }: { username: string; anchorRef: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const myProfile = useAppStore((s) => s.profile);

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
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [anchorRef, onClose]);

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
          <div className="px-4 pb-4">
            {/* Clicking the avatar here — and only here — goes to the full
                profile page, per your spec: popover first, full page on a
                second, deliberate click. */}
            <button
              onClick={handleOpenFullProfile}
              className="-mt-7 mb-2 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[var(--color-surface-overlay)] text-base font-bold text-black"
              style={{
                background: profile.avatar_url
                  ? `url(${profile.avatar_url}) center/cover`
                  : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
              }}
              aria-label="Open full profile"
              title="Open full profile"
            >
              {!profile.avatar_url && profile.display_name.slice(0, 2).toUpperCase()}
            </button>

            <div className="text-[14.5px] font-semibold text-[var(--color-ink)]">{profile.display_name}</div>
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
          </div>
        </>
      )}
    </div>
  );
}
