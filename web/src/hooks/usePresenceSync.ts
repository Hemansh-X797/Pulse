'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { subscribeToGlobalPresence, updateGlobalPresenceStatus, unsubscribe } from '../lib/realtime';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '../lib/supabase';
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

  // last_seen_at heartbeat — presence itself is purely ephemeral (see
  // subscribeToGlobalPresence), so without this there was no persisted
  // record of when someone was last around to show "last seen 2h ago"
  // once they go offline. Writes immediately on session start, then
  // every 2 minutes while the tab stays open, and once more whenever
  // the tab regains visibility (covers "closed my laptop, opened it 3
  // hours later" without waiting for the next interval tick). No write
  // on unmount/unload — a page unloading can't reliably complete a
  // network request, so this deliberately doesn't try to mark an exact
  // "went offline at" moment, just "last known to be active at".
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    function beat() {
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId).then(() => {});
    }

    beat();
    const interval = setInterval(beat, 2 * 60 * 1000);
    function onVisible() {
      if (document.visibilityState === 'visible') beat();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session]);
}
