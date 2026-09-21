import { useEffect, useRef } from 'react';
import { getUnreadCounts } from '../lib/api/channels';
import { subscribeToAllMessages, unsubscribe } from '../lib/realtime';
import { useAppStore } from '../store/useAppStore';
import { playNotificationChime } from '../lib/notificationSound';
import { getNotificationPreferences } from '../lib/api/notification-prefs';
import type { Session } from '@supabase/supabase-js';

/**
 * Drives GlobalNav's DM badge and (once wired there) per-topic unread
 * dots in SecondarySidebar. Previously `getUnreadCounts()` existed and
 * worked fine on its own, but nothing ever called it and nothing kept it
 * live — `unreadByChannel` sat at `{}` forever, so the badge always read
 * zero no matter how many unread messages existed. This closes that gap:
 * one fetch on session-ready, then a live realtime top-up per message so
 * the badge doesn't need a page reload to update.
 *
 * Also tracks mentionsByChannel alongside it — a genuinely distinct
 * count of messages that specifically @mention the current user, versus
 * "any unread message at all." See useAppStore.ts's comment on why these
 * are kept separate rather than folded into one number: a "ping" badge
 * only means something in a busy space channel with lots of unread
 * traffic that mostly isn't about you, and is meant to never appear on
 * the DM list (every DM message is already inherently addressed to you,
 * so a redundant ping indicator there would just be visual noise) — see
 * SecondarySidebar for the two places that each count actually renders.
 */
export function useUnreadCounts(session: Session | null) {
  const setUnreadByChannel = useAppStore((s) => s.setUnreadByChannel);
  const setMentionsByChannel = useAppStore((s) => s.setMentionsByChannel);
  // Cached in a ref rather than component state — read inside the
  // realtime callback below, doesn't need to trigger re-renders itself.
  const notifsEnabledRef = useRef(true);

  useEffect(() => {
    if (!session) {
      setUnreadByChannel({});
      setMentionsByChannel({});
      return;
    }

    const myUsername = useAppStore.getState().profile?.username;
    // Matches "@username" as a whole token — a real mention, not just
    // the username appearing as a substring of some other word. Built
    // once per session-mount rather than per-message; escaping the
    // username defensively even though usernames are already
    // alphanumeric-only elsewhere in this app, in case that constraint
    // ever loosens later.
    const mentionPattern = myUsername
      ? new RegExp(`(?:^|[^a-zA-Z0-9_])@${myUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9_])`, 'i')
      : null;

    getNotificationPreferences()
      .then((prefs) => {
        notifsEnabledRef.current = prefs?.notifications_enabled ?? true;
      })
      .catch(() => {});

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

      // Chime on a genuinely new incoming DM — same "not mine, not the
      // channel I'm already looking at" condition as the unread badge
      // above, since a chime for a message you're actively reading
      // would be redundant. Respects both the master notifications
      // toggle (Settings → Notifications) and the local sound-only
      // toggle (playNotificationChime no-ops if that's off, or if audio
      // hasn't been unlocked by a user gesture yet).
      if (notifsEnabledRef.current) playNotificationChime();

      useAppStore.setState((s) => ({
        unreadByChannel: {
          ...s.unreadByChannel,
          [message.channel_id]: (s.unreadByChannel[message.channel_id] ?? 0) + 1,
        },
      }));

      if (mentionPattern?.test(message.body_raw)) {
        useAppStore.setState((s) => ({
          mentionsByChannel: {
            ...s.mentionsByChannel,
            [message.channel_id]: (s.mentionsByChannel[message.channel_id] ?? 0) + 1,
          },
        }));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe(channel);
    };
  }, [session, setUnreadByChannel, setMentionsByChannel]);
}
