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

  // Creating the channel + both membership rows can't be done as two
  // separate client-side inserts: "users can add themselves to a
  // channel" (channel_members INSERT policy) only allows
  // user_id = auth.uid(), so inserting the *other* user's membership
  // row from the client is rejected by RLS every time, and the whole
  // batch insert() fails with it. This RPC (006_fix_dm_creation_rls.sql)
  // does both inserts atomically as SECURITY DEFINER, with the
  // equivalent checks enforced inside the function body instead.
  const { data: channelId, error: rpcError } = await supabase.rpc('create_dm_channel', {
    other_user_id: other.id,
  });
  if (rpcError) throw rpcError;

  return channelId as string;
}

export interface DmSummary {
  channel_id: string;
  is_group: boolean;
  group_name: string;
  // 1:1 DMs have exactly one; group DMs can have several. Kept as an
  // array uniformly (rather than a separate `other_user` singular +
  // `members` plural field) so callers don't need two branches for
  // "which shape is this".
  other_users: { id: string; username: string; display_name: string; avatar_url: string; accent_color_top: string; accent_color_bottom: string }[];
  last_message_preview: string;
  last_message_at: string | null;
}

export async function listMyDMs(): Promise<DmSummary[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  // Same RLS scoping as createOrGetDM: this only ever returns channels
  // I'm actually a member of. No longer filters out is_group — that
  // filter used to hide every group DM from this list entirely, which
  // combined with there being no way to create one at all
  // (see 032_group_dm.sql) meant group DMs were completely
  // unreachable end to end.
  // My mistake in the group-DM rewrite: I dropped the old
  // `.eq('channels.is_group', false)` filter to stop excluding group
  // DMs, but that filter was *also* incidentally the only thing
  // keeping space channels out of this list — a space's text/voice
  // channels get channel_members rows too (see 001/002's
  // handle_new_server trigger), and they're is_group=false same as a
  // 1:1 DM, so removing that filter let every space channel I'm a
  // member of leak into the DM list. The actually-correct filter is on
  // server_id, not is_group: a DM (1:1 or group) always has
  // server_id = null, a space channel never does. This correctly
  // includes both DM kinds and excludes space channels regardless of
  // their is_group value.
  const { data: myChannels, error } = await supabase
    .from('channel_members')
    .select('channel_id, channels!inner(is_group, name, server_id)')
    .eq('user_id', userData.user.id)
    .is('channels.server_id', null);
  if (error) throw error;
  const channelMeta = new Map((myChannels ?? []).map((r) => [r.channel_id, r.channels as unknown as { is_group: boolean; name: string }]));
  const channelIds = [...channelMeta.keys()];
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

  const othersByChannel = new Map<string, DmSummary['other_users']>();
  for (const row of allMembers ?? []) {
    const profile = row.profiles as unknown as DmSummary['other_users'][number];
    const list = othersByChannel.get(row.channel_id) ?? [];
    list.push(profile);
    othersByChannel.set(row.channel_id, list);
  }

  return channelIds
    .map((channelId) => {
      const meta = channelMeta.get(channelId)!;
      const last = lastByChannel.get(channelId);
      return {
        channel_id: channelId,
        is_group: meta.is_group,
        group_name: meta.name,
        other_users: othersByChannel.get(channelId) ?? [],
        last_message_preview: last?.preview ?? 'No messages yet',
        last_message_at: last?.at ?? null,
      };
    })
    .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
}

/**
 * See 032_group_dm.sql for why this couldn't just be a client-side
 * insert (channel_members RLS only allows inserting your own
 * membership row). Requires at least 2 other members — with just one,
 * createOrGetDM already covers that (and dedupes to the existing 1:1).
 */
export async function createGroupDm(memberIds: string[], name?: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_dm', { p_member_ids: memberIds, p_name: name ?? null });
  if (error) throw error;
  return data as string;
}

export async function addGroupDmMember(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('add_group_dm_member', { p_channel_id: channelId, p_user_id: userId });
  if (error) throw error;
}

