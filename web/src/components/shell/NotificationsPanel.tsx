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
      <div className="absolute right-[-4px] top-[calc(100%+10px)] z-40 flex max-h-[420px] w-80 flex-col overflow-hidden rounded-xl border border-white/[0.13] bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-3 text-[12.5px] font-semibold">
          <span>Notifications</span>
          {data && data.notifications.some((n) => !n.read) && (
            <button className="text-[11px] font-medium text-indigo-400 hover:underline" onClick={() => markAll.mutate()}>
              Mark all read
            </button>
          )}
        </div>
        <div className="overflow-y-auto">
          {!data || data.notifications.length === 0 ? (
            <div className="px-3.5 py-6 text-center text-[12.5px] text-neutral-500">You're all caught up.</div>
          ) : (
            data.notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markOne.mutate(n.id)}
                className={`flex w-full items-start justify-between gap-2.5 border-b border-white/[0.07] px-3.5 py-2.5 text-left last:border-b-0 hover:bg-neutral-800 ${
                  !n.read ? 'bg-indigo-400/[0.06]' : ''
                }`}
              >
                <div className="text-[12.5px] leading-relaxed text-neutral-400">
                  <b className="font-semibold text-white">{n.actor_username}</b> {TYPE_LABEL[n.type] ?? n.type}
                  {n.type === 'message' && n.body && <div className="mt-0.5 text-[11.5px] text-neutral-500">{n.body}</div>}
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] text-neutral-500">{timeAgo(n.created_at)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
