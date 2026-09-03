-- Group DMs — the `is_group` column has existed on `channels` since
-- the very first migration, and `create_dm_channel` (006) already
-- checks `c.is_group = false` when looking for an existing 1:1, but
-- checked directly: there has never been any function anywhere that
-- creates a channel with is_group = true, and listMyDMs() on the
-- client explicitly filters `.eq('channels.is_group', false)` — so a
-- group DM was completely unreachable end to end despite the schema
-- having supported the concept from day one. A "message a few friends
-- without spinning up a whole Space" is a pretty core piece of a social
-- app, so this closes that gap for real, following the same
-- SECURITY DEFINER pattern as create_dm_channel (006) for the same
-- reason: the channel_members INSERT policy only allows
-- user_id = auth.uid(), so a client-side insert of other members'
-- membership rows would be rejected by RLS row-by-row the same way the
-- original 1:1 DM bug was.

create or replace function public.create_group_dm(p_member_ids uuid[], p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me uuid := auth.uid();
    v_channel_id uuid;
    v_member_id uuid;
begin
    if v_me is null then
        raise exception 'not authenticated';
    end if;
    -- A group needs at least 3 total people (you + 2 others) — with
    -- just one other person this is exactly what create_dm_channel
    -- already covers, so this doesn't duplicate that path.
    if array_length(p_member_ids, 1) is null or array_length(p_member_ids, 1) < 2 then
        raise exception 'a group needs at least 2 other members';
    end if;

    foreach v_member_id in array p_member_ids loop
        if v_member_id = v_me then
            raise exception 'member list should not include yourself';
        end if;
        if exists (
            select 1 from public.blocked_users
            where (blocker_id = v_me and blocked_id = v_member_id)
               or (blocker_id = v_member_id and blocked_id = v_me)
        ) then
            raise exception 'cannot start a group with a blocked user';
        end if;
    end loop;

    insert into public.channels (is_group, name) values (true, trim(coalesce(p_name, '')))
    returning id into v_channel_id;

    insert into public.channel_members (channel_id, user_id) values (v_channel_id, v_me);
    foreach v_member_id in array p_member_ids loop
        insert into public.channel_members (channel_id, user_id)
        values (v_channel_id, v_member_id)
        on conflict do nothing;
    end loop;

    return v_channel_id;
end;
$$;

grant execute on function public.create_group_dm(uuid[], text) to authenticated;

-- Adding someone to an existing group — any current member can do this
-- (matches the "any member can add a friend" pattern most chat apps
-- use for small group DMs, as opposed to a Space's stricter
-- role-gated membership).
create or replace function public.add_group_dm_member(p_channel_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.channels where id = p_channel_id and is_group = true) then
        raise exception 'not a group DM';
    end if;
    if not public.is_channel_member(p_channel_id, auth.uid()) then
        raise exception 'not a member of this group';
    end if;
    if exists (
        select 1 from public.blocked_users
        where (blocker_id = auth.uid() and blocked_id = p_user_id)
           or (blocker_id = p_user_id and blocked_id = auth.uid())
    ) then
        raise exception 'cannot add a blocked user';
    end if;
    insert into public.channel_members (channel_id, user_id)
    values (p_channel_id, p_user_id)
    on conflict do nothing;
end;
$$;

grant execute on function public.add_group_dm_member(uuid, uuid) to authenticated;

-- Leaving a group DM — a concept that doesn't apply to a 1:1 (you
-- don't "leave" a DM with one person, you just stop talking), so this
-- is scoped to is_group = true channels specifically.
create or replace function public.leave_group_dm(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from public.channels where id = p_channel_id and is_group = true) then
        raise exception 'not a group DM';
    end if;
    delete from public.channel_members where channel_id = p_channel_id and user_id = auth.uid();
end;
$$;

grant execute on function public.leave_group_dm(uuid) to authenticated;
