-- Two things, both found while wiring up the full message context
-- menu (copy, mark unread, forward, pin, react):

-- ---------- 1: fix a real RLS gap on message_reactions ----------
-- message_reactions had a single "for all using (...)" policy that
-- only checked whether the *message* is in a channel you belong to —
-- it never checked that the *reaction row itself* belongs to you. For
-- ALL policies, a bare USING clause (no separate WITH CHECK) applies
-- to every operation including INSERT, so as written this let any
-- channel member insert a reaction row with someone ELSE's user_id
-- (impersonating their reaction), or delete another member's reaction
-- outright. post_reactions (same idea, for feed posts) already got
-- this right from the start — SELECT open to anyone who can see the
-- post, INSERT/DELETE restricted to `user_id = auth.uid()`.
-- message_reactions is the one place this pattern wasn't applied;
-- fixing it to match now, before adding any UI that writes to it.
drop policy if exists "members can react in their channels" on public.message_reactions;

create policy "channel members can read message reactions"
    on public.message_reactions for select
    using (
        message_id in (
            select m.id from public.messages m
            join public.channel_members cm on cm.channel_id = m.channel_id
            where cm.user_id = auth.uid()
        )
    );

create policy "users can react as themselves"
    on public.message_reactions for insert
    with check (
        user_id = auth.uid()
        and message_id in (
            select m.id from public.messages m
            join public.channel_members cm on cm.channel_id = m.channel_id
            where cm.user_id = auth.uid()
        )
    );

create policy "users can remove their own message reactions"
    on public.message_reactions for delete
    using (user_id = auth.uid());

-- ---------- 2: pinned messages ----------
-- A separate table rather than a `pinned` column on messages itself:
-- the existing UPDATE policy on messages ("update using (sender_id =
-- auth.uid())", from 001_initial_schema.sql) only lets the ORIGINAL
-- SENDER update their own message — which is right for editing text,
-- but wrong for pinning, since pinning is something any channel
-- member should be able to do to anyone's message. Rather than
-- loosening the messages UPDATE policy (which would then also let
-- pinning-motivated updates slip in alongside body edits), a dedicated
-- join table gets its own, narrower RLS instead.
create table public.pinned_messages (
    message_id  bigint not null references public.messages(id) on delete cascade,
    channel_id  uuid not null references public.channels(id) on delete cascade,
    pinned_by   uuid not null references public.profiles(id) on delete cascade,
    pinned_at   timestamptz not null default now(),
    primary key (message_id)
);

alter table public.pinned_messages enable row level security;

create policy "channel members can view pins"
    on public.pinned_messages for select
    using (public.is_channel_member(channel_id, auth.uid()));

create policy "channel members can pin messages"
    on public.pinned_messages for insert
    with check (
        pinned_by = auth.uid()
        and public.is_channel_member(channel_id, auth.uid())
    );

create policy "channel members can unpin messages"
    on public.pinned_messages for delete
    using (public.is_channel_member(channel_id, auth.uid()));
