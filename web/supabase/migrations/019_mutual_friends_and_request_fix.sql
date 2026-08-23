-- B2: mutual friends (needs a SECURITY DEFINER function since friend
-- lists are private-by-RLS — see the note left in plan.md when this
-- was originally scoped) + the simultaneous-friend-request bug fix.

-- ---------- mutual friends ----------
-- Returns just the count + a small preview list of mutual friends
-- between the caller and another user — never the other person's full
-- friend list, which stays private. Reads friends_view directly
-- (bypassing its normal RLS via SECURITY DEFINER) but only ever
-- returns the intersection, which is information the caller is
-- entitled to see about their own relationship to that person.
create or replace function public.get_mutual_friends(other_user_id uuid)
returns table (friend_id uuid, username text, display_name text, avatar_url text, accent_color_top text, accent_color_bottom text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.accent_color_top, p.accent_color_bottom
  from public.friends_view mine
  join public.friends_view theirs on theirs.friend_id = mine.friend_id and theirs.user_id = other_user_id
  join public.profiles p on p.id = mine.friend_id
  where mine.user_id = auth.uid();
$$;

grant execute on function public.get_mutual_friends(uuid) to authenticated;

-- ---------- simultaneous friend request ----------
-- Bug: A requests B, then B (before responding to A's request) sends
-- their own request to A. The old sendFriendRequest() just inserted a
-- second pending row in the opposite direction — two live pending
-- requests, neither auto-resolving, a confusing state the UI had no
-- good way to explain. This RPC checks for an existing pending request
-- in the *opposite* direction first and, if found, accepts that one
-- instead of creating a new one — so B "sending a request back" to A
-- just completes the friendship immediately, matching what a person
-- actually means by that action.
create or replace function public.send_friend_request(p_recipient_id uuid)
returns text -- 'sent' | 'already_friends'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_existing_reverse_id bigint;
begin
  if v_sender is null then
    raise exception 'not authenticated';
  end if;
  if v_sender = p_recipient_id then
    raise exception 'cannot friend-request yourself';
  end if;

  select id into v_existing_reverse_id
  from public.friend_requests
  where sender_id = p_recipient_id and recipient_id = v_sender and status = 'pending';

  if v_existing_reverse_id is not null then
    update public.friend_requests
    set status = 'accepted', responded_at = now()
    where id = v_existing_reverse_id;
    return 'already_friends';
  end if;

  insert into public.friend_requests (sender_id, recipient_id)
  values (v_sender, p_recipient_id)
  on conflict (sender_id, recipient_id, status) do nothing;

  return 'sent';
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;
