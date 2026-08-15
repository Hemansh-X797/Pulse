import { useEffect } from 'react';
import { getUnreadCounts } from '../lib/api/channels';
import { subscribeToAllMessages, unsubscribe } from '../lib/realtime';
import { useAppStore } from '../store/useAppStore';
import type { Session } from '@supabase/supabase-js';

/**
 * Drives GlobalNav's DM badge and (once wired there) per-topic unread
 * dots in SecondarySidebar. Previously `getUnreadCounts()` existed and
 * worked fine on its own, but nothing ever called it and nothing kept it
 * live — `unreadByChannel` sat at `{}` forever, so the badge always read
 * zero no matter how many unread messages existed. This closes that gap:
 * one fetch on session-ready, then a live realtime top-up per message so
 * the badge doesn't need a page reload to update.
 */
export function useUnreadCounts(session: Session | null) {
  const setUnreadByChannel = useAppStore((s) => s.setUnreadByChannel);

  useEffect(() => {
    if (!session) {
      setUnreadByChannel({});
      return;
    }

    let cancelled = false;
    getUnreadCounts()
      .then((counts) => {
        if (!cancelled) setUnreadByChannel(counts);
      })
      .catch(() => {
        // Non-fatal — badge just stays at whatever it last was (likely
        // zero on first load). Not surfaced as a user-facing error since
        // an unread count is not something worth interrupting anyone for.
      });

    const channel = subscribeToAllMessages((message) => {
      const state = useAppStore.getState();
      // Don't count your own messages, and don't count messages in the
      // channel you're currently looking at — ChatView's own markRead
      // effect handles that channel's count directly and more precisely
      // (it knows the exact last-read message id, not just "a message
      // arrived while this channel happened to be open").
      if (message.sender_id === state.profile?.id) return;
      if (message.channel_id === state.activeChannelId) return;

      useAppStore.setState((s) => ({
        unreadByChannel: {
          ...s.unreadByChannel,
          [message.channel_id]: (s.unreadByChannel[message.channel_id] ?? 0) + 1,
        },
      }));
    });

    return () => {
      cancelled = true;
      unsubscribe(channel);
    };
  }, [session, setUnreadByChannel]);
}
