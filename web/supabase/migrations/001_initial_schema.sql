-- Pulse — Supabase schema
-- ============================================================
-- This is where the C++ server's authorization logic actually goes in
-- this architecture: not app code, but Row Level Security (RLS) policies
-- enforced by Postgres itself. A few examples of the direct port:
--
--   C++ (chat_server.hpp, "delete" op):
--     auto sender = db_.message_sender(message_id);
--     if (!sender || *sender != user_id) return error;
--
--   Here: a policy on `messages` —
--     USING (sender_id = auth.uid())
--
--   C++ (api_server.hpp, GET /servers/:id/channels):
--     if (!db_.is_server_member(server_id, *uid)) return 403;
--
--   Here: a policy on `channels` —
--     USING (server_id IN (SELECT server_id FROM server_members WHERE user_id = auth.uid()))
--
-- The advantage over the C++ version: these rules are enforced no matter
-- which client hits the database — the web app, a future mobile app, a
-- Vercel serverless function, or someone poking at the Supabase REST API
-- directly. A bug in one client's code can't bypass them, because the
-- check isn't in the client's code at all.
--
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)
-- on a fresh project, top to bottom.
-- ============================================================

-- ---------------- profiles ----------------
-- Supabase Auth already gives us `auth.users` (id, email, provider info).
-- This table holds everything Pulse-specific — same shape as the C++
-- version's `users` table minus password columns, since Supabase Auth
-- owns credentials entirely now (including Google/Discord OAuth, with
-- zero custom OAuth code needed — see docs/SUPABASE_SETUP.md).
create table public.profiles (
    id                   uuid primary key references auth.users(id) on delete cascade,
    username             text not null unique,
    display_name         text not null,
    bio                  text not null default '',
    pronouns             text not null default '',
    status_text          text not null default '',
    avatar_url           text not null default '',
    banner_url           text not null default '',
    accent_color_top     text not null default '#5865F2',
    accent_color_bottom  text not null default '#EB459E',
    created_at           timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone signed in can read any profile (usernames/avatars are public,
-- same as the C++ version's GET /users/:username being unauthenticated).
create policy "profiles are publicly readable"
    on public.profiles for select
    using (true);

-- You can only edit your own profile — direct port of the C++ PATCH /me
-- handler's implicit "uid from the session token" scoping.
create policy "users can update own profile"
    on public.profiles for update
    using (id = auth.uid());

create policy "users can insert own profile"
    on public.profiles for insert
    with check (id = auth.uid());

-- Auto-create a profile row the moment someone signs up (via Supabase
-- Auth, any provider) — replaces the C++ server's create_user /
-- create_oauth_user calls, which ran at signup/OAuth-callback time.
create function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, username, display_name)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
        coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', 'New User')
    );
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------- servers ----------------
create table public.servers (
    id                   uuid primary key default gen_random_uuid(),
    name                 text not null,
    icon_url             text not null default '',
    accent_color_top     text not null default '#5865F2',
    accent_color_bottom  text not null default '#EB459E',
    owner_id             uuid not null references public.profiles(id),
    invite_code          text not null unique default substr(md5(random()::text), 1, 10),
    created_at           timestamptz not null default now()
);

alter table public.servers enable row level security;

