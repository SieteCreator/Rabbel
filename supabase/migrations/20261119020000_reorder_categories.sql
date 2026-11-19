-- Reorder categories atomically without changing dish data.
create function public.rabel_reorder_categories(ids bigint[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.rabel_is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  -- Lock in a stable order to serialize concurrent reorders.
  perform 1 from public.rabel_categories order by id for update;
  if ids is null or cardinality(ids) <> (select count(*) from public.rabel_categories)
     or (select count(distinct id) from unnest(ids) id) <> cardinality(ids)
     or exists (select 1 from unnest(ids) id where not exists (select 1 from public.rabel_categories c where c.id = id)) then
    raise exception 'Category list has changed; reload before reordering';
  end if;
  update public.rabel_categories c set position = (v.ord - 1)::integer
    from unnest(ids) with ordinality as v(id, ord) where c.id = v.id;
end;
$$;
revoke all on function public.rabel_reorder_categories(bigint[]) from public, anon;
grant execute on function public.rabel_reorder_categories(bigint[]) to authenticated;
