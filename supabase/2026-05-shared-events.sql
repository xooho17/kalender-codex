-- Adds a marker for events that should appear in every calendar member's
-- "Mine" view. The event still belongs to one calendar. Idempotent: safe to
-- re-paste into the Supabase SQL editor.

alter table public.events
  add column if not exists shared_with_all boolean not null default false;
