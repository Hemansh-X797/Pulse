-- Real push notifications — up to now, "notifications" only ever meant
-- rows in the `notifications` table plus an in-app chime/badge while
-- the tab is open. Nothing arrived at the OS/browser level the way
-- Discord or Instagram's actually do (a real notification popping up
-- even when PalSpace isn't the focused tab, or isn't open at all).
-- That requires: somewhere to store each device's Web Push
-- subscription, and a trigger that fires an actual push the moment a
-- notification is created.
create table public.push_subscriptions (
    id         bigint generated always as identity primary key,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    endpoint   text not null unique,
    p256dh     text not null,
    auth       text not null,
    created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Entirely self-service: a device registers its own subscription and
-- can see/remove only its own — there's no reason for anyone else,
-- including other admins, to read another user's push endpoint (it's
-- effectively a bearer credential for sending that device
-- notifications).
create policy "users manage their own push subscriptions"
    on public.push_subscriptions for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- pg_net lets Postgres make async HTTP calls without blocking the
-- transaction that triggered them — exactly what's needed here: a
-- message insert shouldn't wait on a push provider's response before
-- the INSERT itself completes. Supabase projects have this available
-- by default; this just turns it on if it isn't already.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_push_for_notification()
returns trigger as $$
declare
    v_project_url text := 'https://zfucxtrbvdvrkxagqtvg.supabase.co';
    v_service_key text;
begin
    -- The service role key can't be committed to a migration file (it's
    -- a live secret, not something that belongs in version control) —
    -- it's read from a Postgres setting instead. Set it once via the
    -- Supabase SQL editor:
    --   alter database postgres set app.settings.service_role_key = '<your service_role key>';
    -- Until that's set, this trigger no-ops (logs a warning) rather
    -- than failing the message/notification insert itself — a push
    -- provider being unconfigured should never block the underlying
    -- action that triggered it.
    begin
        v_service_key := current_setting('app.settings.service_role_key', true);
    exception when others then
        v_service_key := null;
    end;

    if v_service_key is null or v_service_key = '' then
        raise warning 'push notifications not sent: app.settings.service_role_key is not configured';
        return new;
    end if;

    perform net.http_post(
        url := v_project_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'user_id', new.user_id,
            'type', new.type,
            'actor_username', new.actor_username,
            'body', new.body,
            'channel_id', new.channel_id,
            'post_id', new.post_id
        )
    );
    return new;
end;
$$ language plpgsql security definer;

create trigger on_notification_created_push
    after insert on public.notifications
    for each row execute function public.notify_push_for_notification();
