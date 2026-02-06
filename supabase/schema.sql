-- Cala: Supabase schema for persistent user events
-- Run this in the Supabase SQL editor (or as a migration).

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  title text not null,
  start timestamptz not null,
  "end" timestamptz,
  all_day boolean not null default false,
  category text not null,
  notes text,
  location_name text,
  location_address text,
  done boolean not null default false,
  reminder_minutes_before integer,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_user_start_idx on public.events (user_id, start);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

alter table public.events enable row level security;

drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_own" on public.events;
drop policy if exists "events_delete_own" on public.events;

create policy "events_select_own"
  on public.events
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "events_insert_own"
  on public.events
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "events_update_own"
  on public.events
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "events_delete_own"
  on public.events
  for delete
  to authenticated
  using (user_id = auth.uid());
