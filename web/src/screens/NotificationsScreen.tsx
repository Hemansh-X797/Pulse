'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useNotificationsData, NotificationRow, EmptyNotifications } from '../components/shell/notificationsShared';

/**
 * Full-page version of the notifications dropdown. Reachable at
 * /notifications on any screen size, but this is specifically what
 * fixes mobile: the dropdown only opens from a bell button inside
 * SecondarySidebar, and SecondarySidebar is hidden on mobile for every
 * route except the DM/space list roots (AppShell.tsx's mobile layout
 * logic) — so there was previously no way to reach notifications from
 * Home, Discover, Friends, Stories, or Settings on a phone at all.
 */
export function NotificationsScreen() {
  const router = useRouter();
  const { data, markAll, navigateFor } = useNotificationsData();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] px-3 py-3">
        <button
          onClick={() => router.back()}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] md:hidden"
          aria-label="Back"
        >
          <ChevronLeft size={19} />
        </button>
        <span className="flex-1 text-[15px] font-semibold">Notifications</span>
        {data && data.notifications.some((n) => !n.read) && (
          <button className="text-[12px] font-medium text-[var(--presence-default-b)] hover:underline" onClick={() => markAll.mutate()}>
            Mark all read
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {!data || data.notifications.length === 0 ? <EmptyNotifications /> : data.notifications.map((n) => <NotificationRow key={n.id} n={n} onClick={() => navigateFor(n)} />)}
      </div>
    </div>
  );
}
