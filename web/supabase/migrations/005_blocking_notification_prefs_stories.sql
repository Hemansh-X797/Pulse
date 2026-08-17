-- 005_blocking_notification_prefs_stories.sql
-- Run after 004_friends_and_usernames.sql.

begin;

-- ---------- 1: blocked users, with actual enforcement ----------
create table if not exists public.blocked_users (
    blocker_id uuid not null references public.profiles(id) on delete cascade,
    blocked_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    constraint no_self_block check (blocker_id <> blocked_id)
);

alter table public.blocked_users enable row level security;

drop policy if exists "manage your own block list" on public.blocked_users;
create policy "manage your own block list"
    on public.blocked_users for all
    using (blocker_id = auth.uid())
    with check (blocker_id = auth.uid());

-- Blocking has to actually change behavior, not just exist as a list:
-- feed_view excludes posts from anyone you've blocked OR who has
-- blocked you (mutual — same as every mainstream platform).
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
join public.profiles pr on pr.id = p.author_id
where not exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = p.author_id)
       or (b.blocker_id = p.author_id and b.blocked_id = auth.uid())
);

-- Friend requests: blocked party can't send one. (Doesn't retroactively
-- cancel an existing friendship — blocking a current friend is a
-- separate "unfriend" action in the UI, not silently bundled in here.)
create or replace function public.check_not_blocked_before_friend_request()
returns trigger as $$
begin
    if exists (
        select 1 from public.blocked_users
        where (blocker_id = new.recipient_id and blocked_id = new.sender_id)
           or (blocker_id = new.sender_id and blocked_id = new.recipient_id)
    ) then
        raise exception 'cannot send a friend request to or from a blocked user';
    end if;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists before_friend_request_check_blocked on public.friend_requests;
create trigger before_friend_request_check_blocked
    before insert on public.friend_requests
    for each row execute function public.check_not_blocked_before_friend_request();

-- Messages: blocked party can't send into a shared DM channel either.
create or replace function public.check_not_blocked_before_message()
returns trigger as $$
begin
    if exists (
        select 1
        from public.channel_members cm
        join public.blocked_users b
          on (b.blocker_id = cm.user_id and b.blocked_id = new.sender_id)
          or (b.blocker_id = new.sender_id and b.blocked_id = cm.user_id)
        where cm.channel_id = new.channel_id and cm.user_id <> new.sender_id
    ) then
        raise exception 'cannot message a blocked user';
    end if;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists before_message_check_blocked on public.messages;
create trigger before_message_check_blocked
    before insert on public.messages
    for each row execute function public.check_not_blocked_before_message();

