-- Bug fix: same 42P17 infinite-recursion shape as
-- 007_fix_channel_members_rls_recursion.sql, on a sibling table.
--
-- "members can view their memberships" on space_members (originally
-- server_members, from 001_initial_schema.sql, carried through
-- 002_rename_servers_to_spaces.sql's rename) had the same
-- self-reference:
--
--   using (user_id = auth.uid() or server_id in (select server_id from public.server_members where user_id = auth.uid()))
--
-- — a policy on server_members/space_members querying that same table
-- inside its own condition. Same fix as 007: a SECURITY DEFINER helper
-- function to break the self-reference.
--
-- (This didn't surface at the same time as 007's channel_members bug
-- because nothing had exercised a SELECT through this exact policy
-- yet — it was latent the same way, just not yet hit.)

create or replace function public.is_space_member(p_space_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_space_member(uuid, uuid) to authenticated;

drop policy if exists "members can view their memberships" on public.space_members;

create policy "members can view their memberships"
  on public.space_members for select
  using (
    user_id = auth.uid()
    or public.is_space_member(space_id, auth.uid())
  );
