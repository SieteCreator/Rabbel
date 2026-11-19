-- The server-side Edge Function uses Supabase's service role; this does not
-- grant the anonymous or authenticated role owner privileges. The service key
-- stays on Supabase and is never included in the application.
create or replace function public.rabel_is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.role() = 'service_role', false)
    or exists (select 1 from public.rabel_owners where user_id = auth.uid());
$$;
