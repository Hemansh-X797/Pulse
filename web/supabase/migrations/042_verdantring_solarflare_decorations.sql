-- Two new avatar decorations, same tamper-proof no-client-write catalog
-- pattern as 034_decoration_catalogs.sql.
--
-- 'verdantring' is deliberately paired with the 'verdantchrome' nameplate
-- (039_verdantchrome_nameplate.sql) — same green/silver/black palette and
-- material language, so equipping both together reads as one coordinated
-- look rather than two unrelated cosmetics that happen to share a color.
insert into public.avatar_decoration_catalog (id, label, icon, is_animated, category, sort_order) values
    ('verdantring', 'Verdant Ring', '/avatar-decorations/verdantring.svg', true, 'animated', 110),
    ('solarflare', 'Solar Flare', '/avatar-decorations/solarflare.svg', true, 'animated', 120)
on conflict (id) do nothing;
