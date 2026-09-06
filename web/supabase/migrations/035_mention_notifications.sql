-- @mentions were only ever a client-side rendering feature: markdown.tsx
-- (findMentionMatch) turns "@username" into a clickable link to that
-- profile, but nothing on the backend ever noticed a mention happened.
-- notify_channel_message() (001, refined in 005/016) already fires a
-- generic 'message' notification for every channel member on every
-- message — fine for a DM, but it means someone specifically @'d in a
-- busy space channel gets the exact same undifferentiated "new message"
-- notification as everyone else in that channel, with nothing calling
-- out that they were personally singled out. That's the actual gap:
-- every real chat product treats "you were mentioned" as its own,
-- more prominent thing, and this app had the visual mention styling
-- without any of the notification behavior behind it.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
    check (type in ('message', 'reaction', 'comment', 'space_invite', 'friend_request', 'friend_accept', 'new_post', 'follow', 'mention'));

create or replace function public.notify_message_mentions()
returns trigger as $$
declare
    v_sender_username text;
begin
    select username into v_sender_username from public.profiles where id = new.sender_id;

    insert into public.notifications (user_id, type, actor_id, actor_username, channel_id, body)
    select distinct pr.id, 'mention', new.sender_id, v_sender_username, new.channel_id,
           left(new.body_rendered, 80)
    from regexp_matches(new.body_raw, '@([a-zA-Z0-9_]{2,32})', 'g') as m(handle)
    join public.profiles pr on lower(pr.username) = lower(m.handle[1])
    join public.channel_members cm on cm.channel_id = new.channel_id and cm.user_id = pr.id
    left join public.notification_preferences np on np.user_id = pr.id
    where pr.id != new.sender_id
      -- Only counts as a mention if the person is actually reachable
      -- in this conversation (a member of the channel) — someone
      -- typing an unrelated "@someone" who isn't even in the chat
      -- shouldn't spawn a notification pointing at a channel they
      -- have no access to.
      and coalesce(np.notifications_enabled, true);
    return new;
end;
$$ language plpgsql security definer;

create trigger on_message_mentions
    after insert on public.messages
    for each row execute function public.notify_message_mentions();
