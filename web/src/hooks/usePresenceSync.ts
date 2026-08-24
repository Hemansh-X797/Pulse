'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { subscribeToGlobalPresence, updateGlobalPresenceStatus, unsubscribe } from '../lib/realtime';
import { useAppStore } from '../store/useAppStore';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../lib/database.types';

/**
 * Joins the app-wide presence channel once per session and keeps
 * `presenceByUserId` in the store live. Re-tracks with the new status
 * whenever the person changes it in Settings (via the channelRef,
 * rather than tearing down and rejoining the channel — that would
 * briefly drop them from everyone else's view for no reason).
 */
export function usePresenceSync(session: Session | null, status: Profile['status'] | undefined) {
  const setPresenceByUserId = useAppStore((s) => s.setPresenceByUserId);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!session) {
      setPresenceByUserId({});
      return;
    }
    const channel = subscribeToGlobalPresence(session.user.id, status ?? 'online', (statuses) => {
      setPresenceByUserId(statuses);
    });
    channelRef.current = channel;

    return () => {
      unsubscribe(channel);
      channelRef.current = null;
    };
    // Deliberately not re-subscribing on every `status` change — see
    // the effect below, which updates the already-open channel instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, setPresenceByUserId]);

  useEffect(() => {
    if (channelRef.current && status) {
      updateGlobalPresenceStatus(channelRef.current, status);
    }
  }, [status]);
}
