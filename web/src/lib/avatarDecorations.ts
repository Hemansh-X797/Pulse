import { supabase } from './supabase';

export interface AvatarDecorationDef {
  id: string;
  label: string;
  icon: string;
  is_animated: boolean;
  category: string;
}

/**
 * Was a hardcoded array of ~6 entries; now backed by
 * avatar_decoration_catalog (034_decoration_catalogs.sql) so it scales
 * to hundreds without a code deploy per addition. Callers should wrap
 * this in a react-query useQuery with a long staleTime — it's curated
 * content that essentially never changes mid-session.
 */
export async function listAvatarDecorationCatalog(): Promise<AvatarDecorationDef[]> {
  const { data, error } = await supabase.from('avatar_decoration_catalog').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
