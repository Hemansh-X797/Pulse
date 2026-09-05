import { supabase } from './supabase';

export interface ProfileDecorDef {
  id: string;
  label: string;
  icon: string;
  is_animated: boolean;
  category: string;
}

/**
 * Renamed from "nameplate" to "Profile Decor" throughout the product —
 * the table itself is still `nameplate_catalog` at the DB level (see
 * 034_decoration_catalogs.sql for why renaming the table felt riskier
 * than renaming what the UI calls it), but every user-facing label and
 * every piece of app code from here up refers to this as Profile Decor.
 * Was a hardcoded array of 7 entries; now DB-backed for the same
 * scale-to-hundreds reason as avatar decorations.
 */
export async function listProfileDecorCatalog(): Promise<ProfileDecorDef[]> {
  const { data, error } = await supabase.from('nameplate_catalog').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
