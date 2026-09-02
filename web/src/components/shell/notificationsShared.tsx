'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../../lib/api/notifications';
import { useAppStore } from '../../store/useAppStore';
import type { PalSpaceNotification } from '../../lib/database.types';

const TYPE_LABEL: Record<string, string> = {
  message: 'sent a message',
  reaction: 'reacted to your post',
  comment: 'commented on your post',
  space_invite: 'invited you to a space',
  friend_request: 'sent you a friend request',
  friend_accept: 'accepted your friend request',
  new_post: 'posted something new',
  follow: 'started following you',
};

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * The actual notification list + all its data/mutation logic, shared by
 * the desktop dropdown (NotificationsPanel) and the mobile full-screen
 * page (app/(app)/notifications). Previously this all lived only inside
 * the dropdown, which only rendered from a button inside
 * SecondarySidebar — and SecondarySidebar is hidden outright on mobile
 * for every route except the DM/space list roots (see AppShell.tsx), so
 * notifications had no way to be opened at all from Home, Discover,
 * Friends, Stories, or Settings on a phone. Pulling the logic out here
 * lets a real dedicated mobile route exist without duplicating it.
 */
export function useNotificationsData() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const setUnreadNotifications = useAppStore((s) => s.setUnreadNotifications);

  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => listNotifications() });

  useEffect(() => {
    if (data) setUnreadNotifications(data.unread);
  }, [data, setUnreadNotifications]);

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  function navigateFor(n: PalSpaceNotification) {
    markOne.mutate(n.id);
    if (n.channel_id) {
      router.push(`/channels/me/${n.channel_id}`);
    } else if (n.post_id != null) {
      router.push(`/home?post=${n.post_id}`);
    } else if ((n.type === 'friend_request' || n.type === 'friend_accept') && n.actor_username) {
      router.push(`/${n.actor_username}`);
    }
  }

  return { data, markOne, markAll, navigateFor };
}

export function NotificationRow({ n, onClick }: { n: PalSpaceNotification; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-2.5 border-b border-[var(--color-hairline)] px-3.5 py-2.5 text-left last:border-b-0 hover:bg-[var(--color-surface-raised)] ${
        !n.read ? 'bg-[var(--presence-default-b)]/[0.08]' : ''
      }`}
    >
      <div className="text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
        <b className="font-semibold text-[var(--color-ink)]">{n.actor_username}</b> {TYPE_LABEL[n.type] ?? n.type}
        {n.type === 'message' && n.body && <div className="mt-0.5 text-[11.5px] text-[var(--color-ink-muted)]">{n.body}</div>}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[10px] text-[var(--color-ink-muted)]">{timeAgo(n.created_at)}</span>
    </button>
  );
}

export function EmptyNotifications() {
  return (
    <div className="flex flex-col items-center gap-2 px-3.5 py-7 text-center">
      <img
        src="/illustrations/no-notifications.svg"
        alt=""
        className="h-16 w-16 opacity-80"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <span className="text-[12.5px] text-[var(--color-ink-muted)]">You're all caught up.</span>
    </div>
  );
}
