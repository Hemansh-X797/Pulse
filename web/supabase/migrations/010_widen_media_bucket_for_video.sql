-- Widens the shared 'media' storage bucket (003_storage_and_engagement_fixes.sql)
-- to accept video, for video stories. A 30-second WebM clip at a
-- reasonable bitrate can run several MB even compressed, so raising
-- the bucket's own file_size_limit is required — the old 10MB image
-- cap would silently reject a normal-length video clip server-side,
-- independent of whatever cap the client enforces.
--
-- Bumped to 40MB: generous enough for a 30s clip at a quality that
-- doesn't look terrible, without being so large it defeats the point
-- of having a cap. Client-side MAX_BYTES in media.ts must match this
-- exactly (see that file's own comment on this) or uploads between
-- the two limits fail with a confusing storage-side error instead of
-- the friendlier client-side one.

update storage.buckets
set file_size_limit = 41943040, -- 40MB
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/webm', 'video/mp4']
where id = 'media';
