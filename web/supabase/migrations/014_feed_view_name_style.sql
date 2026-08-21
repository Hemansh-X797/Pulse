-- Adds author_name_style to feed_view so posts can render the custom
-- display-name styling from 013_display_name_style.sql — same view
-- shape as 005_blocking_notification_prefs_stories.sql's version, only
-- change is the one added column.
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
