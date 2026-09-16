-- Reply-to-comment threading on feed posts. post_comments has been flat
-- since 001_initial_schema.sql — every comment on a post rendered in one
-- undifferentiated list with no way to reply to a specific comment
-- rather than the post itself, unlike the DM/space chat side of the app
-- which already has real threaded replies (messages.reply_to_id).
--
-- One level of nesting only (a reply's parent must itself be a
-- top-level comment, not another reply) — deep comment trees are a
-- genuinely harder UI problem (indentation depth, collapsing, etc.) that
-- Instagram/Twitter-style flat-with-one-reply-level products deliberately
-- avoid for exactly this reason, and it's a much better fit for a quick
-- reply on a feed post than a full recursive thread would be.
alter table public.post_comments
    add column if not exists parent_comment_id bigint references public.post_comments(id) on delete cascade;

-- Enforced at the DB level, not just left as a UI convention: without
-- this, nothing stops a client from setting parent_comment_id to another
-- reply's id and silently building a deeper thread than the UI ever
-- intends to render.
create or replace function public.enforce_single_level_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_parent_parent bigint;
begin
    if new.parent_comment_id is null then
        return new;
    end if;
    select parent_comment_id into v_parent_parent from public.post_comments where id = new.parent_comment_id;
    if v_parent_parent is not null then
        raise exception 'cannot reply to a reply — one level of comment nesting only';
    end if;
    return new;
end;
$$;

drop trigger if exists on_comment_enforce_single_level on public.post_comments;
create trigger on_comment_enforce_single_level
    before insert on public.post_comments
    for each row execute function public.enforce_single_level_comment_reply();

create index if not exists post_comments_parent_comment_id_idx on public.post_comments (parent_comment_id);
