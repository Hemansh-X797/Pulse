import { supabase } from '../supabase';
import type { Space, Topic } from '../database.types';

// Renamed from servers.ts as part of the "servers" -> "spaces" and
// "channels" (within a space) -> "topics" rebrand. The underlying
// Postgres tables were renamed to match via
// supabase/migrations/002_rename_servers_to_spaces.sql — run that
// migration before deploying this file. The shared `channels` table
// (also used for DMs) keeps its DB name; only the space-scoped rows in
// it are now labeled "Topic" in the UI and types layer.

export async function createSpace(name: string, accentTop?: string, accentBottom?: string): Promise<Space> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  // on_space_created trigger in supabase/migrations/002_rename_servers_to_spaces.sql
  // creates the default "general" topic + owner membership row in the
  // same transaction as this insert.
  const { data, error } = await supabase
    .from('spaces')
    .insert({
      name,
      owner_id: userData.user.id,
      accent_color_top: accentTop ?? '#6366f1',
      accent_color_bottom: accentBottom ?? '#ec4899',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listMySpaces(): Promise<Space[]> {
  const { data, error } = await supabase.from('spaces').select('*').order('created_at', { ascending: true });
  if (error) throw error; // RLS already scopes this to spaces you're a member of
  return data ?? [];
}

export async function listSpaceTopics(spaceId: string): Promise<Topic[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('space_id', spaceId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createSpaceTopic(spaceId: string, name: string): Promise<Topic> {
  const { count } = await supabase
    .from('channels')
    .select('*', { count: 'exact', head: true })
    .eq('space_id', spaceId);

  const { data, error } = await supabase
    .from('channels')
    .insert({ space_id: spaceId, name, is_group: true, position: count ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function joinSpaceByInvite(inviteCode: string): Promise<Space> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { data: space, error: findError } = await supabase
    .from('spaces')
    .select('*')
    .eq('invite_code', inviteCode)
    .maybeSingle();
  if (findError) throw findError;
  if (!space) throw new Error('invalid invite code');

  // on_space_member_added trigger handles welcome-notification fanout.
  const { error: joinError } = await supabase
    .from('space_members')
    .insert({ space_id: space.id, user_id: userData.user.id, role: 'member' });
  if (joinError) throw joinError;

  return space;
}

// --- Ownership / leave-and-delete rules ---
// A space with more than one real (non-bot) member cannot be deleted by
// its owner directly — ownership must be transferred first. A space with
// exactly one real member must be deleted (not "left") by that member.
// See supabase/migrations/002_rename_servers_to_spaces.sql for the
// `can_delete_space()` / `transfer_space_ownership()` RPCs this wraps.

export async function transferSpaceOwnership(spaceId: string, newOwnerUserId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_space_ownership', {
    p_space_id: spaceId,
    p_new_owner: newOwnerUserId,
  });
  if (error) throw error;
}

export async function leaveOrDeleteSpace(spaceId: string): Promise<{ deleted: boolean }> {
  const { data, error } = await supabase.rpc('leave_or_delete_space', { p_space_id: spaceId });
  if (error) throw error;
  // The RPC enforces the rule server-side (in Postgres) rather than trusting
  // the client: sole real member => forced delete, multiple real members with
  // you as owner => refuses until you transfer ownership first.
  return { deleted: Boolean((data as { deleted: boolean } | null)?.deleted) };
}

export async function listSpaceMembers(spaceId: string) {
  const { data, error } = await supabase
    .from('space_members')
    .select('user_id, role, joined_at, profiles:user_id(username, display_name, avatar_url)')
    .eq('space_id', spaceId);
  if (error) throw error;
  return data ?? [];
}
