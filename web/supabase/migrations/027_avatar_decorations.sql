-- Avatar decorations — a small ring/frame overlay rendered around a
-- person's avatar, same pattern as equipped_nameplate (migration for
-- nameplates isn't in this file list under that exact name, but the
-- column + src/lib/nameplates.ts client-side allowlist approach is
-- reused here on purpose): stored as plain text, not a DB enum, so new
-- decorations can ship by adding an SVG + one line in
-- src/lib/avatarDecorations.ts without another migration. Never trusted
-- directly as a file path client-side — anything not in that allowlist
-- renders as "no decoration". RLS on profiles already restricts UPDATE
-- to the row's own owner via existing policies, so no new policy needed.
alter table public.profiles
    add column if not exists equipped_avatar_decoration text;
