import { supabase } from '../supabase';
import type { Database } from '../database.types';

type Prefs = Database['public']['Tables']['notification_preferences']['Row'];

export async function getNotificationPreferences(): Promise<Prefs | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', userData.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateNotificationPreferences(
  patch: Partial<Pick<Prefs, 'messages' | 'reactions' | 'comments' | 'friend_requests' | 'space_invites' | 'notifications_enabled'>>
) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');
  const { error } = await supabase
    .from('notification_preferences')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userData.user.id);
  if (error) throw error;
}
