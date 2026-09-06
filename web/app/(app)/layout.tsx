'use client';

import { useEffect, useState, useRef } from 'react';
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
import { listAvatarDecorationCatalog } from '../../src/lib/avatarDecorations';
import { listProfileDecorCatalog } from '../../src/lib/profileDecor';

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
  // itself loads fast. Rather than just firing these in the background
  // and immediately revealing the app shell (the previous version),
  // this now actually holds the loading screen up — Discord/Instagram
  // splash style — until this preload pass finishes, tracking real
  // progress instead of a fake timer, so the loading screen's progress
  // bar means something. A 3-second safety cap means a slow connection
  // never gets stuck staring at a splash forever — it reveals the app
  // shell regardless once that fires, same as the real destinations
  // would eventually load in-place anyway.
  const [preloadProgress, setPreloadProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [preloadFinished, setPreloadFinished] = useState(false);
  const preloadStarted = useRef(false);

  useEffect(() => {
    if (loading || !session || preloadStarted.current) return;
    preloadStarted.current = true;

    const tasks: { label: string; run: () => Promise<unknown> }[] = [
      { label: 'Loading your feed…', run: () => queryClient.prefetchQuery({ queryKey: ['feed', 'for-you'], queryFn: () => listFeed() }) },
      { label: 'Loading conversations…', run: () => queryClient.prefetchQuery({ queryKey: ['my-dms'], queryFn: listMyDMs }) },
      { label: 'Loading your spaces…', run: () => queryClient.prefetchQuery({ queryKey: ['spaces'], queryFn: listMySpaces }) },
      { label: 'Loading friends…', run: () => queryClient.prefetchQuery({ queryKey: ['friends'], queryFn: listFriends }) },
      { label: 'Loading notifications…', run: () => queryClient.prefetchQuery({ queryKey: ['notifications'], queryFn: () => listNotifications() }) },
      { label: 'Loading decorations…', run: () => queryClient.prefetchQuery({ queryKey: ['avatar-decoration-catalog'], queryFn: listAvatarDecorationCatalog, staleTime: Infinity }) },
      { label: 'Loading decorations…', run: () => queryClient.prefetchQuery({ queryKey: ['profile-decor-catalog'], queryFn: listProfileDecorCatalog, staleTime: Infinity }) },
    ];

    let done = 0;
    setPreloadProgress({ done: 0, total: tasks.length, label: tasks[0].label });

    const safetyTimer = setTimeout(() => setPreloadFinished(true), 3000);

    Promise.allSettled(
      tasks.map((task) =>
        task.run().finally(() => {
          done += 1;
          setPreloadProgress({ done, total: tasks.length, label: tasks[done]?.label ?? 'Almost there…' });
        })
      )
    ).finally(() => {
      clearTimeout(safetyTimer);
      setPreloadFinished(true);
    });

    return () => clearTimeout(safetyTimer);
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

  // Session resolved but the preload pass (above) hasn't finished or
  // hit its safety cap yet — keep showing the splash rather than
  // flashing the app shell with empty screens underneath while data
  // streams in. Skipped entirely for onboarding (that flow has nothing
  // to preload and shouldn't be gated on it).
  if (session && !preloadFinished && pathname !== '/onboarding') {
    return (
      <AppLoadingScreen
        progress={preloadProgress ? preloadProgress.done / preloadProgress.total : 0}
        statusText={preloadProgress?.label}
      />
    );
  }

  return <AppShell>{children}</AppShell>;
}
