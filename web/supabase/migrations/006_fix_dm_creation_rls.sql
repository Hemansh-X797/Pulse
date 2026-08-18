-- Bug fix: "Message" button did nothing when clicked from Friends list
-- or a user's profile.
--
-- Root cause: createOrGetDM() created a new channel, then inserted BOTH
-- member rows (me + the other user) in a single insert() call. The
-- "users can add themselves to a channel" policy on channel_members
-- only allows `user_id = auth.uid()`, so the second row (the other
-- user's membership) was rejected by RLS. Supabase's insert() is
-- all-or-nothing, so the whole call failed — and because the call site
-- had no try/catch, it failed completely silently (same bug class as
-- the earlier image-upload and unread-counts bugs).
--
-- Fix: a SECURITY DEFINER function that creates the channel and both
-- membership rows atomically, bypassing the per-row RLS check safely
-- because the function itself enforces the only invariant that
-- matters (caller must be one of the two participants).

create or replace function public.create_dm_channel(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_channel_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if v_me = other_user_id then
    raise exception 'cannot DM yourself';
  end if;

  -- Enforce blocking here too, at the same layer as everything else
  -- that enforces blocked_users (see 005_blocking_notification_prefs_stories.sql)
  -- rather than trusting the client to have checked first.
  if exists (
    select 1 from public.blocked_users
    where (blocker_id = v_me and blocked_id = other_user_id)
       or (blocker_id = other_user_id and blocked_id = v_me)
  ) then
    raise exception 'cannot message a blocked user';
  end if;

  -- Re-check for an existing 1:1 channel server-side too (the client
  -- already checks, but two rapid clicks / two tabs could race).
  select cm1.channel_id into v_channel_id
  from public.channel_members cm1
  join public.channel_members cm2 on cm1.channel_id = cm2.channel_id
  join public.channels c on c.id = cm1.channel_id
  where cm1.user_id = v_me
    and cm2.user_id = other_user_id
    and c.is_group = false
  limit 1;

  if v_channel_id is not null then
    return v_channel_id;
  end if;

  insert into public.channels (is_group) values (false) returning id into v_channel_id;

  insert into public.channel_members (channel_id, user_id)
  values (v_channel_id, v_me), (v_channel_id, other_user_id);

  return v_channel_id;
end;
$$;

-- Callable by any authenticated user; the function body is what
-- enforces who's allowed to do what, not table grants.
grant execute on function public.create_dm_channel(uuid) to authenticated;
