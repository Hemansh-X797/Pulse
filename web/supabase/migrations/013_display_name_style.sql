-- Custom display-name styling (Settings → Profile → Display Name Style).
-- Kept as a single jsonb column rather than one column per possible
-- font/effect/color combination — the shape varies by effect (Prism
-- needs 7 colors, Solid needs 1, Gothic/Pixel fonts need no colors at
-- all), and a jsonb blob avoids a wide sparse table of mostly-null
-- columns for something that's purely a rendering hint, never queried
-- or filtered on.
alter table public.profiles
    add column if not exists name_style jsonb not null default '{}'::jsonb;

comment on column public.profiles.name_style is
  'Shape: { font?: "sans"|"serif"|"gothic"|"pixel", effect?: "solid"|"gradient"|"neon"|"toon"|"prism"|"gummy", colors?: string[] }. Rendered client-side only (src/components/NameStyle.tsx) — never trusted for anything beyond display, and always falls back to plain text if malformed.';
