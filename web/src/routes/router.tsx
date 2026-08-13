import { createRootRoute, createRoute, createRouter, redirect, Outlet } from '@tanstack/react-router';
import { supabase } from '../lib/supabase';
import { AppShell } from '../components/shell/AppShell';
import { Landing } from '../pages/Landing';
import { Login } from '../pages/Login';
import { HomeFeed } from '../pages/HomeFeed';
import { DmHome, DmChannel } from '../pages/DmPages';
import { ServerHome, ServerChannel } from '../pages/ServerPages';
import { Stories } from '../pages/Stories';
import { UserProfile } from '../pages/UserProfile';

// ---------------- root ----------------
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// ---------------- public routes ----------------
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Landing,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: Login,
});

// ---------------- protected layout (AppShell: GlobalNav + SecondarySidebar + Outlet) ----------------
// Every route nested under this one requires a session — checked once
// per navigation into the layout via beforeLoad, same guard shape as the
// C++-backed client's `state.token` check, just moved to the router
// level where TanStack Router can redirect before the page ever renders.
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  component: AppShell,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: '/login' });
    }
  },
});

const homeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/home',
  component: HomeFeed,
});

const dmIndexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/channels/@me',
  component: DmHome,
});

const dmChannelRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/channels/@me/$channelId',
  component: DmChannel,
});

// Static "@me" above is matched before this dynamic $guildId segment —
// TanStack Router prioritizes static path segments over param segments
// at the same level, so /channels/@me never gets swallowed by this route.
const serverHomeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/channels/$guildId',
  component: ServerHome,
});

const serverChannelRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/channels/$guildId/$channelId',
  component: ServerChannel,
});

const storiesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/stories',
  component: Stories,
});

const usernameRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/$username',
  component: UserProfile,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  appLayoutRoute.addChildren([
    homeRoute,
    dmIndexRoute,
    dmChannelRoute,
    serverHomeRoute,
    serverChannelRoute,
    storiesRoute,
    usernameRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
