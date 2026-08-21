-- Master notifications on/off toggle (Settings → Notifications).
-- Per explicit spec: if notifications are enabled at all, DMs always
-- notify — that's no longer an individually-disableable category, only
-- the master switch controls it. Other categories (reactions, comments,
-- friend requests, space invites) stay individually configurable
-- underneath the master switch, same as before.

alter table public.notification_preferences
    add column if not exists notifications_enabled boolean not null default true;

-- notify_channel_message (DMs/space messages): now gated on the master
-- switch only, not the old `messages` column — that column is left in
-- place (harmless, just unused) rather than dropped, so this migration
-- doesn't have to touch application code that might still reference it
-- during a rolling deploy.
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
      and coalesce(np.notifications_enabled, true);
    return new;
end;
$$ language plpgsql security definer;

-- The other three notification-producing triggers each get the same
-- "AND master switch" added to their existing per-category check.
create or replace function public.notify_post_comment()
returns trigger as $$
declare
    v_author_id uuid;
    v_actor_username text;
    v_wants_notif boolean;
    v_master_enabled boolean;
begin
    select author_id into v_author_id from public.posts where id = new.post_id;
    if v_author_id is null or v_author_id = new.author_id then
        return new;
    end if;
    select comments, notifications_enabled into v_wants_notif, v_master_enabled
        from public.notification_preferences where user_id = v_author_id;
    if coalesce(v_wants_notif, true) and coalesce(v_master_enabled, true) then
        select username into v_actor_username from public.profiles where id = new.author_id;
        insert into public.notifications (user_id, type, actor_id, actor_username, post_id, body)
        values (v_author_id, 'comment', new.author_id, v_actor_username, new.post_id, 'commented on your post');
    end if;
    return new;
end;
$$ language plpgsql security definer;

create or replace function public.notify_post_reaction()
returns trigger as $$
declare
    v_author_id uuid;
    v_actor_username text;
    v_wants_notif boolean;
    v_master_enabled boolean;
begin
    select author_id into v_author_id from public.posts where id = new.post_id;
    if v_author_id is null or v_author_id = new.user_id then
        return new;
    end if;
    select reactions, notifications_enabled into v_wants_notif, v_master_enabled
        from public.notification_preferences where user_id = v_author_id;
    if coalesce(v_wants_notif, true) and coalesce(v_master_enabled, true) then
        select username into v_actor_username from public.profiles where id = new.user_id;
        insert into public.notifications (user_id, type, actor_id, actor_username, post_id, body)
        values (v_author_id, 'reaction', new.user_id, v_actor_username, new.post_id, 'reacted ' || new.emoji || ' to your post');
    end if;
    return new;
end;
$$ language plpgsql security definer;

create or replace function public.handle_friend_request_notify()
returns trigger as $$
declare
    v_actor_username text;
    v_wants_notif boolean;
    v_master_enabled boolean;
begin
    if (tg_op = 'INSERT') then
        select friend_requests, notifications_enabled into v_wants_notif, v_master_enabled
            from public.notification_preferences where user_id = new.recipient_id;
        if coalesce(v_wants_notif, true) and coalesce(v_master_enabled, true) then
            select username into v_actor_username from public.profiles where id = new.sender_id;
            insert into public.notifications (user_id, actor_id, actor_username, type)
            values (new.recipient_id, new.sender_id, coalesce(v_actor_username, ''), 'friend_request');
        end if;
    elsif (tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending') then
        select friend_requests, notifications_enabled into v_wants_notif, v_master_enabled
            from public.notification_preferences where user_id = new.sender_id;
        if coalesce(v_wants_notif, true) and coalesce(v_master_enabled, true) then
            select username into v_actor_username from public.profiles where id = new.recipient_id;
            insert into public.notifications (user_id, actor_id, actor_username, type)
            values (new.sender_id, new.recipient_id, coalesce(v_actor_username, ''), 'friend_accept');
        end if;
    end if;
    return new;
end;
$$ language plpgsql security definer;
