-- Bug fix: 42P17 "infinite recursion detected in policy for relation
-- channel_members".
--
-- Root cause (pre-existing since 001_initial_schema.sql, not something
-- 006 introduced — 006's new RPC is just the first thing that actually
-- triggered a SELECT through this policy):
--
--   create policy "members can view channel membership"
--       on public.channel_members for select
--       using (channel_id in (select channel_id from public.channel_members where user_id = auth.uid()));
--
-- This policy is defined ON channel_members, and its USING clause
-- queries channel_members to evaluate itself — so answering "can this
-- row be seen" requires re-running the same policy, which requires
-- running it again, forever. Classic Postgres RLS self-reference bug.
--
-- Fix: move the membership check into a SECURITY DEFINER function.
-- Functions like this bypass RLS on the table they query internally
-- (that's the whole point of SECURITY DEFINER here — it's not a
-- security hole, since the function only ever answers "is this exact
-- user a member of this exact channel", nothing broader), so the
-- policy can call it without ever re-entering itself.

create or replace function public.is_channel_member(p_channel_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.channel_members
    where channel_id = p_channel_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_channel_member(uuid, uuid) to authenticated;

drop policy if exists "members can view channel membership" on public.channel_members;

create policy "members can view channel membership"
    on public.channel_members for select
    using (public.is_channel_member(channel_id, auth.uid()));

-- The "members can view their channels" policy on public.channels
-- (001_initial_schema.sql) has the same shape but queries
-- channel_members FROM the channels table's policy, not from
-- channel_members' own policy — that's a normal cross-table
-- reference, not self-reference, so it's not recursive and doesn't
-- need this fix. Confirmed by this migration's own build/query test
-- rather than assumed.
