-- Real per-space custom roles, replacing the fixed 'owner'/'admin'/
-- 'member' enum's role as the *only* mechanism. That enum stays
-- (owner/admin still matter for a few hardcoded checks elsewhere,
-- like handle_new_space's auto-owner-assignment) but every space now
-- also gets a real "Admin" role auto-created at space creation, and
-- the owner can create further roles with a real permission set —
-- per your exact spec: "there should just be an admin role made by
-- default, rest user makes and handles permissions."

create table public.space_roles (
    id          uuid primary key default gen_random_uuid(),
    space_id    uuid not null references public.spaces(id) on delete cascade,
    name        text not null,
    color       text not null default '#99aab5',
    -- Fixed permission set, stored as a jsonb object of booleans rather
    -- than a bitfield — easier to extend with new permission keys later
    -- without a migration, and there's no realistic scale concern for
    -- a per-space roles table needing bitfield-level compactness.
    permissions jsonb not null default '{}'::jsonb,
    position    integer not null default 0,
    is_default  boolean not null default false, -- the auto-created Admin role
    created_at  timestamptz not null default now()
);

alter table public.space_roles enable row level security;

create table public.space_member_roles (
    space_id  uuid not null references public.spaces(id) on delete cascade,
    user_id   uuid not null references public.profiles(id) on delete cascade,
    role_id   uuid not null references public.space_roles(id) on delete cascade,
    granted_at timestamptz not null default now(),
    primary key (space_id, user_id, role_id)
);

alter table public.space_member_roles enable row level security;

-- Same "is a member" helper pattern as is_space_member/is_channel_member
-- from earlier migrations (007/008) — avoids the same self-reference
-- recursion those fixed, since this policy also needs to check
-- space_members from a policy that could otherwise be queried by it.
create policy "space members can view roles"
    on public.space_roles for select
    using (public.is_space_member(space_id, auth.uid()));

create policy "space members can view role assignments"
    on public.space_member_roles for select
    using (public.is_space_member(space_id, auth.uid()));

-- Mutating roles/assignments goes through SECURITY DEFINER functions
-- below (which check the manage_roles permission themselves), not
-- direct table policies — a direct "owner can insert" policy would
-- only cover the owner, not people the owner has granted a
-- manage_roles-capable custom role to.

-- ---------- default Admin role creation ----------
-- Extends handle_new_space (002_rename_servers_to_spaces.sql) rather
-- than replacing it, by adding a second trigger on the same event —
-- Postgres runs all triggers for an event, order unspecified but both
-- run, so this doesn't need to touch the existing function.
create or replace function public.create_default_admin_role()
returns trigger as $$
declare
    v_role_id uuid;
begin
    insert into public.space_roles (space_id, name, color, permissions, position, is_default)
    values (
        new.id,
        'Admin',
        '#f04747',
        jsonb_build_object(
            'manage_space', true,
            'manage_roles', true,
            'manage_channels', true,
            'manage_messages', true,
            'kick_members', true,
            'ban_members', true,
            'create_invites', true
        ),
        0,
        true
    )
    returning id into v_role_id;

    insert into public.space_member_roles (space_id, user_id, role_id)
    values (new.id, new.owner_id, v_role_id);

    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_space_created_default_role on public.spaces;
create trigger on_space_created_default_role
    after insert on public.spaces
    for each row execute function public.create_default_admin_role();

-- ---------- permission check helper ----------
create or replace function public.space_member_has_permission(p_space_id uuid, p_user_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    -- The space owner always has every permission, regardless of role
    -- assignments — same as Discord's server owner being un-demotable.
    exists (select 1 from public.spaces where id = p_space_id and owner_id = p_user_id)
    or exists (
      select 1
      from public.space_member_roles smr
      join public.space_roles sr on sr.id = smr.role_id
      where smr.space_id = p_space_id
        and smr.user_id = p_user_id
        and coalesce((sr.permissions ->> p_permission)::boolean, false)
    );
$$;

grant execute on function public.space_member_has_permission(uuid, uuid, text) to authenticated;

-- ---------- role management RPCs (permission-checked, not raw table access) ----------
create or replace function public.create_space_role(p_space_id uuid, p_name text, p_color text default '#99aab5')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role_id uuid;
    v_max_position integer;
begin
    if not public.space_member_has_permission(p_space_id, auth.uid(), 'manage_roles') then
        raise exception 'missing manage_roles permission';
    end if;
    select coalesce(max(position), 0) + 1 into v_max_position from public.space_roles where space_id = p_space_id;
    insert into public.space_roles (space_id, name, color, position)
    values (p_space_id, p_name, p_color, v_max_position)
    returning id into v_role_id;
    return v_role_id;
end;
$$;

grant execute on function public.create_space_role(uuid, text, text) to authenticated;

create or replace function public.update_space_role_permissions(p_role_id uuid, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_space_id uuid;
begin
    select space_id into v_space_id from public.space_roles where id = p_role_id;
    if v_space_id is null then
        raise exception 'role not found';
    end if;
    if not public.space_member_has_permission(v_space_id, auth.uid(), 'manage_roles') then
        raise exception 'missing manage_roles permission';
    end if;
    update public.space_roles set permissions = p_permissions where id = p_role_id;
end;
$$;

grant execute on function public.update_space_role_permissions(uuid, jsonb) to authenticated;

create or replace function public.delete_space_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_space_id uuid;
    v_is_default boolean;
begin
    select space_id, is_default into v_space_id, v_is_default from public.space_roles where id = p_role_id;
    if v_space_id is null then
        raise exception 'role not found';
    end if;
    if v_is_default then
        raise exception 'cannot delete the default Admin role';
    end if;
    if not public.space_member_has_permission(v_space_id, auth.uid(), 'manage_roles') then
        raise exception 'missing manage_roles permission';
    end if;
    delete from public.space_roles where id = p_role_id;
end;
$$;

grant execute on function public.delete_space_role(uuid) to authenticated;

create or replace function public.assign_space_role(p_space_id uuid, p_target_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.space_member_has_permission(p_space_id, auth.uid(), 'manage_roles') then
        raise exception 'missing manage_roles permission';
    end if;
    insert into public.space_member_roles (space_id, user_id, role_id)
    values (p_space_id, p_target_user_id, p_role_id)
    on conflict do nothing;
end;
$$;

grant execute on function public.assign_space_role(uuid, uuid, uuid) to authenticated;

create or replace function public.unassign_space_role(p_space_id uuid, p_target_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_is_default boolean;
begin
    if not public.space_member_has_permission(p_space_id, auth.uid(), 'manage_roles') then
        raise exception 'missing manage_roles permission';
    end if;
    select is_default into v_is_default from public.space_roles where id = p_role_id;
    if v_is_default and p_target_user_id = (select owner_id from public.spaces where id = p_space_id) then
        raise exception 'cannot remove the owner''s Admin role';
    end if;
    delete from public.space_member_roles where space_id = p_space_id and user_id = p_target_user_id and role_id = p_role_id;
end;
$$;

grant execute on function public.unassign_space_role(uuid, uuid, uuid) to authenticated;

-- ---------- categories ----------
create table public.space_categories (
    id         uuid primary key default gen_random_uuid(),
    space_id   uuid not null references public.spaces(id) on delete cascade,
    name       text not null,
    position   integer not null default 0,
    created_at timestamptz not null default now()
);

alter table public.space_categories enable row level security;

create policy "space members can view categories"
    on public.space_categories for select
    using (public.is_space_member(space_id, auth.uid()));

create or replace function public.create_space_category(p_space_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_category_id uuid;
    v_max_position integer;
begin
    if not public.space_member_has_permission(p_space_id, auth.uid(), 'manage_channels') then
        raise exception 'missing manage_channels permission';
    end if;
    select coalesce(max(position), 0) + 1 into v_max_position from public.space_categories where space_id = p_space_id;
    insert into public.space_categories (space_id, name, position)
    values (p_space_id, p_name, v_max_position)
    returning id into v_category_id;
    return v_category_id;
end;
$$;

grant execute on function public.create_space_category(uuid, text) to authenticated;

-- channels gains: an optional category, and a kind so voice channels
-- (B10's space-side half) can exist as a distinct concept from text
-- topics, ordered/categorized the same way. Voice calling itself isn't
-- wired yet — this is the schema half only.
alter table public.channels
    add column if not exists category_id uuid references public.space_categories(id) on delete set null;
alter table public.channels
    add column if not exists kind text not null default 'text' check (kind in ('text', 'voice'));

-- ---------- topic (channel) reordering + creation, permission-checked ----------
create or replace function public.reorder_space_channel(p_channel_id uuid, p_new_position integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_space_id uuid;
begin
    select space_id into v_space_id from public.channels where id = p_channel_id;
    if v_space_id is null then
        raise exception 'channel not found or is not a space channel';
    end if;
    if not public.space_member_has_permission(v_space_id, auth.uid(), 'manage_channels') then
        raise exception 'missing manage_channels permission';
    end if;
    update public.channels set position = p_new_position where id = p_channel_id;
end;
$$;

grant execute on function public.reorder_space_channel(uuid, integer) to authenticated;

create or replace function public.create_space_channel(p_space_id uuid, p_name text, p_kind text default 'text', p_category_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_channel_id uuid;
    v_max_position integer;
begin
    if not public.space_member_has_permission(p_space_id, auth.uid(), 'manage_channels') then
        raise exception 'missing manage_channels permission';
    end if;
    if p_kind not in ('text', 'voice') then
        raise exception 'invalid channel kind';
    end if;
    select coalesce(max(position), 0) + 1 into v_max_position
        from public.channels where space_id = p_space_id and coalesce(category_id::text, '') = coalesce(p_category_id::text, '');
    insert into public.channels (space_id, name, is_group, position, kind, category_id)
    values (p_space_id, p_name, true, v_max_position, p_kind, p_category_id)
    returning id into v_channel_id;
    return v_channel_id;
end;
$$;

grant execute on function public.create_space_channel(uuid, text, text, uuid) to authenticated;
