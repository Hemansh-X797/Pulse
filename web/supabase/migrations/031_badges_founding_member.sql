-- Badges — a small, extensible cosmetic-achievement system. Two tables
-- rather than a boolean/array column on profiles on purpose: badges
-- need their own metadata (label, description, icon) that a plain flag
-- can't hold, and a join table means granting/revoking one badge never
-- touches the profiles row at all.
create table public.badges (
    id          text primary key,
    label       text not null,
    description text not null,
    icon        text not null
);

create table public.profile_badges (
    profile_id uuid not null references public.profiles(id) on delete cascade,
    badge_id   text not null references public.badges(id) on delete cascade,
    granted_at timestamptz not null default now(),
    primary key (profile_id, badge_id)
);

alter table public.badges enable row level security;
alter table public.profile_badges enable row level security;

create policy "badges are publicly readable"
    on public.badges for select
    using (true);

create policy "profile badges are publicly readable"
    on public.profile_badges for select
    using (true);

-- Deliberately no insert/update/delete policy on either table for
-- `authenticated` — badges are granted by a migration (or later, a
-- service-role admin action), never by a client-side call. Without
-- that restriction "Founding Member" would just be a flag anyone could
-- set on themselves via the API, which defeats the entire point of it
-- being exclusive. RLS defaults to deny with no policy, so this is the
-- absence of a policy doing the work, not an oversight.

insert into public.badges (id, label, description, icon)
values (
    'founding_member',
    'Founding Member',
    'Here before it was cool — joined PalSpace before this badge even existed.',
    '/badges/founding-member.svg'
);

-- The grant: every account that exists at the moment this migration
-- runs gets it, once. Because this is a one-time migration (not a
-- trigger, not a default), anyone who signs up after this has already
-- run against your database structurally cannot receive it — there's
-- no code path that grants 'founding_member' to a new row, ever. That's
-- what actually makes this exclusive rather than just an early flag
-- that a future admin action could accidentally hand out again.
insert into public.profile_badges (profile_id, badge_id)
select id, 'founding_member' from public.profiles
on conflict (profile_id, badge_id) do nothing;
