'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { GlobalNav } from './GlobalNav';
import { SecondarySidebar } from './SecondarySidebar';
import { useAppStore } from '../../store/useAppStore';

/**
 * There's no room for rail + sidebar + main all at once on a phone
 * screen — this is the actual cause of the "friends on phone can't use
 * it" reports. Below the md breakpoint, only one pane is visible at a
 * time, chosen from the URL itself (no extra state to keep in sync):
 *
 *  - A DM/space *list* route (/channels/me, /spaces/[id] with no topic)
 *    shows the sidebar full-screen, standing in for "main" on mobile.
 *  - Opening an actual chat (/channels/me/[id], /spaces/[id]/[topicId])
 *    shows only `main`, sidebar and the nav bar both hidden, so the
 *    whole screen is the conversation — same pattern WhatsApp/Discord's
 *    own mobile web use.
 *  - Everything else (/home, /discover, /friends, /stories, /settings,
 *    a profile) shows `main` full-screen with the nav as a bottom bar.
 *
 * Desktop (md and up) is completely unchanged: all three panes, always.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const unreadNotifications = useAppStore((s) => s.unreadNotifications);

  const isDmListRoot = pathname === '/channels/me' || pathname === '/channels/@me';
  const isSpaceListRoot = /^\/spaces\/[^/]+$/.test(pathname);
  const isChannelDetail = /^\/channels\/(me|@me)\/[^/]+/.test(pathname);
  const isSpaceDetail = /^\/spaces\/[^/]+\/[^/]+/.test(pathname);
  const isNotificationsRoute = pathname === '/notifications';

  const mobileShowSidebarAsMain = isDmListRoot || isSpaceListRoot;
  const mobileHideNav = isChannelDetail || isSpaceDetail;

  // A mobile-only top bar with a notifications bell. Without this,
  // notifications had no entry point at all on mobile outside the
  // DM/space list roots — SecondarySidebar (home of the bell button)
  // is hidden on every other route below the md breakpoint, and there
  // was nothing standing in for it. Skipped on the DM/space list roots
  // (SecondarySidebar's own bell already covers those, full-screen) and
  // on the notifications route itself (its own header already has a
  // back button, no need for a second bell pointing at itself).
  const showMobileTopBar = !mobileShowSidebarAsMain && !mobileHideNav && !isNotificationsRoute;

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[var(--color-void)] text-[var(--color-ink)] md:flex-row">
      <div className={`${mobileHideNav ? 'hidden' : 'flex'} md:flex`}>
        <GlobalNav />
      </div>

      <div className={`${mobileShowSidebarAsMain ? 'flex flex-1 pb-[58px]' : 'hidden'} md:flex md:flex-none md:pb-0`}>
        <SecondarySidebar />
      </div>

      <main
        className={`min-w-0 flex-1 flex-col ${mobileShowSidebarAsMain ? 'hidden' : 'flex'} ${mobileHideNav ? '' : 'pb-[58px]'} md:flex md:pb-0`}
      >
        {showMobileTopBar && (
          <div className="flex items-center justify-end border-b border-[var(--color-hairline)] px-3 py-2 md:hidden">
            <Link href="/notifications" className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]" aria-label="Notifications">
              <Bell size={19} />
              {unreadNotifications > 0 && (
                <span className="absolute right-1 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full presence-fill px-0.5 font-mono text-[9px] font-bold text-black">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
