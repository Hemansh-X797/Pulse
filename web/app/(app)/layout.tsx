'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthSync } from '../../src/hooks/useAuthSync';
import { useUnreadCounts } from '../../src/hooks/useUnreadCounts';
import { useUnreadBadge } from '../../src/hooks/useUnreadBadge';
import { useMembershipSync } from '../../src/hooks/useMembershipSync';
import { useNotificationSync } from '../../src/hooks/useNotificationSync';
import { usePresenceSync } from '../../src/hooks/usePresenceSync';
import { useAppStore } from '../../src/store/useAppStore';
import { AppShell } from '../../src/components/shell/AppShell';
import { AppLoadingScreen } from '../../src/components/shell/AppLoadingScreen';
import { listFeed } from '../../src/lib/api/feed';
import { listMyDMs } from '../../src/lib/api/channels';
import { listMySpaces } from '../../src/lib/api/spaces';
import { listFriends } from '../../src/lib/api/friends';
import { listNotifications } from '../../src/lib/api/notifications';

// Replaces the TanStack Router `appLayoutRoute.beforeLoad` guard. That
// version could redirect *before* the page rendered because the router
// awaited the session check itself; Next's App Router doesn't have an
// equivalent client-side beforeLoad hook, so this checks after mount and
// redirects via useEffect instead. Functionally the same end state, one
// render frame later.
//
// FOLLOW-UP (noted, not done here): for true SSR-level protection (no
// flash of protected content, ever) this should move to @supabase/ssr +
// middleware.ts reading the auth cookie. That's a bigger change — it also
// requires updating auth.ts to use the cookie-aware client — so it's left
// as a Phase-4 hardening item rather than bundled into this migration.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuthSync();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const session = useAppStore((s) => s.session);
  const totalUnread = useAppStore((s) => s.totalUnreadChannels());
  useUnreadCounts(session);
  useUnreadBadge(totalUnread);
  useMembershipSync(session);
  useNotificationSync(session);
  usePresenceSync(session, useAppStore((s) => s.profile?.status));

  // The actual fix for "waiting on each page" — every screen (Home,
  // DMs, Spaces, Friends, Notifications) fetches its own data cold the
  // first time you navigate to it, so clicking around always meant a
  // blank/skeleton flash on each destination even though the data
  // itself loads fast. This warms React Query's cache for the handful
  // of core destinations right after the session resolves, once, so
  // that by the time you actually click into any of them the data's
  // very likely already sitting in cache — a real navigation, not a
  // fresh fetch. Uses prefetchQuery (not fetchQuery) specifically so a
  // slow network doesn't block anything; it fills the cache
  // opportunistically in the background and each screen's own
  // useQuery just picks up whatever's there when it mounts.
  useEffect(() => {
    if (loading || !session) return;
    queryClient.prefetchQuery({ queryKey: ['feed', 'for-you'], queryFn: () => listFeed() });
    queryClient.prefetchQuery({ queryKey: ['my-dms'], queryFn: listMyDMs });
    queryClient.prefetchQuery({ queryKey: ['spaces'], queryFn: listMySpaces });
    queryClient.prefetchQuery({ queryKey: ['friends'], queryFn: listFriends });
    queryClient.prefetchQuery({ queryKey: ['notifications'], queryFn: () => listNotifications() });
  }, [loading, session, queryClient]);

  useEffect(() => {
    // useAuthSync sets session in the store; read it directly via
    // getState() here (rather than subscribing with the hook) since this
    // effect only needs the value once, right after loading finishes.
    if (!loading && !useAppStore.getState().session) {
      router.replace('/login');
      return;
    }
    // Second gate: a signed-in user whose profile hasn't completed
    // onboarding shouldn't be able to reach the rest of the app by
    // navigating straight to /home (e.g. closing the tab mid-onboarding,
    // or an OAuth signup that never went through Login.tsx's explicit
    // /onboarding redirect). New rows default onboarding_completed to
    // false (011_onboarding_and_public_spaces.sql); existing accounts
    // were backfilled to true in that same migration, so this only
    // catches genuinely new, incomplete signups.
    if (!loading) {
      const profile = useAppStore.getState().profile;
      if (profile && !profile.onboarding_completed && pathname !== '/onboarding') {
        router.replace('/onboarding');
      }
    }
  }, [loading, router, pathname]);

  if (loading) {
    return <AppLoadingScreen />;
  }

  return <AppShell>{children}</AppShell>;
}
