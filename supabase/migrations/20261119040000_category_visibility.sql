-- Visibility flag for categories plus a single function that removes a
-- category, either moving its dishes to another category or deleting them.
--
-- `hidden` is intentionally public: the menu page needs it to drop the whole
-- group (category and its dishes) while the app keeps showing everything.

alter table public.rabel_categories
  add column if not exists hidden boolean not null default false;

comment on column public.rabel_categories.hidden is
  'When true the category and all of its dishes are not published on the menu site.';

-- The two ways of emptying a category are mutually exclusive: either a target
-- category receives the dishes, or the dishes are deleted together with it.
create or replace function public.rabel_delete_category(
  source_id bigint,
  delete_dishes boolean,
  target_id bigint default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_name text;
  target_name text;
begin
  if not public.rabel_is_owner() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select name into source_name
  from public.rabel_categories where id = source_id for update;
  if source_name is null then
    raise exception 'Category not found';
  end if;

  if delete_dishes then
    delete from public.rabel_dishes where category = source_name;
  else
    if target_id is null or target_id = source_id then
      raise exception 'Choose a different category';
    end if;
    select name into target_name
    from public.rabel_categories where id = target_id for update;
    if target_name is null then
      raise exception 'Category not found';
    end if;
    update public.rabel_dishes set category = target_name where category = source_name;
  end if;

  delete from public.rabel_categories where id = source_id;

  -- Close the gap left in the ordering so the arrows stay predictable.
  with ordered as (
    select id, (row_number() over (order by position, id) - 1)::integer as rn
    from public.rabel_categories
  )
  update public.rabel_categories c
  set position = o.rn
  from ordered o
  where c.id = o.id and c.position is distinct from o.rn;
end;
$$;

revoke all on function public.rabel_delete_category(bigint, boolean, bigint) from public;
grant execute on function public.rabel_delete_category(bigint, boolean, bigint) to authenticated;
