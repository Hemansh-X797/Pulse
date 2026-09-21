'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from '../src/hooks/useTheme';

export function Providers({ children }: { children: ReactNode }) {
  // Created inside useState (not at module scope) so each request/session
  // gets its own client — required under Next.js since the module can be
  // shared across requests on the server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Realtime subscriptions push fresh data over the socket, so
            // aggressive background refetching isn't needed the way it is
            // in a purely REST-polled app.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Before this, useTheme() (the hook) was never actually mounted
  // anywhere in the app — only getThemeSync()/setTheme() were called,
  // from Settings and Onboarding specifically. That meant the *entire*
  // theme-restore-on-load mechanism was a single blocking <script> in
  // app/layout.tsx with its own hand-copied list of valid theme names,
  // and nothing else in the React tree ever double-checked or corrected
  // it. That's exactly how Grove silently reverting to Bespoke on every
  // reload went unnoticed: the one place this logic lived had drifted
  // out of sync with the real theme list, and there was no second layer
  // to catch it. Mounting the hook here — reading from the same
  // VALID_THEMES the rest of the app already trusts — means the correct
  // theme gets re-applied via React on every mount as a real safety net,
  // not just cosmetic redundancy: if that script's list is ever wrong
  // again for a future theme, this corrects it within a frame instead of
  // silently sticking to Bespoke for the rest of the session.
  useTheme();

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
