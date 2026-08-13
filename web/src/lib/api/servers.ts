import { supabase } from '../supabase';
import type { Server, Channel } from '../database.types';

export async function createServer(name: string, accentTop?: string, accentBottom?: string): Promise<Server> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  // Owner-membership + default #general channel both happen via the
  // on_server_created trigger in supabase/schema.sql — this insert is
  // the only call the client needs to make, same as the C++ server's
  // POST /servers handler doing both in one request handler.
  const { data, error } = await supabase
    .from('servers')
    .insert({
      name,
      owner_id: userData.user.id,
      accent_color_top: accentTop ?? '#5865F2',
      accent_color_bottom: accentBottom ?? '#EB459E',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listMyServers(): Promise<Server[]> {
  const { data, error } = await supabase.from('servers').select('*').order('created_at', { ascending: true });
  if (error) throw error; // RLS already scopes this to servers you're a member of
  return data;
}

export async function listServerChannels(serverId: string): Promise<Channel[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('server_id', serverId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createServerChannel(serverId: string, name: string): Promise<Channel> {
  const { count } = await supabase
    .from('channels')
    .select('*', { count: 'exact', head: true })
    .eq('server_id', serverId);

  const { data, error } = await supabase
    .from('channels')
    .insert({ server_id: serverId, name, is_group: true, position: count ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function joinServerByInvite(inviteCode: string): Promise<Server> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const { data: server, error: findError } = await supabase
    .from('servers')
    .select('*')
    .eq('invite_code', inviteCode)
    .maybeSingle();
  if (findError) throw findError;
  if (!server) throw new Error('invalid invite code');

  // Channel access for every existing channel is granted by the
  // on_server_member_added trigger — same fix that was applied to the
  // C++ version after it was caught missing this step.
  const { error: joinError } = await supabase
    .from('server_members')
    .insert({ server_id: server.id, user_id: userData.user.id });
  if (joinError) throw joinError;

  return server;
}
