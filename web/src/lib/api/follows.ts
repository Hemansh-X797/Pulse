import { supabase } from '../supabase';

export interface FollowProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  accent_color_top: string;
  accent_color_bottom: string;
}

export async function followUser(userId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');
  const { error } = await supabase.from('follows').insert({ follower_id: userData.user.id, followed_id: userId });
  if (error) throw error;
}

export async function unfollowUser(userId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');
  const { error } = await supabase.from('follows').delete().eq('follower_id', userData.user.id).eq('followed_id', userId);
  if (error) throw error;
}

export async function isFollowing(userId: string): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', userData.user.id)
    .eq('followed_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followers, following] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', userId),
    supabase.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  if (followers.error) throw followers.error;
  if (following.error) throw following.error;
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

export async function listFollowers(userId: string): Promise<FollowProfile[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, accent_color_top, accent_color_bottom)')
    .eq('followed_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.profiles as unknown as FollowProfile).filter(Boolean);
}

export async function listFollowing(userId: string): Promise<FollowProfile[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('profiles!follows_followed_id_fkey(id, username, display_name, avatar_url, accent_color_top, accent_color_bottom)')
    .eq('follower_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.profiles as unknown as FollowProfile).filter(Boolean);
}
