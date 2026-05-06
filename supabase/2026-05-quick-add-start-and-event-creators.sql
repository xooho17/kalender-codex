-- Adds an optional default start time for Custom Quick Adds and an RLS-safe
-- helper for showing who created visible events. Idempotent: safe to re-paste.

alter table public.quick_add_templates
  add column if not exists default_start_time time;

create or replace function public.event_creator_profiles(target_event_ids uuid[])
returns table(id uuid, email text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct p.id, p.email
  from public.events e
  join public.profiles p on p.id = e.created_by
  where e.id = any(target_event_ids)
    and public.is_calendar_member(e.calendar_id);
$$;

revoke all on function public.event_creator_profiles(uuid[]) from public;
grant execute on function public.event_creator_profiles(uuid[]) to authenticated;
