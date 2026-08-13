import { supabase } from '../supabase';

// This file replaces server/src/auth/oauth.hpp and
// server/src/common/https_client.hpp entirely. That was ~250 lines of
// hand-built OpenSSL TLS client + Google/Discord token-exchange logic.
// Supabase Auth does the whole authorization-code flow itself — you
// register the provider once in the Supabase dashboard (see
// docs/SUPABASE_SETUP.md) and it's just these two lines per provider.

export async function signUpWithPassword(email: string, password: string, username: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user() trigger in supabase/schema.sql,
      // which creates the profiles row — same moment the C++ version's
      // create_user() ran, just triggered by Postgres instead of app code.
      data: { username, display_name: displayName },
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/home` },
  });
  if (error) throw error;
}

export async function signInWithDiscord() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: `${window.location.origin}/home` },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
