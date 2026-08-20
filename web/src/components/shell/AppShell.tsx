'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { GlobalNav } from './GlobalNav';
import { SecondarySidebar } from './SecondarySidebar';

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

  const isDmListRoot = pathname === '/channels/me' || pathname === '/channels/@me';
  const isSpaceListRoot = /^\/spaces\/[^/]+$/.test(pathname);
  const isChannelDetail = /^\/channels\/(me|@me)\/[^/]+/.test(pathname);
  const isSpaceDetail = /^\/spaces\/[^/]+\/[^/]+/.test(pathname);

  const mobileShowSidebarAsMain = isDmListRoot || isSpaceListRoot;
  const mobileHideNav = isChannelDetail || isSpaceDetail;

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
        {children}
      </main>
    </div>
  );
}
