-- Foundation for the owner app. Applied to the Rabel Menu project after a
-- rollback-only validation. Existing dish names/IDs are retained.
create table public.rabel_categories (
  id bigint generated always as identity primary key,
  name text not null unique check (length(trim(name)) > 0 and name = trim(name)),
  name_en text not null check (length(trim(name_en)) > 0 and name_en = trim(name_en)),
  position integer not null default 0
);

insert into public.rabel_categories (name, name_en, position)
select category,
  case category
    when 'Specialità della casa' then 'House specialities'
    when 'Burgers' then 'Burgers'
    when 'Panini' then 'Panini'
    when 'Panini Speciali' then 'Special Panini'
    when 'Fritti' then 'Fried Sides'
    when 'Dolci' then 'Desserts'
    when 'Bevande & Birre' then 'Drinks & Beers'
    else category
  end,
  min(position)
from public.rabel_dishes group by category;

alter table public.rabel_dishes add constraint rabel_dishes_category_fk
  foreign key (category) references public.rabel_categories(name)
  on update cascade on delete restrict;
alter table public.rabel_categories enable row level security;
grant select on public.rabel_categories to anon, authenticated;
grant insert, update, delete on public.rabel_categories to authenticated;
grant usage, select on sequence public.rabel_categories_id_seq to authenticated;
create policy "public read categories" on public.rabel_categories for select to anon, authenticated using (true);
create policy "owner write categories" on public.rabel_categories for all to authenticated
  using (public.rabel_is_owner()) with check (public.rabel_is_owner());

-- The move and deletion commit together; a missing or identical target aborts.
create function public.rabel_move_and_delete_category(source_id bigint, target_id bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare source_name text; target_name text;
begin
  if not public.rabel_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if source_id = target_id then raise exception 'Choose a different category'; end if;
  -- Stable lock ordering avoids deadlocks when two operations run concurrently.
  perform 1 from public.rabel_categories where id in (source_id, target_id) order by id for update;
  select name into source_name from public.rabel_categories where id = source_id;
  select name into target_name from public.rabel_categories where id = target_id;
  if source_name is null or target_name is null then raise exception 'Category not found'; end if;
  update public.rabel_dishes set category = target_name where category = source_name;
  delete from public.rabel_categories where id = source_id;
end;
$$;
revoke all on function public.rabel_move_and_delete_category(bigint,bigint) from public, anon;
grant execute on function public.rabel_move_and_delete_category(bigint,bigint) to authenticated;

-- Replace all seven days atomically; invalid/incomplete inputs cannot erase hours.
create function public.rabel_replace_hours(rows jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare day_names text[] := array['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
  item jsonb; i integer; part text; m text[]; start_min integer; end_min integer; last_end integer;
begin
  if not public.rabel_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) <> 7 then
    raise exception 'Expected seven days';
  end if;
  for i in 0..6 loop
    item := rows->i;
    if item->>'days' is distinct from day_names[i+1] or jsonb_typeof(item->'hours') is distinct from 'string' then
      raise exception 'Invalid day %', i+1;
    end if;
    if item->>'hours' = 'Chiuso' then continue; end if;
    last_end := -1;
    if length(item->>'hours') = 0 or length(item->>'hours') > 100 then raise exception 'Invalid hours length'; end if;
    foreach part in array string_to_array(item->>'hours', ' · ') loop
      m := regexp_match(part, '^([0-9]{2}):([0-9]{2}) – ([0-9]{2}):([0-9]{2})$');
      if m is null then raise exception 'Invalid hours for %', day_names[i+1]; end if;
      if m[1]::int > 23 or m[2]::int > 59 or m[3]::int > 23 or m[4]::int > 59 then raise exception 'Invalid time'; end if;
      start_min := m[1]::int*60 + m[2]::int;
      end_min := m[3]::int*60 + m[4]::int;
      if start_min >= end_min or start_min < last_end then raise exception 'Invalid or overlapping time ranges'; end if;
      last_end := end_min;
    end loop;
  end loop;
  delete from public.rabel_hours;
  insert into public.rabel_hours(position, days, hours)
  select n - 1, rows->(n-1)->>'days', rows->(n-1)->>'hours' from generate_series(1,7) n;
end;
$$;
revoke all on function public.rabel_replace_hours(jsonb) from public, anon;
grant execute on function public.rabel_replace_hours(jsonb) to authenticated;