-- ---------- 2: notification preferences (per-user, actually enforced) ----------
create table if not exists public.notification_preferences (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    messages boolean not null default true,
    reactions boolean not null default true,
    comments boolean not null default true,
    friend_requests boolean not null default true,
    space_invites boolean not null default true,
    updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "manage your own notification prefs" on public.notification_preferences;
create policy "manage your own notification prefs"
    on public.notification_preferences for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Default row on signup, same pattern as the existing profile-creation trigger.
create or replace function public.handle_new_notification_prefs()
returns trigger as $$
begin
    insert into public.notification_preferences (user_id) values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_created_notification_prefs on public.profiles;
create trigger on_profile_created_notification_prefs
    after insert on public.profiles
    for each row execute function public.handle_new_notification_prefs();

-- Backfill for existing users (the trigger only covers new signups from here on).
insert into public.notification_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- Gate the friend-request/friend-accept notification trigger from
-- migration 004 on the recipient's preference — a toggle that nothing
-- checks isn't a real feature, same lesson as the unread-counts bug
-- from earlier in this project.
create or replace function public.handle_friend_request_notify()
returns trigger as $$
declare
    v_actor_username text;
    v_wants_notif boolean;
begin
    if (tg_op = 'INSERT') then
        select friend_requests into v_wants_notif from public.notification_preferences where user_id = new.recipient_id;
        if coalesce(v_wants_notif, true) then
            select username into v_actor_username from public.profiles where id = new.sender_id;
            insert into public.notifications (user_id, actor_id, actor_username, type)
            values (new.recipient_id, new.sender_id, coalesce(v_actor_username, ''), 'friend_request');
        end if;
    elsif (tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending') then
        select friend_requests into v_wants_notif from public.notification_preferences where user_id = new.sender_id;
        if coalesce(v_wants_notif, true) then
            select username into v_actor_username from public.profiles where id = new.recipient_id;
            insert into public.notifications (user_id, actor_id, actor_username, type)
            values (new.sender_id, new.recipient_id, coalesce(v_actor_username, ''), 'friend_accept');
        end if;
    end if;
    return new;
end;
$$ language plpgsql security definer;

-- ---------- 3: stories ----------
create table if not exists public.stories (
    id bigint generated always as identity primary key,
    author_id uuid not null references public.profiles(id) on delete cascade,
    media_url text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table public.stories enable row level security;

-- Visible to: the author, and anyone who is a friend of the author
-- (reuses friends_view rather than a separate followers concept, since
-- PalSpace doesn't have a public-follow model — friendship is mutual
-- already, which maps cleanly to "who sees my story").
drop policy if exists "see your own and friends' active stories" on public.stories;
create policy "see your own and friends' active stories"
    on public.stories for select
    using (
        expires_at > now()
        and (
            author_id = auth.uid()
            or author_id in (select friend_id from public.friends_view where user_id = auth.uid())
        )
    );

drop policy if exists "post your own stories" on public.stories;
create policy "post your own stories"
    on public.stories for insert
    with check (author_id = auth.uid());

drop policy if exists "delete your own stories" on public.stories;
create policy "delete your own stories"
    on public.stories for delete
    using (author_id = auth.uid());

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stories'
    ) then
        alter publication supabase_realtime add table public.stories;
    end if;
end $$;

-- Gate the three pre-existing notification triggers (comment/reaction/
-- message, all from schema.sql) on notification_preferences the same
-- way — a toggle only means something if something actually checks it.
create or replace function public.notify_post_comment()
returns trigger as $$
declare
    v_author_id uuid;
    v_actor_username text;
    v_wants_notif boolean;
begin
    select author_id into v_author_id from public.posts where id = new.post_id;
    if v_author_id is null or v_author_id = new.author_id then
        return new;
    end if;
    select comments into v_wants_notif from public.notification_preferences where user_id = v_author_id;
    if not coalesce(v_wants_notif, true) then
        return new;
    end if;
    select username into v_actor_username from public.profiles where id = new.author_id;
    insert into public.notifications (user_id, type, actor_id, actor_username, post_id, body)
    values (v_author_id, 'comment', new.author_id, v_actor_username, new.post_id, 'commented on your post');
    return new;
end;
$$ language plpgsql security definer;

create or replace function public.notify_post_reaction()
returns trigger as $$
declare
    v_author_id uuid;
    v_actor_username text;
    v_wants_notif boolean;
begin
    select author_id into v_author_id from public.posts where id = new.post_id;
    if v_author_id is null or v_author_id = new.user_id then
        return new;
    end if;
    select reactions into v_wants_notif from public.notification_preferences where user_id = v_author_id;
    if not coalesce(v_wants_notif, true) then
        return new;
    end if;
    select username into v_actor_username from public.profiles where id = new.user_id;
    insert into public.notifications (user_id, type, actor_id, actor_username, post_id, body)
    values (v_author_id, 'reaction', new.user_id, v_actor_username, new.post_id, 'reacted ' || new.emoji || ' to your post');
    return new;
end;
$$ language plpgsql security definer;

create or replace function public.notify_channel_message()
returns trigger as $$
declare
    v_sender_username text;
begin
    select username into v_sender_username from public.profiles where id = new.sender_id;
    insert into public.notifications (user_id, type, actor_id, actor_username, channel_id, body)
    select cm.user_id, 'message', new.sender_id, v_sender_username, new.channel_id,
           left(new.body_rendered, 80)
    from public.channel_members cm
    left join public.notification_preferences np on np.user_id = cm.user_id
    where cm.channel_id = new.channel_id
      and cm.user_id != new.sender_id
      and coalesce(np.messages, true);
    return new;
end;
$$ language plpgsql security definer;

commit;