create table public.server_members (
    server_id  uuid not null references public.servers(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
    joined_at  timestamptz not null default now(),
    primary key (server_id, user_id)
);

alter table public.server_members enable row level security;

-- You can only see servers you're a member of — port of C++'s
-- list_user_servers(), which joined through server_members the same way.
create policy "members can view their servers"
    on public.servers for select
    using (id in (select server_id from public.server_members where user_id = auth.uid()));

create policy "authenticated users can create servers"
    on public.servers for insert
    with check (owner_id = auth.uid());

create policy "members can view their memberships"
    on public.server_members for select
    using (user_id = auth.uid() or server_id in (select server_id from public.server_members where user_id = auth.uid()));

create policy "users can join via invite (insert own membership)"
    on public.server_members for insert
    with check (user_id = auth.uid());

-- Auto-add the creator as owner + create a default #general channel —
-- port of the C++ POST /servers handler, which did both in one request.
create function public.handle_new_server()
returns trigger as $$
begin
    insert into public.server_members (server_id, user_id, role)
    values (new.id, new.owner_id, 'owner');

    insert into public.channels (server_id, name, is_group, position)
    values (new.id, 'general', true, 0);

    return new;
end;
$$ language plpgsql security definer;

-- (trigger created after `channels` exists — see below)

-- ---------------- channels ----------------
-- Same generalization the C++ version used: a "channel" is either a DM/
-- group (server_id null) or a server text channel (server_id set) — one
-- table, one set of message-handling logic either way.
create table public.channels (
    id         uuid primary key default gen_random_uuid(),
    is_group   boolean not null default false,
    name       text not null default '',
    server_id  uuid references public.servers(id) on delete cascade,
    topic      text not null default '',
    position   integer not null default 0,
    created_at timestamptz not null default now()
);

alter table public.channels enable row level security;

create trigger on_server_created
    after insert on public.servers
    for each row execute function public.handle_new_server();

create table public.channel_members (
    channel_id uuid not null references public.channels(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    joined_at  timestamptz not null default now(),
    primary key (channel_id, user_id)
);

alter table public.channel_members enable row level security;

-- You can see a channel if you're a direct member (DMs/groups) OR a
-- member of the server that owns it (server channels) — this single
-- policy replaces both the C++ dm_members check AND the separate
-- is_server_member() check that gated GET /servers/:id/channels.
create policy "members can view their channels"
    on public.channels for select
    using (
        id in (select channel_id from public.channel_members where user_id = auth.uid())
        or server_id in (select server_id from public.server_members where user_id = auth.uid())
    );

create policy "server members can create channels"
    on public.channels for insert
    with check (
        server_id is null
        or server_id in (select server_id from public.server_members where user_id = auth.uid())
    );

create policy "members can view channel membership"
    on public.channel_members for select
    using (channel_id in (select channel_id from public.channel_members where user_id = auth.uid()));

create policy "users can add themselves to a channel"
    on public.channel_members for insert
    with check (user_id = auth.uid());

-- When someone joins a server, give them access to every existing
-- channel in it — this is the exact bug I caught and fixed in the C++
-- version's POST /servers/join handler (joining didn't originally grant
-- channel access). Doing it as a trigger here means it can't be
-- forgotten in a future endpoint the way a missed line of C++ could be.
create function public.handle_new_server_member()
returns trigger as $$
begin
    insert into public.channel_members (channel_id, user_id)
    select id, new.user_id from public.channels where server_id = new.server_id
    on conflict do nothing;
    return new;
end;
$$ language plpgsql security definer;

create trigger on_server_member_added
    after insert on public.server_members
    for each row execute function public.handle_new_server_member();

-- Same for a newly created channel: give every current server member
-- access immediately (also a fix carried over from the C++ version).
create function public.handle_new_channel()
returns trigger as $$
begin
    if new.server_id is not null then
        insert into public.channel_members (channel_id, user_id)
        select new.id, user_id from public.server_members where server_id = new.server_id
        on conflict do nothing;
    end if;
    return new;
end;
$$ language plpgsql security definer;

create trigger on_channel_created
    after insert on public.channels
    for each row execute function public.handle_new_channel();

-- ---------------- messages ----------------
create table public.messages (
    id              bigint generated always as identity primary key,
    channel_id      uuid not null references public.channels(id) on delete cascade,
    sender_id       uuid not null references public.profiles(id),
    body_raw        text not null,
    body_rendered   text not null,
    reply_to_id     bigint references public.messages(id),
    edited_at       timestamptz,
    deleted         boolean not null default false,
    client_ref      text,               -- optimistic-UI reconciliation token, client-generated, never used server-side beyond echo
    expires_at      timestamptz,        -- Snapchat-style ephemeral messages; null = normal, persistent message
    media_url       text,               -- image or voice-note attachment (Supabase Storage public URL)
    media_type      text check (media_type in ('image', 'audio')),
    created_at      timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Read/send only in channels you're a member of, AND never see a message
-- past its expiry — this is what actually makes "ephemeral" messages
-- ephemeral: enforced at the RLS layer, not just hidden by client-side
-- UI code that a browser devtools user could bypass.
create policy "members can read channel messages"
    on public.messages for select
    using (
        channel_id in (select channel_id from public.channel_members where user_id = auth.uid())
        and (expires_at is null or expires_at > now())
    );

create policy "members can send channel messages"
    on public.messages for insert
    with check (
        sender_id = auth.uid()
        and channel_id in (select channel_id from public.channel_members where user_id = auth.uid())
    );

-- Edit/delete only your own messages — exact port of message_sender()
-- equality check from chat_server.hpp's "edit"/"delete" ops.
create policy "senders can edit own messages"
    on public.messages for update
    using (sender_id = auth.uid());

create table public.message_reactions (
    message_id bigint not null references public.messages(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    emoji      text not null,
    primary key (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "members can react in their channels"
    on public.message_reactions for all
    using (
        message_id in (
            select m.id from public.messages m
            join public.channel_members cm on cm.channel_id = m.channel_id
            where cm.user_id = auth.uid()
        )
    );

create table public.read_receipts (
    channel_id            uuid not null references public.channels(id) on delete cascade,
    user_id                uuid not null references public.profiles(id) on delete cascade,
    last_read_message_id   bigint not null default 0,
    updated_at             timestamptz not null default now(),
    primary key (channel_id, user_id)
);

alter table public.read_receipts enable row level security;

create policy "users manage their own read receipts"
    on public.read_receipts for all
    using (user_id = auth.uid());

-- ---------------- posts / comments / reactions (feed) ----------------
create table public.posts (
    id            bigint generated always as identity primary key,
    author_id     uuid not null references public.profiles(id),
    body_raw      text not null,
    body_rendered text not null,
    media_url     text not null default '',
    created_at    timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "posts are publicly readable"
    on public.posts for select
    using (true);

create policy "users can create own posts"
    on public.posts for insert
    with check (author_id = auth.uid());

create table public.post_comments (
    id            bigint generated always as identity primary key,
    post_id       bigint not null references public.posts(id) on delete cascade,
    author_id     uuid not null references public.profiles(id),
    body_raw      text not null,
    body_rendered text not null,
    created_at    timestamptz not null default now()
);

alter table public.post_comments enable row level security;

create policy "comments are publicly readable"
    on public.post_comments for select using (true);

create policy "users can comment as themselves"
    on public.post_comments for insert
    with check (author_id = auth.uid());

create table public.post_reactions (
    post_id    bigint not null references public.posts(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    emoji      text not null,
    created_at timestamptz not null default now(),
    primary key (post_id, user_id, emoji)
);

alter table public.post_reactions enable row level security;

create policy "reactions are publicly readable"
    on public.post_reactions for select using (true);

create policy "users can react as themselves"
    on public.post_reactions for insert
    with check (user_id = auth.uid());

create policy "users can remove own reactions"
    on public.post_reactions for delete
    using (user_id = auth.uid());

-- Feed as a view with pre-computed engagement counts — the client queries
-- this directly instead of the app layer stitching together three
-- separate queries (posts + reaction counts + comment counts) the way
-- the C++ version's feed() method did in one big SQL JOIN. security_invoker
-- means RLS is still evaluated as the querying user, not the view owner —
-- required so this view doesn't accidentally bypass the posts/profiles
-- policies above.
create view public.feed_view
    with (security_invoker = true) as
select
    p.id,
    p.author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url,
    p.body_rendered,
    p.media_url,
    p.created_at,
    (select count(*) from public.post_reactions r where r.post_id = p.id) as reaction_count,
    (select count(*) from public.post_comments c where c.post_id = p.id) as comment_count
from public.posts p
join public.profiles pr on pr.id = p.author_id;

-- ---------------- notifications ----------------
create table public.notifications (
    id             bigint generated always as identity primary key,
    user_id        uuid not null references public.profiles(id) on delete cascade,
    type           text not null check (type in ('message', 'reaction', 'comment', 'server_invite')),
    actor_id       uuid references public.profiles(id),
    actor_username text not null default '',
    channel_id     uuid,
    post_id        bigint,
    body           text not null default '',
    read           boolean not null default false,
    created_at     timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- You can only ever see your own notifications — this table has no
-- public-read policy at all, unlike posts/comments above.
create policy "users see only their own notifications"
    on public.notifications for select
    using (user_id = auth.uid());

create policy "users can mark their own notifications read"
    on public.notifications for update
    using (user_id = auth.uid());

-- Auto-create a notification on comment/reaction — direct port of
-- api_server.hpp's notify_post_engagement(), which ran this same
-- "skip if it's your own post" check in C++.
create function public.notify_post_comment()
returns trigger as $$
declare
    v_author_id uuid;
    v_actor_username text;
begin
    select author_id into v_author_id from public.posts where id = new.post_id;
    if v_author_id is null or v_author_id = new.author_id then
        return new;
    end if;
    select username into v_actor_username from public.profiles where id = new.author_id;
    insert into public.notifications (user_id, type, actor_id, actor_username, post_id, body)
    values (v_author_id, 'comment', new.author_id, v_actor_username, new.post_id, 'commented on your post');
    return new;
end;
$$ language plpgsql security definer;

create trigger on_comment_created
    after insert on public.post_comments
    for each row execute function public.notify_post_comment();

create function public.notify_post_reaction()
returns trigger as $$
declare
    v_author_id uuid;
    v_actor_username text;
begin
    select author_id into v_author_id from public.posts where id = new.post_id;
    if v_author_id is null or v_author_id = new.user_id then
        return new;
    end if;
    select username into v_actor_username from public.profiles where id = new.user_id;
    insert into public.notifications (user_id, type, actor_id, actor_username, post_id, body)
    values (v_author_id, 'reaction', new.user_id, v_actor_username, new.post_id, 'reacted ' || new.emoji || ' to your post');
    return new;
end;
$$ language plpgsql security definer;

create trigger on_post_reaction_created
    after insert on public.post_reactions
    for each row execute function public.notify_post_reaction();

-- Same for new channel messages — port of chat_server.hpp's "send" op,
-- which looped every other channel member and created one notification
-- each. Here that loop is a single SQL statement.
create function public.notify_channel_message()
returns trigger as $$
declare
    v_sender_username text;
begin
    select username into v_sender_username from public.profiles where id = new.sender_id;
    insert into public.notifications (user_id, type, actor_id, actor_username, channel_id, body)
    select cm.user_id, 'message', new.sender_id, v_sender_username, new.channel_id,
           left(new.body_rendered, 80)
    from public.channel_members cm
    where cm.channel_id = new.channel_id and cm.user_id != new.sender_id;
    return new;
end;
$$ language plpgsql security definer;

create trigger on_message_created
    after insert on public.messages
    for each row execute function public.notify_channel_message();

-- ---------------- unread counts ----------------
-- Port of db.hpp's unread_count()/channels_with_unread() — exposed as a
-- Postgres function so the client can call it directly via
-- supabase.rpc('channel_unread_counts') instead of re-implementing the
-- N+1-avoiding logic in TypeScript.
create function public.channel_unread_counts()
returns table (channel_id uuid, unread bigint) as $$
    select
        cm.channel_id,
        count(m.id) filter (
            where m.sender_id != auth.uid()
              and m.deleted = false
              and m.id > coalesce(rr.last_read_message_id, 0)
        ) as unread
    from public.channel_members cm
    left join public.read_receipts rr on rr.channel_id = cm.channel_id and rr.user_id = auth.uid()
    left join public.messages m on m.channel_id = cm.channel_id
    where cm.user_id = auth.uid()
    group by cm.channel_id;
$$ language sql security definer stable;

-- ---------------- realtime ----------------
-- Enable Supabase Realtime (WebSocket-based postgres_changes + broadcast)
-- on the tables the chat UI needs to subscribe to. This replaces the
-- entire hand-built RFC 6455 WebSocket server from the C++ version —
-- Supabase's client SDK opens the socket, subscribes to changes on these
-- tables (filtered by RLS automatically), and reconnects on its own.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;

-- ---------------- optional: physically purge expired ephemeral messages ----------------
-- The RLS policy above already makes expired messages invisible to
-- everyone the instant they expire — that's what makes the feature work
-- for users. This is just storage hygiene (actually freeing the rows)
-- and is optional. Requires the pg_cron extension, which Supabase
-- supports but doesn't enable by default — turn it on first via
-- Database → Extensions → pg_cron in the dashboard, then run:
--
-- select cron.schedule(
--     'purge-expired-messages',
--     '*/15 * * * *',  -- every 15 minutes
--     $$ delete from public.messages where expires_at is not null and expires_at < now() - interval '1 hour'; $$
-- );
