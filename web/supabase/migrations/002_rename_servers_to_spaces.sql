-- 002_rename_servers_to_spaces.sql
-- Run this against your existing Supabase project AFTER supabase/schema.sql
-- has already been applied. Safe to run once; re-running is idempotent
-- where practical (guarded with IF EXISTS / OR REPLACE), but this is a
-- structural migration, not a script meant to run twice in normal
-- operation — take a Supabase point-in-time backup first if you have
-- real user data already.
--
-- What this does:
--   1. Renames tables: servers -> spaces, server_members -> space_members
--   2. Renames columns: server_id -> space_id everywhere it appears
--   3. Recreates the trigger functions whose *body text* referenced the
--      old names (table/column RENAME is transparent to policies and
--      views, since Postgres tracks those by OID — but PL/pgSQL function
--      bodies are stored as literal SQL text, so they'd break silently
--      at next execution if left alone)
--   4. Adds the two new RPCs the "space ownership" rules need:
--      transfer_space_ownership() and leave_or_delete_space()
--   5. Widens the notifications.type check constraint to include the new
--      space_invite / friend_request / friend_accept values
--
-- Policy names still say "server" in a few places (e.g. "members can view
-- their servers") — that's cosmetic only (policy names are just labels,
-- not referenced by app code) and left as-is to keep this migration
-- focused; rename them later with `alter policy ... rename to ...` if you
-- want the pg_policies output to read cleanly too.

begin;

-- ---------- 1 & 2: table + column renames ----------
alter table public.servers rename to spaces;
alter table public.server_members rename to space_members;
alter table public.server_members rename column server_id to space_id;
alter table public.channels rename column server_id to space_id;

-- primary key / unique constraint names still say "server_members_pkey"
-- etc. — cosmetic, Postgres doesn't require renaming these for anything
-- to keep working, so left alone.

-- ---------- 3: recreate trigger function bodies with new names ----------
create or replace function public.handle_new_space()
returns trigger as $$
begin
    insert into public.space_members (space_id, user_id, role)
    values (new.id, new.owner_id, 'owner');

    insert into public.channels (space_id, name, is_group, position)
    values (new.id, 'general', true, 0);

    return new;
end;
$$ language plpgsql security definer;

create or replace function public.handle_new_space_member()
returns trigger as $$
begin
    insert into public.channel_members (channel_id, user_id)
    select id, new.user_id from public.channels where space_id = new.space_id
    on conflict do nothing;
    return new;
end;
$$ language plpgsql security definer;

create or replace function public.handle_new_channel()
returns trigger as $$
begin
    if new.space_id is not null then
        insert into public.channel_members (channel_id, user_id)
        select new.id, user_id from public.space_members where space_id = new.space_id
        on conflict do nothing;
    end if;
    return new;
end;
$$ language plpgsql security definer;

-- Old triggers pointed at the old function names; drop + recreate under
-- new names so `\d spaces` / `\d space_members` reads cleanly.
drop trigger if exists on_server_created on public.spaces;
create trigger on_space_created
    after insert on public.spaces
    for each row execute function public.handle_new_space();

drop trigger if exists on_server_member_added on public.space_members;
create trigger on_space_member_added
    after insert on public.space_members
    for each row execute function public.handle_new_space_member();

drop trigger if exists on_channel_created on public.channels;
create trigger on_channel_created
    after insert on public.channels
    for each row execute function public.handle_new_channel();

drop function if exists public.handle_new_server();
drop function if exists public.handle_new_server_member();

-- ---------- 4: ownership-transfer / leave-or-delete rules ----------
-- Rules (enforced here, not just trusted client-side):
--   - Sole real (non-bot) member of a space MUST delete it to leave —
--     "leaving" isn't offered as an option in that case.
--   - Owner with other real members present cannot delete the space
--     directly; must transfer ownership first via transfer_space_ownership().
--   - A non-owner member just leaves normally (membership row removed).
--
-- "Real member" = a space_members row whose user_id maps to a profiles
-- row that isn't flagged as a bot. There's no is_bot column yet since
-- bots aren't built — this defaults everyone to "real" until that column
-- exists, so the rule is a no-op today and activates automatically once
-- bots are added, without another migration.

alter table public.profiles add column if not exists is_bot boolean not null default false;

create or replace function public.transfer_space_ownership(p_space_id uuid, p_new_owner uuid)
returns void as $$
begin
    if not exists (
        select 1 from public.spaces where id = p_space_id and owner_id = auth.uid()
    ) then
        raise exception 'only the current owner can transfer ownership';
    end if;

    if not exists (
        select 1 from public.space_members where space_id = p_space_id and user_id = p_new_owner
    ) then
        raise exception 'new owner must already be a member of the space';
    end if;

    update public.spaces set owner_id = p_new_owner where id = p_space_id;
    update public.space_members set role = 'owner' where space_id = p_space_id and user_id = p_new_owner;
    update public.space_members set role = 'admin' where space_id = p_space_id and user_id = auth.uid();
end;
$$ language plpgsql security definer;

create or replace function public.leave_or_delete_space(p_space_id uuid)
returns table(deleted boolean) as $$
declare
    v_real_member_count int;
    v_is_owner boolean;
begin
    select count(*) into v_real_member_count
    from public.space_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.space_id = p_space_id and p.is_bot = false;

    select (owner_id = auth.uid()) into v_is_owner from public.spaces where id = p_space_id;

    if v_real_member_count <= 1 then
        -- sole real member: forced delete, no "leave" option
        delete from public.spaces where id = p_space_id;
        return query select true;
    elsif v_is_owner then
        raise exception 'transfer ownership before leaving a space with other members';
    else
        delete from public.space_members where space_id = p_space_id and user_id = auth.uid();
        return query select false;
    end if;
end;
$$ language plpgsql security definer;

-- ---------- 5: widen notification type constraint ----------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
    check (type in ('message', 'reaction', 'comment', 'space_invite', 'friend_request', 'friend_accept'));

commit;
