-- Adds video story support. stories was image-only (media_url with an
-- implicit type); mirrors how messages already distinguishes
-- image/audio via a media_type column (see 001_initial_schema.sql).

alter table public.stories
    add column if not exists media_type text not null default 'image'
    check (media_type in ('image', 'video'));

-- duration_seconds is informational only (shown in the tray/viewer UI)
-- — the real 30s cap is enforced client-side during recording via
-- MediaRecorder's own timeslice/stop logic, not by this column. A
-- server-side check here can't actually stop someone from uploading a
-- longer file directly against the API, but that's the same trust
-- boundary every other media upload in this app already has (image
-- size caps are also client-enforced before upload); revisit if that
-- ever needs to be a hard server-side guarantee, e.g. via a Storage
-- trigger that inspects the uploaded file.
alter table public.stories
    add column if not exists duration_seconds numeric;
