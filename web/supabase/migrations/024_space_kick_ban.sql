-- Kick and ban, backing the kick_members/ban_members permissions
-- already defined in 022_space_roles_permissions_categories.sql but
-- not wired to anything yet.

create table public.space_bans (
    space_id   uuid not null references public.spaces(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    banned_by  uuid not null references public.profiles(id) on delete set null,
    reason     text not null default '',
    created_at timestamptz not null default now(),
    primary key (space_id, user_id)
);

alter table public.space_bans enable row level security;

create policy "space members can view bans"
    on public.space_bans for select
    using (public.is_space_member(space_id, auth.uid()));

create or replace function public.kick_space_member(p_space_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.space_member_has_permission(p_space_id, auth.uid(), 'kick_members') then
        raise exception 'missing kick_members permission';
    end if;
    if p_target_user_id = (select owner_id from public.spaces where id = p_space_id) then
        raise exception 'cannot kick the space owner';
    end if;
    delete from public.space_members where space_id = p_space_id and user_id = p_target_user_id;
    delete from public.space_member_roles where space_id = p_space_id and user_id = p_target_user_id;
end;
$$;

grant execute on function public.kick_space_member(uuid, uuid) to authenticated;

-- Ban = kick + a row that blocks rejoining. join_space_by_invite-style
-- flows (joinPublicSpace, joinSpaceByInvite) insert into space_members
-- directly — enforced by an INSERT policy check here so a ban actually
-- prevents rejoining regardless of which join path is used, not just
-- the ones that happen to check space_bans explicitly client-side.
create or replace function public.ban_space_member(p_space_id uuid, p_target_user_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.space_member_has_permission(p_space_id, auth.uid(), 'ban_members') then
        raise exception 'missing ban_members permission';
    end if;
    if p_target_user_id = (select owner_id from public.spaces where id = p_space_id) then
        raise exception 'cannot ban the space owner';
    end if;
    delete from public.space_members where space_id = p_space_id and user_id = p_target_user_id;
    delete from public.space_member_roles where space_id = p_space_id and user_id = p_target_user_id;
    insert into public.space_bans (space_id, user_id, banned_by, reason)
    values (p_space_id, p_target_user_id, auth.uid(), p_reason)
    on conflict (space_id, user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
end;
$$;

grant execute on function public.ban_space_member(uuid, uuid, text) to authenticated;

create or replace function public.unban_space_member(p_space_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.space_member_has_permission(p_space_id, auth.uid(), 'ban_members') then
        raise exception 'missing ban_members permission';
    end if;
    delete from public.space_bans where space_id = p_space_id and user_id = p_target_user_id;
end;
$$;

grant execute on function public.unban_space_member(uuid, uuid) to authenticated;

-- Enforce the ban at the actual INSERT points, not just the RPCs above
-- — the existing "users can join via invite" policy on space_members
-- only ever checked user_id = auth.uid(), with no ban check at all.
drop policy if exists "users can join via invite (insert own membership)" on public.space_members;
create policy "users can join via invite (insert own membership)"
    on public.space_members for insert
    with check (
        user_id = auth.uid()
        and not exists (select 1 from public.space_bans where space_id = space_members.space_id and user_id = auth.uid())
    );
