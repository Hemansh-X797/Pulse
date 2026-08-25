-- Space description, alongside the existing name — missing entirely
-- before this, confirmed by checking rather than assuming.
alter table public.spaces
    add column if not exists description text not null default '';

-- Also: no UPDATE policy existed on spaces at all before this (checked,
-- not assumed) — meaning any update() call would have silently done
-- nothing via RLS's default deny. Only the owner can edit their space's
-- own profile fields for now; a manage_space permission on a custom
-- role isn't wired to this yet (see spaces.ts's updateSpace comment).
create policy "space owner can update their space"
    on public.spaces for update
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());
