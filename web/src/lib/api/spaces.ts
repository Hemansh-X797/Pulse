import { supabase } from '../supabase';
import type { Space, Topic } from '../database.types';

// Renamed from servers.ts as part of the "servers" -> "spaces" and
// "channels" (within a space) -> "topics" rebrand. The underlying
// Postgres tables were renamed to match via
// supabase/migrations/002_rename_servers_to_spaces.sql — run that
// migration before deploying this file. The shared `channels` table
// (also used for DMs) keeps its DB name; only the space-scoped rows in
// it are now labeled "Topic" in the UI and types layer.

export async function createSpace(
  name: string,
  opts?: { accentTop?: string; accentBottom?: string; isPrivate?: boolean; tags?: string[] }
): Promise<Space> {
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
      accent_color_top: opts?.accentTop ?? '#6366f1',
      accent_color_bottom: opts?.accentBottom ?? '#ec4899',
      // Private by default — matches how every space before this
      // feature existed (invite-only), so opting into public/Explore
      // visibility has to be a deliberate choice, not an accidental
      // default.
      is_private: opts?.isPrivate ?? true,
      tags: opts?.tags ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Public spaces for the Explore page / onboarding's starter-space
 * suggestions. RLS (011_onboarding_and_public_spaces.sql) already
 * restricts what comes back to is_private = false rows, so this
 * doesn't need to (and shouldn't) filter that client-side too.
 */
export async function listPublicSpaces(matchTags?: string[]): Promise<Space[]> {
  let query = supabase.from('spaces').select('*').eq('is_private', false);
  if (matchTags && matchTags.length > 0) {
    // overlaps: any shared tag counts as a match. Falls back to "all
    // public spaces" below if this returns nothing, rather than
    // showing an empty Explore page to someone whose interests don't
    // overlap with any tagged space yet.
    query = query.overlaps('tags', matchTags);
  }
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  if ((data ?? []).length === 0 && matchTags && matchTags.length > 0) {
    return listPublicSpaces();
  }
  return data ?? [];
}

/**
 * Join a public space directly (no invite code needed) — from Explore
 * or onboarding's suggestions. The space_members INSERT policy only
 * ever checked `user_id = auth.uid()` (see 001_initial_schema.sql), so
 * this doesn't need a new RLS policy or RPC: the same self-insert
 * permission that makes joinSpaceByInvite work below already covers
 * this, since the caller only ever got the target space's id from a
 * query RLS already scoped to is_private = false rows.
 */
export async function joinPublicSpace(spaceId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');
  const { error } = await supabase.from('space_members').insert({ space_id: spaceId, user_id: userData.user.id, role: 'member' });
  if (error) throw error;
}

export async function listMySpaces(): Promise<Space[]> {
  const { data, error } = await supabase.from('spaces').select('*').order('created_at', { ascending: true });
  if (error) throw error; // RLS already scopes this to spaces you're a member of
  return data ?? [];
}

export async function getSpace(spaceId: string): Promise<Space> {
  const { data, error } = await supabase.from('spaces').select('*').eq('id', spaceId).single();
  if (error) throw error;
  return data;
}

/** Direct update, gated by a real RLS UPDATE policy added alongside
 * this (023_space_description.sql — there was no UPDATE policy on
 * spaces at all before that, checked directly rather than assumed;
 * without it this would have silently done nothing). Owner-only for
 * now; a manage_space permission on a custom role isn't wired to this
 * specific action yet. */
