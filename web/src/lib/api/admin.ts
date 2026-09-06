import { supabase } from '../supabase';

export interface AdminStats {
  total_users: number;
  total_posts: number;
  total_spaces: number;
  total_messages: number;
  signups_last_7d: number;
}

export interface AdminUserRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
  status?: string;
}

/**
 * Checks the caller's own admin status via app_admins' narrow RLS
 * policy (you can only ever see your own row there — see
 * 036_app_admins.sql) rather than trusting anything client-side. Used
 * both to decide whether to show the admin panel link at all, and
 * every admin_* RPC below re-checks this itself server-side too, so
 * hiding the link is a UX nicety, not the actual security boundary.
 */
export async function amIAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_app_admin');
  if (error) throw error;
  return !!data;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_get_stats');
  if (error) throw error;
  const row = data?.[0];
  return row ?? { total_users: 0, total_posts: 0, total_spaces: 0, total_messages: 0, signups_last_7d: 0 };
}

export async function adminSearchUsers(query: string): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('admin_search_users', { p_query: query });
  if (error) throw error;
  return data ?? [];
}

export async function adminListRecentSignups(limit = 20): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('admin_list_recent_signups', { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}
