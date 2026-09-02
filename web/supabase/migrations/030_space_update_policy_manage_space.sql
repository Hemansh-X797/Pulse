-- 023_space_description.sql added the only UPDATE policy that ever
-- existed on `spaces`, owner-only, and said outright in its own
-- comment that manage_space wasn't wired to it yet. It still wasn't by
-- this migration's time — the space_roles/permissions system
-- (022_space_roles_permissions_categories.sql) has tracked a
-- manage_space permission the whole time (the auto-created Admin role
-- is granted it), and the client-side settings UI now offers to
-- delegate it to a custom role, but that delegation would have quietly
-- done nothing: RLS still only ever allowed the literal owner through,
-- so a manage_space-holding non-owner's update() call would fail
-- outright with a permission-denied-shaped empty result. This replaces
-- that policy to also allow anyone space_member_has_permission()
-- grants manage_space to — the same helper every other permission gate
-- in this app already goes through, RLS included.
drop policy if exists "space owner can update their space" on public.spaces;

create policy "space owner or manage_space role can update their space"
    on public.spaces for update
    using (owner_id = auth.uid() or public.space_member_has_permission(id, auth.uid(), 'manage_space'))
    with check (owner_id = auth.uid() or public.space_member_has_permission(id, auth.uid(), 'manage_space'));