export async function updateSpace(spaceId: string, patch: { name?: string; description?: string; accent_color_top?: string; accent_color_bottom?: string }): Promise<Space> {
  const { data, error } = await supabase.from('spaces').update(patch).eq('id', spaceId).select().single();
  if (error) throw error;
  return data;
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

export async function createSpaceTopic(spaceId: string, name: string, categoryId?: string | null): Promise<Topic> {
  // Now goes through create_space_channel (022_space_roles_permissions_categories.sql),
  // which checks manage_channels — the old version was a plain client
  // insert with no permission check at all, meaning any space member
  // could create topics regardless of role. Only the auto-created
  // Admin role (the owner, by default) has manage_channels until the
  // owner grants it to a custom role, per your exact spec.
  const { data: channelId, error } = await supabase.rpc('create_space_channel', {
    p_space_id: spaceId,
    p_name: name,
    p_kind: 'text',
    p_category_id: categoryId ?? null,
  });
  if (error) throw error;
  const { data, error: fetchError } = await supabase.from('channels').select('*').eq('id', channelId).single();
  if (fetchError) throw fetchError;
  return data;
}

export async function reorderSpaceTopic(channelId: string, newPosition: number): Promise<void> {
  const { error } = await supabase.rpc('reorder_space_channel', { p_channel_id: channelId, p_new_position: newPosition });
  if (error) throw error;
}

// ---------- categories ----------
export interface SpaceCategory {
  id: string;
  space_id: string;
  name: string;
  position: number;
  created_at: string;
}

export async function listSpaceCategories(spaceId: string): Promise<SpaceCategory[]> {
  const { data, error } = await supabase.from('space_categories').select('*').eq('space_id', spaceId).order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createSpaceCategory(spaceId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_space_category', { p_space_id: spaceId, p_name: name });
  if (error) throw error;
  return data as string;
}

// ---------- roles & permissions ----------
export interface SpaceRolePermissions {
  [key: string]: boolean | undefined;
  manage_space?: boolean;
  manage_roles?: boolean;
  manage_channels?: boolean;
  manage_messages?: boolean;
  kick_members?: boolean;
  ban_members?: boolean;
  create_invites?: boolean;
}

export interface SpaceRole {
  id: string;
  space_id: string;
  name: string;
  color: string;
  permissions: SpaceRolePermissions;
  position: number;
  is_default: boolean;
  created_at: string;
}

export async function listSpaceRoles(spaceId: string): Promise<SpaceRole[]> {
  const { data, error } = await supabase.from('space_roles').select('*').eq('space_id', spaceId).order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SpaceRole[];
}

export async function createSpaceRole(spaceId: string, name: string, color?: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_space_role', { p_space_id: spaceId, p_name: name, p_color: color ?? '#99aab5' });
  if (error) throw error;
  return data as string;
}

export async function updateSpaceRolePermissions(roleId: string, permissions: SpaceRolePermissions): Promise<void> {
  const { error } = await supabase.rpc('update_space_role_permissions', { p_role_id: roleId, p_permissions: permissions as Record<string, boolean> });
  if (error) throw error;
}

export async function deleteSpaceRole(roleId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_space_role', { p_role_id: roleId });
  if (error) throw error;
}

export async function assignSpaceRole(spaceId: string, targetUserId: string, roleId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_space_role', { p_space_id: spaceId, p_target_user_id: targetUserId, p_role_id: roleId });
  if (error) throw error;
}

export async function unassignSpaceRole(spaceId: string, targetUserId: string, roleId: string): Promise<void> {
  const { error } = await supabase.rpc('unassign_space_role', { p_space_id: spaceId, p_target_user_id: targetUserId, p_role_id: roleId });
  if (error) throw error;
}

export async function listMemberRoleAssignments(spaceId: string): Promise<{ user_id: string; role_id: string }[]> {
  const { data, error } = await supabase.from('space_member_roles').select('user_id, role_id').eq('space_id', spaceId);
  if (error) throw error;
  return data ?? [];
}

export async function hasSpacePermission(spaceId: string, permission: string): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data, error } = await supabase.rpc('space_member_has_permission', {
    p_space_id: spaceId,
    p_user_id: userData.user.id,
    p_permission: permission,
  });
  if (error) throw error;
  return !!data;
}

// ---------- kick / ban ----------
export interface SpaceBan {
  space_id: string;
  user_id: string;
  banned_by: string;
  reason: string;
  created_at: string;
}

export async function kickSpaceMember(spaceId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc('kick_space_member', { p_space_id: spaceId, p_target_user_id: targetUserId });
  if (error) throw error;
}

export async function banSpaceMember(spaceId: string, targetUserId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('ban_space_member', { p_space_id: spaceId, p_target_user_id: targetUserId, p_reason: reason ?? '' });
  if (error) throw error;
}

export async function unbanSpaceMember(spaceId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc('unban_space_member', { p_space_id: spaceId, p_target_user_id: targetUserId });
  if (error) throw error;
}

export async function listSpaceBans(spaceId: string): Promise<(SpaceBan & { username: string; display_name: string })[]> {
  const { data, error } = await supabase
    .from('space_bans')
    .select('*, profiles:user_id(username, display_name)')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const p = row.profiles as unknown as { username: string; display_name: string } | null;
    return { ...row, username: p?.username ?? '?', display_name: p?.display_name ?? '?' };
  });
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
