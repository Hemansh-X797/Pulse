'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listNotifications } from '../lib/api/notifications';
import { subscribeToNotifications, unsubscribe } from '../lib/realtime';
import { useAppStore } from '../store/useAppStore';
import type { Session } from '@supabase/supabase-js';

/**
 * `subscribeToNotifications()` has existed in realtime.ts for a while
 * but was never actually called anywhere (found while auditing
 * real-time gaps for the "things feel slow" reports) — the bell icon's
 * red dot only ever updated because NotificationsPanel.tsx fetched
 * unread count in its own useEffect, and that component only mounts
 * once you've already clicked the bell open. So the dot that's
 * supposed to tell you *before* opening the panel whether there's
 * something new never actually worked that way. This fetches the
 * count on session-ready (not gated behind opening the panel) and
 * keeps it live via the subscription that already existed but nothing
 * used.
 */
export function useNotificationSync(session: Session | null) {
  const queryClient = useQueryClient();
  const setUnreadNotifications = useAppStore((s) => s.setUnreadNotifications);

  useEffect(() => {
    if (!session) {
      setUnreadNotifications(0);
      return;
    }

    let cancelled = false;
    listNotifications()
      .then(({ unread }) => {
        if (!cancelled) setUnreadNotifications(unread);
      })
      .catch(() => {});

    const sub = subscribeToNotifications(session.user.id, () => {
      useAppStore.setState((s) => ({ unreadNotifications: s.unreadNotifications + 1 }));
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return () => {
      cancelled = true;
      unsubscribe(sub);
    };
  }, [session, queryClient, setUnreadNotifications]);
}
