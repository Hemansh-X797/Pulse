import { supabase } from '../supabase';
import type { PulseNotification } from '../database.types';

export async function listNotifications(limit = 30): Promise<{ notifications: PulseNotification[]; unread: number }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const unread = (data ?? []).filter((n) => !n.read).length;
  return { notifications: data ?? [], unread };
}

export async function markNotificationRead(id: number) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userData.user.id)
    .eq('read', false);
  if (error) throw error;
}