export async function leaveGroupDm(channelId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_group_dm', { p_channel_id: channelId });
  if (error) throw error;
}

export async function listMessages(channelId: string, limit = 50): Promise<(Message & { sender_username: string; sender_display_name: string; sender_avatar_url: string; sender_avatar_decoration: string | null; sender_name_style: { font?: string; effect?: string; colors?: string[] } | null })[]> {
  const { data, error } = await supabase
    .from('messages')
    // avatar_url wasn't selected here before, so the sender's profile
    // picture never made it into a message row at all — ChatView had no
    // choice but to always fall back to initials, even for users who do
    // have an avatar set. equipped_avatar_decoration has the same gap:
    // the column exists and the settings picker saves to it, but chat
    // never selected it, so a decoration you equipped never showed up
    // anywhere you'd actually see yourself chatting.
    .select('*, profiles!messages_sender_id_fkey(username, display_name, avatar_url, equipped_avatar_decoration, name_style)')
    .eq('channel_id', channelId)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const profile = row.profiles as unknown as { username: string; display_name: string; avatar_url: string | null; equipped_avatar_decoration: string | null; name_style: { font?: string; effect?: string; colors?: string[] } | null } | null;
      return {
        ...row,
        sender_username: profile?.username ?? '?',
        sender_display_name: profile?.display_name ?? profile?.username ?? '?',
        sender_avatar_url: profile?.avatar_url ?? '',
        sender_avatar_decoration: profile?.equipped_avatar_decoration ?? null,
        sender_name_style: profile?.name_style ?? null,
      };
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

/**
 * Mark a message and everything after it as unread, by rewinding this
 * channel's read_receipts row to the message immediately *before* the
 * target — channel_unread_counts() (001_initial_schema.sql) counts
 * anything with id > last_read_message_id as unread, so this is a real
 * state change the badge/count actually reads, not a client-only flag
 * that resets on reload.
 */
export async function markUnreadFrom(channelId: string, messageId: number) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { data: prevMessage, error: prevError } = await supabase
    .from('messages')
    .select('id')
    .eq('channel_id', channelId)
    .lt('id', messageId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prevError) throw prevError;

  const { error } = await supabase
    .from('read_receipts')
    .upsert(
      { channel_id: channelId, user_id: userData.user.id, last_read_message_id: prevMessage?.id ?? 0 },
      { onConflict: 'channel_id,user_id' }
    );
  if (error) throw error;
}

/**
 * "Mark as Read" for a whole space (right-click menu on a space icon) —
 * finds each of the space's channels' latest message and upserts a
 * read_receipts row for it, the same real, persisted mechanism
 * markRead() uses for a single channel. Not a client-only flag that
 * resets on reload — this is what channel_unread_counts() actually
 * reads.
 */
export async function markSpaceAsRead(spaceId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { data: channels, error: channelsError } = await supabase.from('channels').select('id').eq('space_id', spaceId);
  if (channelsError) throw channelsError;
  if (!channels || channels.length === 0) return;

  const results = await Promise.all(
    channels.map(async (c) => {
      const { data: latest } = await supabase
        .from('messages')
        .select('id')
        .eq('channel_id', c.id)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      return latest ? { channel_id: c.id, user_id: userData.user!.id, last_read_message_id: latest.id } : null;
    })
  );

  const rows = results.filter((r): r is { channel_id: string; user_id: string; last_read_message_id: number } => r !== null);
  if (rows.length === 0) return;

  const { error } = await supabase.from('read_receipts').upsert(rows, { onConflict: 'channel_id,user_id' });
  if (error) throw error;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export async function listMessageReactions(messageIds: number[]): Promise<Record<number, MessageReactionSummary[]>> {
  if (messageIds.length === 0) return {};
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('message_reactions').select('message_id, emoji, user_id').in('message_id', messageIds);
  if (error) throw error;

  const grouped: Record<number, Map<string, { count: number; reactedByMe: boolean }>> = {};
  for (const row of data ?? []) {
    grouped[row.message_id] ??= new Map();
    const entry = grouped[row.message_id].get(row.emoji) ?? { count: 0, reactedByMe: false };
    entry.count += 1;
    if (row.user_id === userData.user?.id) entry.reactedByMe = true;
    grouped[row.message_id].set(row.emoji, entry);
  }
  const out: Record<number, MessageReactionSummary[]> = {};
  for (const [messageId, map] of Object.entries(grouped)) {
    out[Number(messageId)] = Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
  }
  return out;
}

export async function toggleMessageReaction(messageId: number, emoji: string, currentlyReacted: boolean) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  if (currentlyReacted) {
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userData.user.id)
      .eq('emoji', emoji);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('message_reactions')
      .upsert({ message_id: messageId, user_id: userData.user.id, emoji }, { onConflict: 'message_id,user_id,emoji' });
    if (error) throw error;
  }
}

