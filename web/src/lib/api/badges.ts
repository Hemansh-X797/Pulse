import { supabase } from '../supabase';

export interface ProfileBadge {
  id: string;
  label: string;
  description: string;
  icon: string;
  granted_at: string;
}

/**
 * Badges are never client-writable (see 031_badges_founding_member.sql's
 * RLS note — no insert/update/delete policy exists for `authenticated`
 * on either table), so this is read-only by design.
 */
export async function listProfileBadges(userId: string): Promise<ProfileBadge[]> {
  const { data, error } = await supabase
    .from('profile_badges')
    .select('granted_at, badges(id, label, description, icon)')
    .eq('profile_id', userId)
    .order('granted_at', { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((row) => {
      const badge = row.badges as unknown as { id: string; label: string; description: string; icon: string } | null;
      if (!badge) return null;
      return { ...badge, granted_at: row.granted_at };
    })
    .filter((b): b is ProfileBadge => b !== null);
}
