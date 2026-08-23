import { supabase } from '../supabase';
import type { Profile } from '../database.types';

export type FriendProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'accent_color_top' | 'accent_color_bottom' | 'status_text'>;

const FRIEND_PROFILE_FIELDS = 'id, username, display_name, avatar_url, accent_color_top, accent_color_bottom, status_text';

export async function searchUsers(query: string): Promise<FriendProfile[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .select(FRIEND_PROFILE_FIELDS)
    .ilike('username', `%${trimmed}%`)
    .neq('id', userData.user?.id ?? '')
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

/**
 * Uses the send_friend_request RPC (019_mutual_friends_and_request_fix.sql)
 * rather than a plain insert — this is what fixes the simultaneous-
 * request bug: if the other person already sent *you* a pending
 * request, this accepts that one instead of creating a confusing
 * second pending row in the opposite direction. The return value tells
 * the UI which of those happened, so it can show "you're already
 * friends now" instead of a generic "request sent".
 */
export async function sendFriendRequest(recipientId: string): Promise<'sent' | 'already_friends'> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_recipient_id: recipientId });
  if (error) throw error;
  return data as 'sent' | 'already_friends';
}

export async function cancelFriendRequest(requestId: number) {
  const { error } = await supabase.from('friend_requests').delete().eq('id', requestId);
  if (error) throw error;
}

export async function respondToFriendRequest(requestId: number, accept: boolean) {
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}

export async function listFriends(): Promise<FriendProfile[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  // friends_view is already normalized to (user_id, friend_id) from
  // migration 004 — one simple filter here instead of a UNION query.
  const { data: rows, error } = await supabase.from('friends_view').select('friend_id').eq('user_id', userData.user.id);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.friend_id);
  if (ids.length === 0) return [];

  const { data, error: profilesError } = await supabase.from('profiles').select(FRIEND_PROFILE_FIELDS).in('id', ids);
  if (profilesError) throw profilesError;
  return data ?? [];
}

/**
 * Mutual friends between me and another user, via the
 * get_mutual_friends RPC (019_mutual_friends_and_request_fix.sql) —
 * needed as a SECURITY DEFINER function since friend lists are
 * private-by-RLS; this only ever reveals the intersection, not either
 * person's full list.
 */
export async function getMutualFriends(otherUserId: string): Promise<FriendProfile[]> {
  const { data, error } = await supabase.rpc('get_mutual_friends', { other_user_id: otherUserId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.friend_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    accent_color_top: row.accent_color_top,
    accent_color_bottom: row.accent_color_bottom,
    status_text: '',
  }));
}

export interface IncomingRequest {
  id: number;
  created_at: string;
  sender: FriendProfile;
}

export async function listIncomingRequests(): Promise<IncomingRequest[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from('friend_requests')
    .select(`id, created_at, sender:sender_id(${FRIEND_PROFILE_FIELDS})`)
    .eq('status', 'pending')
    .eq('recipient_id', userData.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    sender: row.sender as unknown as FriendProfile,
  }));
}

export interface OutgoingRequest {
  id: number;
  created_at: string;
  recipient: FriendProfile;
}

export async function listOutgoingRequests(): Promise<OutgoingRequest[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from('friend_requests')
    .select(`id, created_at, recipient:recipient_id(${FRIEND_PROFILE_FIELDS})`)
    .eq('status', 'pending')
    .eq('sender_id', userData.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    recipient: row.recipient as unknown as FriendProfile,
  }));
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', { p_username: username });
  if (error) throw error;
  return Boolean(data);
}
