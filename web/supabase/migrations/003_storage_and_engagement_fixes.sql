-- 003_storage_and_engagement_fixes.sql
-- Run after 002_rename_servers_to_spaces.sql. Run this as the project
-- owner (Supabase SQL editor, which runs as a privileged role) — the
-- storage.buckets insert/update below needs elevated privileges the
-- anon/authenticated roles don't have, same as any bucket config change.

begin;

-- ---------- 1: codify the media bucket + its policies ----------
-- Previously this setup only existed as manual dashboard instructions in
-- docs/SUPABASE_SETUP.md. That's exactly the kind of step that's easy to
-- half-do or skip, and the client fails *silently* when it's missing
-- (see the try/catch additions in media.ts / HomeFeed.tsx / ChatView.tsx
-- in this same pass) — so codifying it here means re-running this file
-- against a fresh project reproduces the working bucket config exactly,
-- not "whatever got clicked in the dashboard that day."
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users can upload media" on storage.objects;
create policy "authenticated users can upload media"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'media');

drop policy if exists "media is publicly readable" on storage.objects;
create policy "media is publicly readable"
    on storage.objects for select
    using (bucket_id = 'media');

-- uploadMedia() writes to `${user.id}/${uuid}.${ext}` — this lets a user
-- manage (overwrite/delete) only objects under their own folder prefix,
-- matching that path convention. Previously there was no update/delete
-- policy at all, so a failed re-upload of the same path (upsert: false
-- means it wouldn't collide, but a *delete* was never possible client-side).
drop policy if exists "users manage their own media" on storage.objects;
create policy "users manage their own media"
    on storage.objects for all
    to authenticated
    using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 2: posts were missing UPDATE/DELETE policies entirely ----------
-- Not a client bug — edit/delete on posts was structurally impossible
-- before this, RLS defaults to deny with no matching policy.
alter table public.posts add column if not exists edited_at timestamptz;

drop policy if exists "authors can update own posts" on public.posts;
create policy "authors can update own posts"
    on public.posts for update
    using (author_id = auth.uid())
    with check (author_id = auth.uid());

drop policy if exists "authors can delete own posts" on public.posts;
create policy "authors can delete own posts"
    on public.posts for delete
    using (author_id = auth.uid());

-- Comments: same gap, added for parity (edit/delete your own comment).
alter table public.post_comments add column if not exists edited_at timestamptz;

drop policy if exists "authors can update own comments" on public.post_comments;
create policy "authors can update own comments"
    on public.post_comments for update
    using (author_id = auth.uid())
    with check (author_id = auth.uid());

drop policy if exists "authors can delete own comments" on public.post_comments;
create policy "authors can delete own comments"
    on public.post_comments for delete
    using (author_id = auth.uid());

-- ---------- 3: feed_view needs to expose *your* reaction state ----------
-- reaction_count alone can't drive a toggleable reaction bar with an
-- "active" state per emoji — the client needs to know which emojis *you*
-- reacted with. security_invoker = true means auth.uid() here correctly
-- resolves to the querying user, not the view owner.
create or replace view public.feed_view
    with (security_invoker = true) as
select
    p.id,
    p.author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url,
    pr.accent_color_top as author_accent_top,
    pr.accent_color_bottom as author_accent_bottom,
    p.body_rendered,
    p.media_url,
    p.created_at,
    p.edited_at,
    (select count(*) from public.post_reactions r where r.post_id = p.id) as reaction_count,
    (select count(*) from public.post_comments c where c.post_id = p.id) as comment_count,
    (
        select coalesce(array_agg(r2.emoji), '{}')
        from public.post_reactions r2
        where r2.post_id = p.id and r2.user_id = auth.uid()
    ) as my_reactions
from public.posts p
join public.profiles pr on pr.id = p.author_id;

commit;
