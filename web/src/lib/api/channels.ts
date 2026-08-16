import { supabase } from '../supabase';
import { renderEmoji } from '../emoji';
import type { Message } from '../database.types';

export async function createOrGetDM(otherUsername: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { data: other, error: otherError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', otherUsername)
    .maybeSingle();
  if (otherError) throw otherError;
  if (!other) throw new Error('user not found');

  // Check for an existing 1:1 channel first. This used to always create
  // a fresh channel on every call — same bug the original C++ dm_open
  // handler had, never deduped either — so messaging the same friend
  // twice from their profile silently forked the conversation into a
  // second empty channel. "members can view channel membership" RLS
  // (schema.sql) already restricts channel_members rows to channels
  // *I'm* also a member of, so this single query naturally resolves to
  // the shared channel(s) between us — no separate intersection needed.
  const { data: shared, error: sharedError } = await supabase
    .from('channel_members')
    .select('channel_id, channels!inner(is_group)')
    .eq('user_id', other.id)
    .eq('channels.is_group', false);
  if (sharedError) throw sharedError;
  if (shared && shared.length > 0) return shared[0].channel_id;

  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .insert({ is_group: false })
    .select()
    .single();
  if (channelError) throw channelError;

  const { error: memberError } = await supabase
    .from('channel_members')
    .insert([
      { channel_id: channel.id, user_id: userData.user.id },
      { channel_id: channel.id, user_id: other.id },
    ]);
  if (memberError) throw memberError;

  return channel.id;
}

export interface DmSummary {
  channel_id: string;
  other_user: { id: string; username: string; display_name: string; avatar_url: string; accent_color_top: string; accent_color_bottom: string };
  last_message_preview: string;
  last_message_at: string | null;
}

export async function listMyDMs(): Promise<DmSummary[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  // Same RLS scoping as createOrGetDM: this only ever returns channels
  // I'm actually a member of.
  const { data: myChannels, error } = await supabase
    .from('channel_members')
    .select('channel_id, channels!inner(is_group)')
    .eq('user_id', userData.user.id)
    .eq('channels.is_group', false);
  if (error) throw error;
  const channelIds = (myChannels ?? []).map((r) => r.channel_id);
  if (channelIds.length === 0) return [];

  const { data: allMembers, error: membersError } = await supabase
    .from('channel_members')
    .select('channel_id, profiles!inner(id, username, display_name, avatar_url, accent_color_top, accent_color_bottom)')
    .in('channel_id', channelIds)
    .neq('user_id', userData.user.id);
  if (membersError) throw membersError;

  const { data: lastMessages } = await supabase
    .from('messages')
    .select('channel_id, body_rendered, media_type, created_at')
    .in('channel_id', channelIds)
    .order('created_at', { ascending: false });

  const lastByChannel = new Map<string, { preview: string; at: string }>();
  for (const m of lastMessages ?? []) {
    if (!lastByChannel.has(m.channel_id)) {
      lastByChannel.set(m.channel_id, { preview: m.media_type ? '📷 Photo' : m.body_rendered, at: m.created_at });
    }
  }

  return (allMembers ?? [])
    .map((row) => {
      const other = row.profiles as unknown as DmSummary['other_user'];
      const last = lastByChannel.get(row.channel_id);
      return {
        channel_id: row.channel_id,
        other_user: other,
        last_message_preview: last?.preview ?? 'No messages yet',
        last_message_at: last?.at ?? null,
      };
    })
    .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
}

export async function listMessages(channelId: string, limit = 50): Promise<(Message & { sender_username: string })[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, profiles!messages_sender_id_fkey(username)')
    .eq('channel_id', channelId)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const profile = row.profiles as unknown as { username: string } | null;
      return { ...row, sender_username: profile?.username ?? '?' };
    })
    .reverse();
}

export async function sendMessage(
  channelId: string,
  body: string,
  options?: {
    replyToId?: number;
    clientRef?: string;
    expiresInSeconds?: number;
    mediaUrl?: string;
    mediaType?: 'image' | 'audio';
  }
): Promise<Message> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const rendered = renderEmoji(body);
  const expiresAt = options?.expiresInSeconds
    ? new Date(Date.now() + options.expiresInSeconds * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      channel_id: channelId,
      sender_id: userData.user.id,
      body_raw: body,
      body_rendered: rendered,
      reply_to_id: options?.replyToId ?? null,
      client_ref: options?.clientRef ?? null,
      expires_at: expiresAt,
      media_url: options?.mediaUrl ?? null,
      media_type: options?.mediaType ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editMessage(messageId: number, body: string) {
  const rendered = renderEmoji(body);
  // RLS's "senders can edit own messages" policy is the actual
  // enforcement here — this call simply fails with a permissions error
  // if you don't own the message, no ownership check needed client-side.
  const { error } = await supabase
    .from('messages')
    .update({ body_raw: body, body_rendered: rendered, edited_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

export async function deleteMessage(messageId: number) {
  const { error } = await supabase.from('messages').update({ deleted: true }).eq('id', messageId);
  if (error) throw error;
}

export async function markRead(channelId: string, messageId: number) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { error } = await supabase
    .from('read_receipts')
    .upsert(
      { channel_id: channelId, user_id: userData.user.id, last_read_message_id: messageId },
      { onConflict: 'channel_id,user_id' }
    );
  if (error) throw error;
}

export async function getUnreadCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('channel_unread_counts');
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of data ?? []) out[row.channel_id] = row.unread;
  return out;
}
