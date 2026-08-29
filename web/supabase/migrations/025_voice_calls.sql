-- Voice calls (B10). A call happens *in* a channel — either a DM
-- channel or a voice-kind space channel (channels.kind = 'voice',
-- added in 022_space_roles_permissions_categories.sql) — so this
-- reuses the existing channels table as the scope, rather than
-- inventing a parallel "call room" concept.

create table public.calls (
    id         uuid primary key default gen_random_uuid(),
    channel_id uuid not null references public.channels(id) on delete cascade,
    started_by uuid not null references public.profiles(id) on delete set null,
    started_at timestamptz not null default now(),
    ended_at   timestamptz
);

alter table public.calls enable row level security;

create table public.call_participants (
    call_id   uuid not null references public.calls(id) on delete cascade,
    user_id   uuid not null references public.profiles(id) on delete cascade,
    joined_at timestamptz not null default now(),
    left_at   timestamptz,
    muted     boolean not null default false,
    primary key (call_id, user_id)
);

alter table public.call_participants enable row level security;

-- Visible to members of the channel the call is in — same is_channel_member
-- helper used everywhere else (007_fix_channel_members_rls_recursion.sql),
-- so this doesn't need its own recursion-prone policy.
create policy "channel members can view calls"
    on public.calls for select
    using (public.is_channel_member(channel_id, auth.uid()));

create policy "channel members can view call participants"
    on public.call_participants for select
    using (exists (
        select 1 from public.calls c
        where c.id = call_participants.call_id
        and public.is_channel_member(c.channel_id, auth.uid())
    ));

-- ---------- start / join / leave, as RPCs rather than raw inserts ----------
-- Reuses an already-active call in the channel instead of creating a
-- second concurrent one if someone starts a call in a channel that
-- already has one running (e.g. two people click "Start Call" within
-- the same second) — returns the existing call_id in that case.
create or replace function public.start_or_join_call(p_channel_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_call_id uuid;
    v_participant_count integer;
begin
    if not public.is_channel_member(p_channel_id, auth.uid()) then
        raise exception 'not a member of this channel';
    end if;

    select id into v_call_id from public.calls where channel_id = p_channel_id and ended_at is null limit 1;

    if v_call_id is null then
        insert into public.calls (channel_id, started_by) values (p_channel_id, auth.uid()) returning id into v_call_id;
    else
        -- Mesh topology (no SFU/media server — see plan.md's B10 note
        -- on why) genuinely degrades past a small group, so this caps
        -- it here rather than letting the UI silently get worse.
        select count(*) into v_participant_count from public.call_participants where call_id = v_call_id and left_at is null;
        if v_participant_count >= 6 then
            raise exception 'call is full (max 6 participants)';
        end if;
    end if;

    insert into public.call_participants (call_id, user_id)
    values (v_call_id, auth.uid())
    on conflict (call_id, user_id) do update set left_at = null, joined_at = now();

    return v_call_id;
end;
$$;

grant execute on function public.start_or_join_call(uuid) to authenticated;

create or replace function public.leave_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_remaining integer;
begin
    update public.call_participants set left_at = now() where call_id = p_call_id and user_id = auth.uid();

    select count(*) into v_remaining from public.call_participants where call_id = p_call_id and left_at is null;
    if v_remaining = 0 then
        update public.calls set ended_at = now() where id = p_call_id and ended_at is null;
    end if;
end;
$$;

grant execute on function public.leave_call(uuid) to authenticated;

create or replace function public.set_call_muted(p_call_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.call_participants set muted = p_muted where call_id = p_call_id and user_id = auth.uid();
end;
$$;

grant execute on function public.set_call_muted(uuid, boolean) to authenticated;

-- Realtime: needed for the call bar to update live as people join/
-- leave/mute — same lesson as 018_realtime_membership_tables.sql,
-- adding these explicitly rather than assuming a table is already in
-- the publication.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls'
    ) then
        alter publication supabase_realtime add table public.calls;
    end if;
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_participants'
    ) then
        alter publication supabase_realtime add table public.call_participants;
    end if;
end $$;
