-- Root cause of "a DM takes ~2 minutes to appear in my list" and
-- "creating a space is slow to show up": channel_members, channels,
-- space_members, and spaces were never added to the supabase_realtime
-- publication in any prior migration (only messages, notifications,
-- and stories were — see 001_initial_schema.sql and
-- 005_blocking_notification_prefs_stories.sql). Postgres's logical
-- replication simply never broadcast changes on these tables, so no
-- amount of client-side subscription code could have worked — the
-- sidebar's DM/space lists only ever updated on whatever incidentally
-- triggered a React Query refetch (window focus, navigation,
-- remount), which is exactly the multi-minute-feeling delay reported.
--
-- RLS still applies to realtime the same as it does to normal selects
-- — a client only receives change events for rows their own policies
-- would let them see — so this doesn't expose anything that wasn't
-- already readable.

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_members'
    ) then
        alter publication supabase_realtime add table public.channel_members;
    end if;

    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channels'
    ) then
        alter publication supabase_realtime add table public.channels;
    end if;

    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'space_members'
    ) then
        alter publication supabase_realtime add table public.space_members;
    end if;

    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'spaces'
    ) then
        alter publication supabase_realtime add table public.spaces;
    end if;
end $$;
