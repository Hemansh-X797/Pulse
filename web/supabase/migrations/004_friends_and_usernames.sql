-- 004_friends_and_usernames.sql
-- Run after 003_storage_and_engagement_fixes.sql.

begin;

-- ---------- 1: usernames must be unique (they weren't) ----------
-- Case-insensitive uniqueness (citext-free approach: a lowercased
-- expression index) so "Victor" and "victor" can't both be taken —
-- that's the more common expectation for handles.
alter table public.profiles alter column username set not null;
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

create or replace function public.is_username_available(p_username text)
returns boolean as $$
    select not exists (
        select 1 from public.profiles where lower(username) = lower(p_username)
    );
$$ language sql stable;
-- profiles already has an "users can update own profile" UPDATE policy
-- (schema.sql) with no column restriction, so username edits are already
-- covered — no new policy needed here.

-- ---------- 2: friend requests ----------
create table if not exists public.friend_requests (
    id bigint generated always as identity primary key,
    sender_id uuid not null references public.profiles(id) on delete cascade,
    recipient_id uuid not null references public.profiles(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
    created_at timestamptz not null default now(),
    responded_at timestamptz,
    constraint no_self_request check (sender_id <> recipient_id),
    -- one live request per direction; re-sending after a decline is a
    -- new row (old one stays as history) rather than blocked forever
    unique (sender_id, recipient_id, status)
);

alter table public.friend_requests enable row level security;

drop policy if exists "see requests you sent or received" on public.friend_requests;
create policy "see requests you sent or received"
    on public.friend_requests for select
    using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "send requests as yourself" on public.friend_requests;
create policy "send requests as yourself"
    on public.friend_requests for insert
    with check (sender_id = auth.uid());

drop policy if exists "recipient can respond, sender can cancel" on public.friend_requests;
create policy "recipient can respond, sender can cancel"
    on public.friend_requests for update
    using (recipient_id = auth.uid() or sender_id = auth.uid())
    with check (recipient_id = auth.uid() or sender_id = auth.uid());

drop policy if exists "sender can delete a pending request" on public.friend_requests;
create policy "sender can delete a pending request"
    on public.friend_requests for delete
    using (sender_id = auth.uid() and status = 'pending');

-- Bidirectional "are we friends" view: an accepted request read from
-- either side, normalized to (me, friend) rows so listFriends() is a
-- single simple query instead of a UNION on the client.
create or replace view public.friends_view
    with (security_invoker = true) as
select recipient_id as user_id, sender_id as friend_id, responded_at as friends_since
from public.friend_requests
where status = 'accepted'
union all
select sender_id as user_id, recipient_id as friend_id, responded_at as friends_since
from public.friend_requests
where status = 'accepted';

-- Notify on request + on accept — reuses the space_invite/friend_request/
-- friend_accept notification types already added in migration 003.
create or replace function public.handle_friend_request_notify()
returns trigger as $$
declare
    v_actor_username text;
begin
    if (tg_op = 'INSERT') then
        select username into v_actor_username from public.profiles where id = new.sender_id;
        insert into public.notifications (user_id, actor_id, actor_username, type)
        values (new.recipient_id, new.sender_id, coalesce(v_actor_username, ''), 'friend_request');
    elsif (tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending') then
        select username into v_actor_username from public.profiles where id = new.recipient_id;
        insert into public.notifications (user_id, actor_id, actor_username, type)
        values (new.sender_id, new.recipient_id, coalesce(v_actor_username, ''), 'friend_accept');
    end if;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_friend_request_change on public.friend_requests;
create trigger on_friend_request_change
    after insert or update on public.friend_requests
    for each row execute function public.handle_friend_request_notify();

commit;
