-- Presence (020_presence_status.sql) is purely ephemeral — it lives in
-- Supabase Realtime's in-memory presence channel and tells you who's
-- online *right now*, but nothing persisted when someone was last
-- around, so there was no way to show "last seen 2h ago" for someone
-- who's currently offline. This column is that persisted timestamp,
-- updated by the client on a heartbeat while a session is open (see
-- usePresenceSync.ts) rather than on disconnect, since a disconnecting
-- client can't reliably run one more write on its way out.
alter table public.profiles
    add column if not exists last_seen_at timestamptz;

-- RLS: readable by anyone who can already read the profile (existing
-- "profiles are publicly readable" policy from 001_initial_schema.sql
-- already covers select on the whole row, so no new policy needed here
-- — only called out for clarity that this isn't a fresh table).