export interface PinnedMessage {
  message_id: number;
  pinned_at: string;
  pinned_by_username: string;
}

export async function listPinnedMessages(channelId: string): Promise<PinnedMessage[]> {
  const { data, error } = await supabase
    .from('pinned_messages')
    .select('message_id, pinned_at, profiles!pinned_messages_pinned_by_fkey(username)')
    .eq('channel_id', channelId)
    .order('pinned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    message_id: row.message_id,
    pinned_at: row.pinned_at,
    pinned_by_username: (row.profiles as unknown as { username: string } | null)?.username ?? '?',
  }));
}

export async function pinMessage(channelId: string, messageId: number) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');
  const { error } = await supabase
    .from('pinned_messages')
    .insert({ channel_id: channelId, message_id: messageId, pinned_by: userData.user.id });
  if (error) throw error;
}

export async function unpinMessage(messageId: number) {
  const { error } = await supabase.from('pinned_messages').delete().eq('message_id', messageId);
  if (error) throw error;
}

/**
 * Forward = send a new message with the same content into a different
 * channel — a real insert via the same sendMessage() path everything
 * else uses, not a client-only "shared with" label. body_raw is
 * prefixed with a "Forwarded" marker so it's clear at a glance in the
 * target channel that this wasn't typed there directly.
 */
export async function forwardMessage(targetChannelId: string, message: Message & { sender_username: string }): Promise<Message> {
  const prefix = `↪ Forwarded from @${message.sender_username}\n`;
  return sendMessage(targetChannelId, prefix + message.body_raw, {
    mediaUrl: message.media_url ?? undefined,
    mediaType: (message.media_type as 'image' | 'audio' | undefined) ?? undefined,
  });
}

/**
 * Read receipts for a DM — the `read_receipts` table (001_initial_schema.sql)
 * already tracks each member's own last-read pointer per channel, but it
 * was only ever read back for *your own* unread-count badge, never
 * surfaced to show the other person that you've seen their message —
 * so PalSpace had the data for a real "Seen" indicator the whole time
 * and nothing showed it. Only meaningful for 1:1 DMs (a space channel
 * can have many members, so "seen by" there is a different, group-style
 * feature — this intentionally doesn't try to be that).
 */
export async function getOtherDmParticipantId(channelId: string): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  // Group DMs have more than one "other" member, so "the other
  // person's last-read pointer" isn't a well-defined single value the
  // way it is for a 1:1 — rather than arbitrarily picking one member
  // and showing a "Seen" that's only true for them (misleading), this
  // returns null for a group and the Seen indicator just doesn't show
  // there at all.
  const { data: channel } = await supabase.from('channels').select('is_group').eq('id', channelId).maybeSingle();
  if (channel?.is_group) return null;
  const { data, error } = await supabase
    .from('channel_members')
    .select('user_id')
    .eq('channel_id', channelId)
    .neq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}

export async function getReadReceipt(channelId: string, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('read_receipts')
    .select('last_read_message_id')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.last_read_message_id ?? null;
}
