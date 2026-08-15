'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
