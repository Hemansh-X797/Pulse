'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, UserPlus, Check, ShieldOff, Shield, X } from 'lucide-react';
import { getProfileByUsername } from '../lib/api/profile';
import { createOrGetDM } from '../lib/api/channels';
import { listFriends, listOutgoingRequests, sendFriendRequest } from '../lib/api/friends';
import { listBlockedUsers, blockUser, unblockUser } from '../lib/api/blocking';
import { useAppStore } from '../store/useAppStore';
import { NameStyle, type NameStyleData } from '../components/NameStyle';
import { isValidNameplateId, nameplateSrc } from '../lib/nameplates';

export function UserProfile() {
  const params = useParams<{ username: string }>()!;
  const username = params.username;
  const router = useRouter();
  const queryClient = useQueryClient();
  const myProfile = useAppStore((s) => s.profile);
  const [menuOpen, setMenuOpen] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => getProfileByUsername(username),
  });

  const { data: friends = [] } = useQuery({ queryKey: ['friends'], queryFn: listFriends });
  const { data: outgoing = [] } = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: listOutgoingRequests });
  const { data: blocked = [] } = useQuery({ queryKey: ['blocked-users'], queryFn: listBlockedUsers });

  const isFriend = profile && friends.some((f) => f.id === profile.id);
  const isRequested = profile && outgoing.some((o) => o.recipient.id === profile.id);
  const isBlocked = profile && blocked.some((b) => b.blocked_id === profile.id);
  const isSelf = myProfile?.id === profile?.id;

  const sendMutation = useMutation({
    mutationFn: () => sendFriendRequest(profile!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
  });
  const blockMutation = useMutation({
    mutationFn: () => blockUser(profile!.id),
    onSuccess: () => {
      setMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
  const unblockMutation = useMutation({
    mutationFn: () => unblockUser(profile!.id),
    onSuccess: () => {
      setMenuOpen(false);
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
    },
  });

  async function handleMessage() {
    setMessageError(null);
    try {
      const channelId = await createOrGetDM(username);
      router.push(`/channels/me/${channelId}`);
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : 'Could not start conversation.');
    }
  }

  if (isLoading) return null;
  if (!profile) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-muted)]">User not found.</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="h-40"
        style={{
          background: profile.banner_url
            ? `url(${profile.banner_url}) center/cover`
            : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
        }}
      />
      <div className="px-8 pb-8">
        {messageError && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
            {messageError}
            <button onClick={() => setMessageError(null)} className="ml-3 text-red-400 hover:text-[var(--color-ink)]" aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        )}
        <div className="relative">
          {isValidNameplateId(profile.equipped_nameplate) && (
            <img
              src={nameplateSrc(profile.equipped_nameplate)}
              alt=""
              className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-28 w-full object-cover object-bottom"
            />
          )}
        <div className="flex items-end justify-between">
          <div
            className="-mt-10 mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[var(--color-void)] text-2xl font-bold text-black"
            style={{
              background: profile.avatar_url
                ? `url(${profile.avatar_url}) center/cover`
                : `linear-gradient(150deg, ${profile.accent_color_top}, ${profile.accent_color_bottom})`,
            }}
          >
            {!profile.avatar_url && profile.display_name.slice(0, 2).toUpperCase()}
          </div>

          {!isSelf && (
            <div className="relative mb-4 flex items-center gap-2">
              {isFriend ? (
                <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-hairline-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-ink-muted)]">
                  <Check size={14} /> Friends
                </span>
              ) : isRequested ? (
                <span className="rounded-full border border-[var(--color-hairline-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-ink-muted)]">
                  Requested
                </span>
              ) : (
                <button
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-3.5 py-2 text-[13px] font-semibold text-black"
                >
                  <UserPlus size={14} /> Add Friend
                </button>
              )}
              <button
                onClick={handleMessage}
                className="rounded-full bg-[var(--color-surface-raised)] px-3.5 py-2 text-[13px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-overlay)]"
              >
                Message
              </button>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]"
                aria-label="More options"
                aria-haspopup="true"
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] text-[12.5px] shadow-xl">
                  {isBlocked ? (
                    <button
                      onClick={() => unblockMutation.mutate()}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[var(--color-ink)] hover:bg-[var(--color-surface-raised)]"
                    >
                      <Shield size={13} /> Unblock
                    </button>
                  ) : (
                    <button
                      onClick={() => blockMutation.mutate()}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-red-300 hover:bg-red-500/10"
                    >
                      <ShieldOff size={13} /> Block
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <h1 className="font-serif text-2xl font-semibold"><NameStyle name={profile.display_name} style={profile.name_style as NameStyleData} /></h1>
        <p className="mb-1 text-sm text-[var(--color-ink-muted)]">
          @{profile.username} {profile.pronouns && `· ${profile.pronouns}`}
        </p>
        </div>
        {profile.bio && <p className="mt-3 max-w-lg text-[14px] text-[var(--color-ink)]/80">{profile.bio}</p>}

        {/* Instagram-style media grid: still a follow-up slice, not
            stubbed here on purpose — see notes in the original component. */}
        <div className="mt-10 border-t border-[var(--color-hairline)] pt-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-ink-muted)]">Shared Media</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">Media grid — next slice, not stubbed here on purpose.</p>
        </div>
      </div>
    </div>
  );
}
