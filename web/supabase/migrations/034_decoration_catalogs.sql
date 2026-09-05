-- Avatar decorations and nameplates were both hardcoded TypeScript
-- arrays (src/lib/avatarDecorations.ts, src/lib/nameplates.ts) pointing
-- at static files in /public. That's fine at 6-7 items each, but it
-- stops scaling the moment there are hundreds: every new decoration
-- would need a code change + redeploy just to add one row to an array,
-- and a flat hardcoded list has nowhere to hang metadata (animated?
-- category? sort order?) that a real picker UI needs once you can't
-- just show all of them in one unscrollable grid. Moving both to real
-- catalog tables — same public-read/no-client-write pattern as
-- `badges` (031) — means adding #8 through #200 of either is a plain
-- INSERT, no app deploy required, and gives a picker UI something to
-- paginate/search against.
--
-- Nameplates are also being renamed "Profile Decor" throughout the
-- product per direct request — kept as `nameplate_catalog` at the
-- table-name level since renaming a table is riskier than renaming
-- what the UI calls it, but every user-facing label moves to
-- "Profile Decor" in the client code.

create table public.avatar_decoration_catalog (
    id          text primary key,
    label       text not null,
    icon        text not null,
    is_animated boolean not null default false,
    category    text not null default 'general',
    sort_order  integer not null default 0
);

create table public.nameplate_catalog (
    id          text primary key,
    label       text not null,
    icon        text not null,
    is_animated boolean not null default false,
    category    text not null default 'general',
    sort_order  integer not null default 0
);

alter table public.avatar_decoration_catalog enable row level security;
alter table public.nameplate_catalog enable row level security;

create policy "avatar decoration catalog is publicly readable"
    on public.avatar_decoration_catalog for select
    using (true);

create policy "nameplate catalog is publicly readable"
    on public.nameplate_catalog for select
    using (true);

-- No insert/update/delete policy for `authenticated` on either table —
-- same reasoning as badges (031): the catalog is curated content, not
-- something a client call should ever be able to add to or change.
-- New entries go in via migration/seed, same as this one.

insert into public.avatar_decoration_catalog (id, label, icon, is_animated, category, sort_order) values
    ('halo', 'Halo', '/avatar-decorations/halo.svg', false, 'general', 10),
    ('thorns', 'Thorns', '/avatar-decorations/thorns.svg', false, 'general', 20),
    ('circuit', 'Circuit', '/avatar-decorations/circuit.svg', false, 'general', 30),
    ('stars', 'Stars', '/avatar-decorations/stars.svg', false, 'general', 40),
    ('flame-ring', 'Flame Ring', '/avatar-decorations/flame-ring.svg', false, 'general', 50),
    ('crown', 'Crown', '/avatar-decorations/crown.svg', false, 'general', 60),
    ('psion', 'Psion', '/avatar-decorations/psion.svg', true, 'animated', 70),
    ('duality', 'Duality', '/avatar-decorations/duality.svg', true, 'animated', 80),
    ('frostblade', 'Frostblade', '/avatar-decorations/frostblade.svg', true, 'animated', 90),
    ('wildvine', 'Wildvine', '/avatar-decorations/wildvine.svg', true, 'animated', 100)
on conflict (id) do nothing;

insert into public.nameplate_catalog (id, label, icon, is_animated, category, sort_order) values
    ('ember', 'Ember', '/nameplates/ember.svg', false, 'general', 10),
    ('frost', 'Frost', '/nameplates/frost.svg', false, 'general', 20),
    ('void', 'Void', '/nameplates/void.svg', false, 'general', 30),
    ('bloom', 'Bloom', '/nameplates/bloom.svg', false, 'general', 40),
    ('static', 'Static', '/nameplates/static.svg', false, 'general', 50),
    ('aurora', 'Aurora', '/nameplates/aurora.svg', false, 'general', 60),
    ('galaxy', 'Galaxy', '/nameplates/galaxy.svg', false, 'general', 70)
on conflict (id) do nothing;
