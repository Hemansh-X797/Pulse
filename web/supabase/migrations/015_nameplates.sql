-- Nameplates: a decorative image that shows behind the display name in
-- the profile popover/full profile, same concept as Discord's
-- nameplate cosmetic. Generated as real SVG assets (public/nameplates/)
-- rather than a user-uploaded image, since these are a fixed cosmetic
-- set, not per-user media.
alter table public.profiles
    add column if not exists equipped_nameplate text;

comment on column public.profiles.equipped_nameplate is
  'Filename (no extension) of an SVG in public/nameplates/, or null for none. Validated against a fixed allowlist client-side (src/lib/nameplates.ts) before rendering — this column is not a free-text path, but stored as plain text rather than a DB enum so new nameplates can ship without a migration.';
