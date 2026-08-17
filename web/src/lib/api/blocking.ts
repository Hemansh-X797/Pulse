import { supabase } from '../supabase';

export interface BlockedUser {
  blocked_id: string;
  created_at: string;
  profile: { username: string; display_name: string; avatar_url: string };
}

export async function blockUser(userId: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');
  const { error } = await supabase.from('blocked_users').insert({ blocker_id: userData.user.id, blocked_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');
  const { error } = await supabase.from('blocked_users').delete().eq('blocker_id', userData.user.id).eq('blocked_id', userId);
  if (error) throw error;
}

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id, created_at, profile:blocked_id(username, display_name, avatar_url)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, profile: row.profile as unknown as BlockedUser['profile'] }));
}
