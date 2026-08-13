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

  // Simple approach: always create a fresh channel. A production version
  // would check for an existing 1:1 channel between these two users
  // first (same as the C++ version arguably should have — it didn't
  // dedupe either, worth fixing in both places together).
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
