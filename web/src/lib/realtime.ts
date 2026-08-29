import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Message, PalSpaceNotification } from './database.types';

// This file is the replacement for the ~400-line hand-built RFC 6455
// WebSocket server (server/src/chat/chat_server.hpp) — the SHA-1
// handshake, frame encode/decode, the connection/channel-subscriber maps
// guarded by a mutex, all of it. Supabase Realtime subscribes to
// Postgres row changes over a managed WebSocket and re-delivers them,
// filtered server-side by the same RLS policies that gate everything
// else — a client literally cannot subscribe to messages in a channel
// it isn't a member of.
//
// What's NOT replaced automatically: typing indicators and presence
// (who's online) aren't row changes, so they use Supabase's separate
// "broadcast" + "presence" channel features instead of postgres_changes
// — see subscribeToTyping/subscribeToPresence below.

export function subscribeToChannelMessages(
  channelId: string,
  onInsert: (message: Message) => void,
  onUpdate: (message: Message) => void
): RealtimeChannel {
  return supabase
    .channel(`messages:${channelId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
      (payload) => onInsert(payload.new as Message)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
      (payload) => onUpdate(payload.new as Message)
    )
    .subscribe();
}

export function subscribeToNotifications(
  userId: string,
  onNotification: (notification: PalSpaceNotification) => void
): RealtimeChannel {
  return supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onNotification(payload.new as PalSpaceNotification)
    )
    .subscribe();
}

// Typing indicators: ephemeral, don't need to be stored, so this uses
// Realtime's "broadcast" feature (fire-and-forget pub/sub over the same
// socket) instead of a database table — same design choice the C++
// version made with its in-memory-only "typing" op.
export function subscribeToTyping(channelId: string, onTyping: (username: string) => void): RealtimeChannel {
  return supabase
    .channel(`typing:${channelId}`)
    .on('broadcast', { event: 'typing' }, (payload) => onTyping(payload.payload.username as string))
    .subscribe();
}

export function broadcastTyping(channelId: string, username: string) {
  supabase.channel(`typing:${channelId}`).send({
    type: 'broadcast',
    event: 'typing',
    payload: { username },
  });
}

// Presence: who's online right now. Supabase's presence feature tracks
// this per-channel automatically (join/leave events), replacing the C++
// version's online_users_ set + push_to_user broadcast-on-connect/
// disconnect logic.
export function subscribeToPresence(
  channelId: string,
  userId: string,
  username: string,
  onSync: (onlineUserIds: string[]) => void
): RealtimeChannel {
  const channel = supabase.channel(`presence:${channelId}`, {
    config: { presence: { key: userId } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      onSync(Object.keys(state));
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ username, online_at: new Date().toISOString() });
      }
    });

  return channel;
}

/**
 * App-wide presence, unlike subscribeToPresence above (which is scoped
 * to one open chat and was never actually wired into any UI — found
 * while building this). Every logged-in client joins one shared
 * channel and tracks its own chosen status; other clients see a map of
 * userId → 'online' | 'dnd'. A person set to 'invisible' still tracks
 * (so they're still a real, connected participant for anything else
 * that depends on presence) but is filtered out of what other clients
 * treat as "online" here — the same distinction Discord draws between
 * being connected and choosing to appear offline.
 */
const GLOBAL_PRESENCE_CHANNEL = 'presence:global';

export function subscribeToGlobalPresence(
  userId: string,
  status: 'online' | 'dnd' | 'invisible',
  onSync: (statuses: Record<string, 'online' | 'dnd'>) => void
): RealtimeChannel {
  const channel = supabase.channel(GLOBAL_PRESENCE_CHANNEL, {
    config: { presence: { key: userId } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ status: 'online' | 'dnd' | 'invisible' }>();
      const visible: Record<string, 'online' | 'dnd'> = {};
      for (const [uid, entries] of Object.entries(state)) {
        const entryStatus = entries[0]?.status;
        if (entryStatus === 'online' || entryStatus === 'dnd') {
          visible[uid] = entryStatus;
        }
        // 'invisible' entries are intentionally omitted — that's what
        // makes invisible mode actually appear offline to others.
      }
      onSync(visible);
    })
    .subscribe(async (subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        await channel.track({ status });
      }
    });

  return channel;
}

/** Call after changing status locally (e.g. in Settings) so the
 * already-open global presence channel updates its tracked payload
 * immediately, instead of waiting for a reconnect. */
export function updateGlobalPresenceStatus(channel: RealtimeChannel, status: 'online' | 'dnd' | 'invisible') {
  channel.track({ status });
}

export function unsubscribe(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}

/**
 * Global "any new message anywhere I can see" subscription, used to
 * drive live unread badges (GlobalNav's DM icon, SecondarySidebar's
 * per-topic dots) without opening every channel. Deliberately has no
 * `filter` — Realtime enforces the same RLS as everything else, so this
 * only ever delivers rows the current user's `channel_members`
 * membership actually grants access to; it is not a broad table scan
 * from the client's perspective, even though the subscription itself
 * looks unscoped.
 */
export function subscribeToAllMessages(onInsert: (message: Message) => void): RealtimeChannel {
  return supabase
    .channel('unread-tracker')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) =>
      onInsert(payload.new as Message)
    )
    .subscribe();
}

/**
 * Fires the instant I'm added to a channel (a new DM, or someone adding
 * me to a group) or a space — see 018_realtime_membership_tables.sql's
 * comment for why this didn't work at all before that migration (the
 * tables simply weren't in the realtime publication, not a client-code
 * bug). Filtered server-side to rows where I'm the member, same RLS
 * scoping as everything else — this isn't broadcasting every
 * membership change to every client.
 */
export function subscribeToMyChannelMemberships(userId: string, onInsert: () => void): RealtimeChannel {
  return supabase
    .channel(`my-channel-memberships:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'channel_members', filter: `user_id=eq.${userId}` },
      () => onInsert()
    )
    .subscribe();
}

export function subscribeToMySpaceMemberships(userId: string, onInsert: () => void): RealtimeChannel {
  return supabase
    .channel(`my-space-memberships:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'space_members', filter: `user_id=eq.${userId}` },
      () => onInsert()
    )
    .subscribe();
}

/**
 * Generic ANY-event subscription to one table, optionally filtered —
 * used where a caller just needs "something changed, go refetch"
 * rather than a specific typed payload (e.g. useCall.ts's live
 * participant list). Named distinctly from the more specific
 * subscribeTo* functions above so it's clear this is the general-
 * purpose escape hatch, not the preferred pattern for new code that
 * knows its exact shape.
 */
export function subscribeToTable(table: string, filter: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`table:${table}:${filter}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => onChange())
    .subscribe();
}
