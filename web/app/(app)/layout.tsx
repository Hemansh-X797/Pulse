'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthSync } from '../../src/hooks/useAuthSync';
import { useUnreadCounts } from '../../src/hooks/useUnreadCounts';
import { useUnreadBadge } from '../../src/hooks/useUnreadBadge';
import { useMembershipSync } from '../../src/hooks/useMembershipSync';
import { useNotificationSync } from '../../src/hooks/useNotificationSync';
import { usePresenceSync } from '../../src/hooks/usePresenceSync';
import { useAppStore } from '../../src/store/useAppStore';
import { AppShell } from '../../src/components/shell/AppShell';

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
  const session = useAppStore((s) => s.session);
  const totalUnread = useAppStore((s) => s.totalUnreadChannels());
  useUnreadCounts(session);
  useUnreadBadge(totalUnread);
  useMembershipSync(session);
  useNotificationSync(session);
  usePresenceSync(session, useAppStore((s) => s.profile?.status));

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
    return <div className="flex h-screen w-full items-center justify-center bg-neutral-950 text-neutral-500">Loading…</div>;
  }

  return <AppShell>{children}</AppShell>;
}
