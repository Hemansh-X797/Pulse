-- Presence: Online / Do Not Disturb / Invisible is the person's own
-- chosen status (persisted, survives reconnects/reloads). Actual
-- connection state (are they connected right now at all) stays
-- ephemeral via Supabase Realtime's presence feature — this column is
-- only the preference layered on top of that, same distinction Discord
-- draws between "set your status" and "are you actually connected."
alter table public.profiles
    add column if not exists status text not null default 'online'
    check (status in ('online', 'dnd', 'invisible'));
