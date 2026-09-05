-- feed_view never selected equipped_avatar_decoration from profiles, so
-- even though the settings picker saves it and the column has existed
-- since 027_avatar_decorations.sql, a decoration you equipped never
-- showed up on your posts in the feed — the view simply didn't carry
-- the data. Same view body as 021_post_hashtags_and_explore.sql's,
-- with one added column.
create or replace view public.feed_view
    with (security_invoker = true) as
select
    p.id,
    p.author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url,
    pr.equipped_avatar_decoration as author_avatar_decoration,
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
