'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToMyChannelMemberships, subscribeToMySpaceMemberships, unsubscribe } from '../lib/realtime';
import type { Session } from '@supabase/supabase-js';

/**
 * Keeps the DM list (SecondarySidebar's ['my-dms'] query) and the
 * space list (GlobalNav's ['spaces'] query) live — the instant someone
 * adds you to a channel or space, this invalidates the relevant query
 * so it refetches immediately, instead of waiting for a window-focus
 * or navigation to incidentally trigger a refetch. This is the actual
 * fix for "a DM takes ~2 minutes to show up" — the tables these
 * subscriptions read from were never in the realtime publication until
 * 018_realtime_membership_tables.sql, so this hook existing without
 * that migration applied would still silently do nothing.
 */
export function useMembershipSync(session: Session | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    const channelMembershipSub = subscribeToMyChannelMemberships(userId, () => {
      queryClient.invalidateQueries({ queryKey: ['my-dms'] });
    });
    const spaceMembershipSub = subscribeToMySpaceMemberships(userId, () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    });

    return () => {
      unsubscribe(channelMembershipSub);
      unsubscribe(spaceMembershipSub);
    };
  }, [session, queryClient]);
}
