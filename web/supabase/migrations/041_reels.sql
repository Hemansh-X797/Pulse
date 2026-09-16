-- Reels — permanent, algorithmic-feed short vertical video, distinct
-- from both `posts` (text/image feed, not video-first, not full-screen)
-- and `stories` (24-hour ephemeral, one ring per person, no likes or
-- comments). Mirrors the exact RLS pattern posts/post_comments already
-- use (public read, own-row write) rather than inventing a new one.
create table public.reels (
    id            bigint generated always as identity primary key,
    author_id     uuid not null references public.profiles(id) on delete cascade,
    video_url     text not null,
    caption       text not null default '',
    caption_rendered text not null default '',
    created_at    timestamptz not null default now()
);

alter table public.reels enable row level security;

create policy "reels are publicly readable"
    on public.reels for select
    using (true);

create policy "users can create own reels"
    on public.reels for insert
    with check (author_id = auth.uid());

create policy "users can delete own reels"
    on public.reels for delete
    using (author_id = auth.uid());

create table public.reel_likes (
    reel_id    bigint not null references public.reels(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (reel_id, user_id)
);

alter table public.reel_likes enable row level security;

create policy "reel likes are publicly readable"
    on public.reel_likes for select
    using (true);

create policy "users can like as themselves"
    on public.reel_likes for insert
    with check (user_id = auth.uid());

create policy "users can unlike their own like"
    on public.reel_likes for delete
    using (user_id = auth.uid());

-- Comments kept deliberately flat (no parent_comment_id / threading,
-- unlike post_comments after 040_comment_replies.sql) — real short-form
-- video products (TikTok/Reels/Shorts) mostly show comments as a flat,
-- fast-scrolling list under the video, not a threaded discussion; adding
-- threading here would be scope the format doesn't really call for.
create table public.reel_comments (
    id            bigint generated always as identity primary key,
    reel_id       bigint not null references public.reels(id) on delete cascade,
    author_id     uuid not null references public.profiles(id) on delete cascade,
    body_raw      text not null,
    body_rendered text not null,
    created_at    timestamptz not null default now()
);

alter table public.reel_comments enable row level security;

create policy "reel comments are publicly readable"
    on public.reel_comments for select
    using (true);

create policy "users can comment as themselves"
    on public.reel_comments for insert
    with check (author_id = auth.uid());

create policy "users can delete own reel comments"
    on public.reel_comments for delete
    using (author_id = auth.uid());

create index reels_created_at_idx on public.reels (created_at desc);
create index reel_likes_reel_id_idx on public.reel_likes (reel_id);
create index reel_comments_reel_id_idx on public.reel_comments (reel_id);

-- Same shape convention as feed_view: one queryable view joining author
-- profile fields + engagement counts, instead of the client doing N+1
-- lookups per reel. security_invoker = true so RLS evaluates as the
-- querying user (needed for liked_by_me's auth.uid() to resolve
-- correctly), same reasoning feed_view itself documents.
create view public.reel_feed_view
    with (security_invoker = true) as
select
    r.id,
    r.author_id,
    p.username as author_username,
    p.display_name as author_display_name,
    p.avatar_url as author_avatar_url,
    p.equipped_avatar_decoration as author_avatar_decoration,
    p.accent_color_top as author_accent_top,
    p.accent_color_bottom as author_accent_bottom,
    p.name_style as author_name_style,
    r.video_url,
    r.caption_rendered,
    r.created_at,
    (select count(*) from public.reel_likes rl where rl.reel_id = r.id) as like_count,
    (select count(*) from public.reel_comments rc where rc.reel_id = r.id) as comment_count,
    exists(select 1 from public.reel_likes rl2 where rl2.reel_id = r.id and rl2.user_id = auth.uid()) as liked_by_me
from public.reels r
join public.profiles p on p.id = r.author_id;
