-- New Profile Decor entry: "Verdant Chrome" — green/silver/black brushed-
-- metal nameplate with animated emerald circuitry and a sweeping sheen
-- (public/nameplates/verdantchrome.svg). Same no-client-write catalog
-- pattern as everything else in 034_decoration_catalogs.sql — this is a
-- migration/direct-insert, not something a client can add to itself.
insert into public.nameplate_catalog (id, label, icon, is_animated, category, sort_order) values
    ('verdantchrome', 'Verdant Chrome', '/nameplates/verdantchrome.svg', true, 'general', 80)
on conflict (id) do nothing;
