-- Adds optional profile display names used instead of email prefixes in the UI.
-- Idempotent: safe to re-paste into the Supabase SQL editor.

alter table public.profiles
  add column if not exists display_name text
  check (display_name is null or char_length(display_name) between 1 and 32);

create or replace function public.set_profile_display_name(display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_display_name text;
  profile public.profiles;
  current_email text;
begin
  normalized_display_name := nullif(trim(display_name), '');

  if normalized_display_name is not null and char_length(normalized_display_name) > 32 then
    raise exception 'Nickname must be 32 characters or fewer';
  end if;

  select lower(email) into current_email
  from auth.users
  where id = auth.uid();

  if current_email is null then
    raise exception 'No authenticated user email found';
  end if;

  insert into public.profiles(id, email, display_name)
  values (auth.uid(), current_email, normalized_display_name)
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name
  returning * into profile;

  return profile;
end;
$$;

revoke all on function public.set_profile_display_name(text) from public;
grant execute on function public.set_profile_display_name(text) to authenticated;

drop function if exists public.event_creator_profiles(uuid[]);
create function public.event_creator_profiles(target_event_ids uuid[])
returns table(id uuid, email text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct p.id, p.email, p.display_name
  from public.events e
  join public.profiles p on p.id = e.created_by
  where e.id = any(target_event_ids)
    and public.is_calendar_member(e.calendar_id);
$$;

revoke all on function public.event_creator_profiles(uuid[]) from public;
grant execute on function public.event_creator_profiles(uuid[]) to authenticated;
