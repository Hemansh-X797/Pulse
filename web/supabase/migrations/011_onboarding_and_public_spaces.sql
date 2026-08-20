-- Onboarding (interests + completion flag) and private/public spaces
-- (togglable at creation; private = invite-link only, public =
-- joinable via Explore too).

-- ---------- profiles: interests + onboarding flag ----------
alter table public.profiles
    add column if not exists interests text[] not null default '{}';

alter table public.profiles
    add column if not exists onboarding_completed boolean not null default false;

-- Existing accounts didn't go through onboarding and shouldn't get
-- force-redirected into it retroactively — only brand-new signups
-- (created after this migration runs) should see it.
update public.profiles set onboarding_completed = true where onboarding_completed = false;

-- ---------- spaces: private/public + tags for interest matching ----------
alter table public.spaces
    add column if not exists is_private boolean not null default true;

alter table public.spaces
    add column if not exists tags text[] not null default '{}';

-- The existing "members can view their memberships"-style policy on
-- spaces only shows spaces you already belong to (see
-- 001_initial_schema.sql: "using (id in (select space_id from
-- space_members where user_id = auth.uid()))" — renamed along with
-- the table by 002). That's still correct for private spaces, but
-- Explore needs public ones visible to *any* authenticated user,
-- member or not. This is a second, additive SELECT policy — Postgres
-- OR's together all matching policies on a table, so this doesn't
-- replace the membership one, it just adds another case where a row
-- is visible. It reads only the `is_private` column directly, no
-- self-reference, so it doesn't have 007/008's recursion problem.
create policy "public spaces are visible to any authenticated user"
    on public.spaces for select
    to authenticated
    using (is_private = false);
