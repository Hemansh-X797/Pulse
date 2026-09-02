'use client';

import { useNotificationsData, NotificationRow, EmptyNotifications } from './notificationsShared';

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { data, markAll, navigateFor } = useNotificationsData();

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
            <EmptyNotifications />
          ) : (
            data.notifications.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                onClick={() => {
                  navigateFor(n);
                  onClose();
                }}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
