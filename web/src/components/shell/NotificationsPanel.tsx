'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../../lib/api/notifications';
import { useAppStore } from '../../store/useAppStore';

const TYPE_LABEL: Record<string, string> = {
  message: 'sent a message',
  reaction: 'reacted to your post',
  comment: 'commented on your post',
  server_invite: 'invited you to a server',
};

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
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

  return (
    <>
      {/* click-outside overlay */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-[-4px] top-[calc(100%+10px)] z-40 flex max-h-[420px] w-80 flex-col overflow-hidden rounded-xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-3.5 py-3 text-[12.5px] font-semibold">
          <span>Notifications</span>
          {data && data.notifications.some((n) => !n.read) && (
            <button className="text-[11px] font-medium text-[var(--presence-default-b)] hover:underline" onClick={() => markAll.mutate()}>
              Mark all read
            </button>
          )}
        </div>
        <div className="overflow-y-auto">
          {!data || data.notifications.length === 0 ? (
            <div className="px-3.5 py-6 text-center text-[12.5px] text-[var(--color-ink-muted)]">You're all caught up.</div>
          ) : (
            data.notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markOne.mutate(n.id)}
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
            ))
          )}
        </div>
      </div>
    </>
  );
}
