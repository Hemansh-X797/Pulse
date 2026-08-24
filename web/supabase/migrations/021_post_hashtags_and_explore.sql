-- Hashtags didn't exist as a concept anywhere in posts before this —
-- extracted from body_rendered via a generated column (kept in sync
-- automatically by Postgres on every insert/update, no trigger needed)
-- rather than parsed client-side on every render, so hashtag search
-- can be indexed and fast.

alter table public.posts
    add column if not exists hashtags text[]
    generated always as (
        (
            select coalesce(array_agg(distinct lower(m[1])), '{}')
            from regexp_matches(coalesce(body_rendered, ''), '#([a-zA-Z][a-zA-Z0-9_]{1,30})', 'g') as m
        )
    ) stored;

create index if not exists posts_hashtags_idx on public.posts using gin (hashtags);

-- feed_view needs the same column exposed, and a lightweight
-- "trending" signal (reaction_count + comment_count) for Explore's
-- "top choices" ranking — recomputed from the same view, not a
-- separate materialized table, since this app's own posts volume
-- doesn't need that yet (matches the "simple, honest, not overbuilt"
-- scoring note already left in ARCHITECTURE.md for the main feed).
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
    pr.name_style as author_name_style,
    p.body_rendered,
    p.media_url,
    p.hashtags,
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
join public.profiles pr on pr.id = p.author_id
where not exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = p.author_id)
       or (b.blocker_id = p.author_id and b.blocked_id = auth.uid())
);
