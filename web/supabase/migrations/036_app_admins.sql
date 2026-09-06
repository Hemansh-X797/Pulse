-- App-level admin — a completely different concept from space_members'
-- per-space 'owner'/'admin'/'member' role: this is "can access
-- PalSpace's own admin panel", global to the whole app, and nothing
-- like it existed anywhere in the schema before this. Same
-- no-client-write pattern as badges (031) and the decoration catalogs
-- (034): a client can check whether *they themselves* are an admin
-- (needed to decide whether to show the admin panel link at all), but
-- can never grant or revoke admin to anyone, including themselves —
-- that only ever happens via a migration.
create table public.app_admins (
    user_id    uuid primary key references public.profiles(id) on delete cascade,
    granted_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- Deliberately narrow: you can only ever see your OWN row, not the
-- full admin list — this lets client code do
-- `select 1 from app_admins where user_id = auth.uid()` to decide
-- whether to show the admin panel, without turning this table into a
-- way to enumerate who all the admins are.
create policy "you can check your own admin status"
    on public.app_admins for select
    using (user_id = auth.uid());

-- No insert/update/delete policy for `authenticated` — admin status is
-- granted by migration only, exactly like badges.

insert into public.app_admins (user_id) values
    ('5f893fa9-62cd-43b5-b3e3-a7b1153c7233')
on conflict (user_id) do nothing;

-- Everything below is gated by checking app_admins server-side inside
-- the function itself (not just by hiding a link client-side) — a
-- non-admin calling these directly via the API gets a raised exception,
-- same as any other permission check in this app. Regular table RLS
-- (profiles are "publicly readable", but only your own rows for most
-- other tables) isn't built for "an admin can see aggregate stats
-- across everyone," so these are SECURITY DEFINER on purpose, the same
-- pattern as the space-permission RPCs.

create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

grant execute on function public.is_app_admin() to authenticated;

create or replace function public.admin_get_stats()
returns table (
    total_users bigint,
    total_posts bigint,
    total_spaces bigint,
    total_messages bigint,
    signups_last_7d bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_app_admin() then
        raise exception 'admin access required';
    end if;
    return query select
        (select count(*) from public.profiles),
        (select count(*) from public.posts),
        (select count(*) from public.spaces),
        (select count(*) from public.messages),
        (select count(*) from public.profiles where created_at > now() - interval '7 days');
end;
$$;

grant execute on function public.admin_get_stats() to authenticated;

create or replace function public.admin_search_users(p_query text)
returns table (
    id uuid,
    username text,
    display_name text,
    avatar_url text,
    created_at timestamptz,
    status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_app_admin() then
        raise exception 'admin access required';
    end if;
    return query
        select p.id, p.username, p.display_name, p.avatar_url, p.created_at, p.status
        from public.profiles p
        where p.username ilike '%' || p_query || '%' or p.display_name ilike '%' || p_query || '%'
        order by p.created_at desc
        limit 25;
end;
$$;

grant execute on function public.admin_search_users(text) to authenticated;

create or replace function public.admin_list_recent_signups(p_limit integer default 20)
returns table (
    id uuid,
    username text,
    display_name text,
    avatar_url text,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_app_admin() then
        raise exception 'admin access required';
    end if;
    return query
        select p.id, p.username, p.display_name, p.avatar_url, p.created_at
        from public.profiles p
        order by p.created_at desc
        limit p_limit;
end;
$$;

grant execute on function public.admin_list_recent_signups(integer) to authenticated;

