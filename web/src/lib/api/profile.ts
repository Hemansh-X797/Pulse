import { supabase } from '../supabase';
import type { Profile } from '../database.types';

export async function getMyProfile(): Promise<Profile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('not authenticated');

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userData.user.id).single();
  if (error) throw error;
  return data;
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('username', username).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id' | 'username' | 'created_at'>>): Promise<Profile> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userData.user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
