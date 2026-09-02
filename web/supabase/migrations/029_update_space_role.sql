-- create_space_role (022_space_roles_permissions_categories.sql) sets a
-- role's name and color once, at creation — there was never an RPC to
-- change either afterward. update_space_role_permissions covers the
-- permission set but nothing covers a rename or recolor, so a role
-- created with the wrong name/color (or one that just needs updating
-- later) was stuck that way forever. Same permission-checked,
-- is_default-guarded pattern as every other role-mutating RPC here.
create or replace function public.update_space_role(p_role_id uuid, p_name text, p_color text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_space_id uuid;
    v_is_default boolean;
begin
    select space_id, is_default into v_space_id, v_is_default from public.space_roles where id = p_role_id;
    if v_space_id is null then
        raise exception 'role not found';
    end if;
    if v_is_default then
        raise exception 'cannot rename or recolor the default Admin role';
    end if;
    if not public.space_member_has_permission(v_space_id, auth.uid(), 'manage_roles') then
        raise exception 'missing manage_roles permission';
    end if;
    if trim(p_name) = '' then
        raise exception 'role name cannot be empty';
    end if;
    update public.space_roles set name = trim(p_name), color = p_color where id = p_role_id;
end;
$$;

grant execute on function public.update_space_role(uuid, text, text) to authenticated;
