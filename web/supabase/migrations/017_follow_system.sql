-- Follow system — deliberately separate from friend_requests/
-- friends_view above. Friendship is mutual and needs an accept step;
-- following is one-directional and needs none, same distinction
-- Twitter/Instagram draw between "friends" and "follows" elsewhere.
-- This does not touch the friends system at all.

-- Widen the notification type check constraint to allow the new
-- 'new_post' and 'follow' types this migration introduces (same
-- pattern 002_rename_servers_to_spaces.sql used to widen it before).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
    check (type in ('message', 'reaction', 'comment', 'space_invite', 'friend_request', 'friend_accept', 'new_post', 'follow'));

create table if not exists public.follows (
    follower_id uuid not null references public.profiles(id) on delete cascade,
    followed_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint no_self_follow check (follower_id <> followed_id),
    primary key (follower_id, followed_id)
);

alter table public.follows enable row level security;

-- Follow lists are public information (same as most social apps —
-- "who follows whom" isn't private), so any authenticated user can
-- read any row; only the follower can create/delete their own.
drop policy if exists "follows are publicly visible" on public.follows;
create policy "follows are publicly visible"
    on public.follows for select
    to authenticated
    using (true);

drop policy if exists "follow as yourself" on public.follows;
create policy "follow as yourself"
    on public.follows for insert
    with check (follower_id = auth.uid());

drop policy if exists "unfollow your own follow" on public.follows;
create policy "unfollow your own follow"
    on public.follows for delete
    using (follower_id = auth.uid());

create index if not exists follows_followed_id_idx on public.follows (followed_id);
create index if not exists follows_follower_id_idx on public.follows (follower_id);

create or replace function public.notify_new_follower()
returns trigger as $$
declare
    v_follower_username text;
    v_master_enabled boolean;
begin
    select notifications_enabled into v_master_enabled from public.notification_preferences where user_id = new.followed_id;
    if coalesce(v_master_enabled, true) then
        select username into v_follower_username from public.profiles where id = new.follower_id;
        insert into public.notifications (user_id, actor_id, actor_username, type)
        values (new.followed_id, new.follower_id, coalesce(v_follower_username, ''), 'follow');
    end if;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_follow_created_notify on public.follows;
create trigger on_follow_created_notify
    after insert on public.follows
    for each row execute function public.notify_new_follower();

-- Notification preference: whether a new post from someone you follow
-- (as opposed to a friend) generates a notification. Separate from
-- friend-post notifications so the two can be configured independently
-- — "notify me about friends' posts" and "notify me about follows'
-- posts" are genuinely different appetites.
alter table public.notification_preferences
    add column if not exists follow_posts boolean not null default true;
alter table public.notification_preferences
    add column if not exists friend_posts boolean not null default false;

-- Fires on every new post; fans out to followers (if they want
-- follow-post notifications) and separately to friends (if they want
-- friend-post notifications) — a person who is both a friend and a
-- follower only gets one notification, not two, via the union+distinct
-- below rather than two separate inserts.
create or replace function public.notify_new_post()
returns trigger as $$
declare
    v_author_username text;
begin
    select username into v_author_username from public.profiles where id = new.author_id;

    insert into public.notifications (user_id, type, actor_id, actor_username, post_id, body)
    select recipient_id, 'new_post', new.author_id, coalesce(v_author_username, ''), new.id, 'posted something new'
    from (
        select f.follower_id as recipient_id
        from public.follows f
        join public.notification_preferences np on np.user_id = f.follower_id
        where f.followed_id = new.author_id
          and coalesce(np.notifications_enabled, true)
          and coalesce(np.follow_posts, true)
        union
        select fv.user_id as recipient_id
        from public.friends_view fv
        join public.notification_preferences np on np.user_id = fv.user_id
        where fv.friend_id = new.author_id
          and coalesce(np.notifications_enabled, true)
          and coalesce(np.friend_posts, false)
    ) recipients
    where recipient_id != new.author_id;

    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_post_created_notify on public.posts;
create trigger on_post_created_notify
    after insert on public.posts
    for each row execute function public.notify_new_post();
