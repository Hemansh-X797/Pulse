-- Channel streaks — Snapchat's single most effective retention mechanic,
-- and one that's genuinely well-suited to a friend-group chat app: it's
-- not about content quality, it's about not being the one who breaks the
-- chain with your friend(s). Deliberately scoped to DMs and group DMs
-- only (space_id is null) — a streak across a 200-person space channel
-- is meaningless noise, but "you and Alex have talked every day for 47
-- days straight" is a real, specific thing worth coming back for.
--
-- Follows the same pattern as badges/app_admins/decoration catalogs
-- (031/034/036): computed and written entirely server-side via a
-- SECURITY DEFINER trigger, with zero client-write policy, so nobody can
-- fake a streak by writing to the table directly. The client only ever
-- reads it.

create table public.channel_streaks (
    channel_id       uuid primary key references public.channels(id) on delete cascade,
    -- The current run length, in consecutive calendar days, where every
    -- member of the channel has sent at least one message.
    current_streak   integer not null default 0,
    longest_streak   integer not null default 0,
    -- The last calendar date (UTC) on which the streak condition was
    -- fully satisfied — i.e. every member had sent at least one message
    -- that day. Distinct from today_date below: this only advances once
    -- the *whole* channel has participated, not just whoever's sent so
    -- far today.
    last_completed_date date,
    -- Which calendar date today_senders applies to, and who's sent so
    -- far *today* specifically — reset whenever the date rolls over.
    today_date       date,
    today_senders    uuid[] not null default '{}',
    updated_at       timestamptz not null default now()
);

alter table public.channel_streaks enable row level security;

-- Read-only for channel members; no insert/update/delete policy for
-- `authenticated` at all — same tamper-proof pattern as app_admins and
-- the decoration/badge catalogs. The only writer is the trigger function
-- below, which runs as SECURITY DEFINER and therefore bypasses RLS
-- entirely, so this table needs no write policy to function correctly.
create policy "channel members can view their streak"
    on public.channel_streaks for select
    using (
        channel_id in (select channel_id from public.channel_members where user_id = auth.uid())
    );

create or replace function public.handle_message_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_space_id     uuid;
    v_member_count integer;
    v_member_ids   uuid[];
    v_today        date := (now() at time zone 'utc')::date;
    v_row          public.channel_streaks;
begin
    -- Only DMs and group DMs get a streak — see comment above the table.
    select space_id into v_space_id from public.channels where id = new.channel_id;
    if v_space_id is not null then
        return new;
    end if;

    select array_agg(user_id) into v_member_ids
    from public.channel_members
    where channel_id = new.channel_id;
    v_member_count := coalesce(array_length(v_member_ids, 1), 0);

    -- A "streak" needs at least two people actually going back and
    -- forth — a channel with only one member (shouldn't normally exist,
    -- but defensively) can't meaningfully have one.
    if v_member_count < 2 then
        return new;
    end if;

    select * into v_row from public.channel_streaks where channel_id = new.channel_id for update;
    -- `for update` locks this one row (not the whole table) for the rest
    -- of this transaction — cheap in practice, since two messages to the
    -- exact same channel at the literal same instant are rare, but
    -- without it, two near-simultaneous sends could both read the same
    -- "not yet completed today" state and each think they're the one
    -- completing it, silently corrupting the count. At the scale this is
    -- meant to run at, "silently wrong sometimes" is worse than "briefly
    -- serialized sometimes."
    if not found then
        insert into public.channel_streaks (channel_id, today_date, today_senders)
        values (new.channel_id, v_today, array[new.sender_id])
        returning * into v_row;
    else
        if v_row.today_date is distinct from v_today then
            -- Calendar day rolled over since the last message — start a
            -- fresh tally for today regardless of how yesterday ended;
            -- whether the streak itself continues or resets is decided
            -- below, purely from last_completed_date vs. today.
            v_row.today_date := v_today;
            v_row.today_senders := array[new.sender_id];
        elsif not (new.sender_id = any(v_row.today_senders)) then
            v_row.today_senders := v_row.today_senders || new.sender_id;
        end if;
    end if;

    -- Full participation for today, and today hasn't already been
    -- counted (guards against re-incrementing on every message after
    -- the streak condition is first met for the day).
    if v_row.today_senders @> v_member_ids and v_row.last_completed_date is distinct from v_today then
        if v_row.last_completed_date = v_today - interval '1 day' then
            v_row.current_streak := v_row.current_streak + 1;
        else
            -- Either the very first completed day, or there was a gap
            -- (a day with less than full participation) since the last
            -- completed one — the chain was broken, so this restarts it
            -- at 1 rather than continuing a count that isn't real.
            v_row.current_streak := 1;
        end if;
        v_row.last_completed_date := v_today;
        v_row.longest_streak := greatest(v_row.longest_streak, v_row.current_streak);
    end if;

    update public.channel_streaks set
        current_streak = v_row.current_streak,
        longest_streak = v_row.longest_streak,
        last_completed_date = v_row.last_completed_date,
        today_date = v_row.today_date,
        today_senders = v_row.today_senders,
        updated_at = now()
    where channel_id = new.channel_id;

    return new;
end;
$$;

create trigger on_message_update_streak
    after insert on public.messages
    for each row execute function public.handle_message_streak();

-- Without this, a streak that was genuinely broken (someone missed a
-- day) would just sit at its last value forever until the *next*
-- message finally rolls it over — meaning the UI could keep showing a
-- "streak" that's actually already dead for however long the channel
-- stays quiet. Called lazily from the client (see getChannelStreak in
-- channels.ts) rather than on a cron, since there's no background job
-- runner in this stack to schedule one on — reading the streak is
-- exactly the moment staleness would otherwise be visible, so checking
-- right then costs nothing extra.
create or replace function public.get_channel_streak(p_channel_id uuid)
returns table (current_streak integer, longest_streak integer, last_completed_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_today date := (now() at time zone 'utc')::date;
    v_row    public.channel_streaks;
begin
    if p_channel_id not in (select channel_id from public.channel_members where user_id = auth.uid()) then
        raise exception 'not a member of this channel';
    end if;

    select * into v_row from public.channel_streaks where channel_id = p_channel_id;
    if not found then
        return query select 0, 0, null::date;
        return;
    end if;

    -- Broken if the last fully-completed day was before yesterday (i.e.
    -- at least one full calendar day passed with no full participation).
    if v_row.last_completed_date is not null and v_row.last_completed_date < v_today - interval '1 day' then
        v_row.current_streak := 0;
    end if;

    return query select v_row.current_streak, v_row.longest_streak, v_row.last_completed_date;
end;
$$;
