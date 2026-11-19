-- Schema di base Rabel Menu. Le tabelle sono pubblicamente leggibili;
-- solo i proprietari autorizzati possono modificare dati e foto.
-- Configurare il proprietario e verificare l'importazione prima del rilascio.
create table public.rabel_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.rabel_owners enable row level security;

create function public.rabel_is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.rabel_owners where user_id = auth.uid());
$$;
revoke all on function public.rabel_is_owner() from public;
grant execute on function public.rabel_is_owner() to anon, authenticated;

create table public.rabel_dishes (
  id bigint generated always as identity primary key,
  position integer not null default 0,
  category text not null,
  name text not null,
  name_en text not null default '',
  description text not null default '',
  description_en text not null default '',
  price numeric(10,2) check (price is null or price >= 0),
  allergens text[] not null default '{}',
  badges text[] not null default '{}',
  available boolean not null default true,
  photo_path text
);
create table public.rabel_hours (
  id bigint generated always as identity primary key,
  position integer not null default 0,
  days text not null,
  hours text not null
);
create table public.rabel_info (
  key text primary key,
  value text not null default ''
);

alter table public.rabel_dishes enable row level security;
alter table public.rabel_hours enable row level security;
alter table public.rabel_info enable row level security;

grant select on public.rabel_dishes, public.rabel_hours, public.rabel_info to anon, authenticated;
grant insert, update, delete on public.rabel_dishes, public.rabel_hours, public.rabel_info to authenticated;
grant usage, select on sequence public.rabel_dishes_id_seq, public.rabel_hours_id_seq to authenticated;

create policy "public read dishes" on public.rabel_dishes for select to anon, authenticated using (true);
create policy "owner write dishes" on public.rabel_dishes for all to authenticated using (public.rabel_is_owner()) with check (public.rabel_is_owner());
create policy "public read hours" on public.rabel_hours for select to anon, authenticated using (true);
create policy "owner write hours" on public.rabel_hours for all to authenticated using (public.rabel_is_owner()) with check (public.rabel_is_owner());
create policy "public read info" on public.rabel_info for select to anon, authenticated using (true);
create policy "owner write info" on public.rabel_info for all to authenticated using (public.rabel_is_owner()) with check (public.rabel_is_owner());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rabel-photos', 'rabel-photos', true, 5242880, array['image/jpeg','image/png','image/webp']);
create policy "owner upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'rabel-photos' and public.rabel_is_owner());
create policy "owner update photos" on storage.objects for update to authenticated
  using (bucket_id = 'rabel-photos' and public.rabel_is_owner())
  with check (bucket_id = 'rabel-photos' and public.rabel_is_owner());
create policy "owner delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'rabel-photos' and public.rabel_is_owner());
create policy "public read photos" on storage.objects for select to anon, authenticated
  using (bucket_id = 'rabel-photos');
