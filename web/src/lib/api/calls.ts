import { supabase } from '../supabase';

export interface CallParticipant {
  user_id: string;
  joined_at: string;
  left_at: string | null;
  muted: boolean;
  username: string;
  display_name: string;
  avatar_url: string;
}

export async function startOrJoinCall(channelId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_or_join_call', { p_channel_id: channelId });
  if (error) throw error;
  return data as string;
}

export async function leaveCall(callId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_call', { p_call_id: callId });
  if (error) throw error;
}

export async function setCallMuted(callId: string, muted: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_call_muted', { p_call_id: callId, p_muted: muted });
  if (error) throw error;
}

export async function getActiveCall(channelId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase.from('calls').select('id').eq('channel_id', channelId).is('ended_at', null).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCallParticipants(callId: string): Promise<CallParticipant[]> {
  const { data, error } = await supabase
    .from('call_participants')
    .select('user_id, joined_at, left_at, muted, profiles:user_id(username, display_name, avatar_url)')
    .eq('call_id', callId)
    .is('left_at', null);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const p = row.profiles as unknown as { username: string; display_name: string; avatar_url: string } | null;
    return {
      user_id: row.user_id,
      joined_at: row.joined_at,
      left_at: row.left_at,
      muted: row.muted,
      username: p?.username ?? '?',
      display_name: p?.display_name ?? '?',
      avatar_url: p?.avatar_url ?? '',
    };
  });
}
