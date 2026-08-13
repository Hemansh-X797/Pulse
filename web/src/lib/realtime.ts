import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Message, PulseNotification } from './database.types';

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
  onNotification: (notification: PulseNotification) => void
): RealtimeChannel {
  return supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onNotification(payload.new as PulseNotification)
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

export function unsubscribe(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}
