-- Owner sync for every list, task, and saved note.
-- Run this once in the Supabase SQL editor, after supabase/schema.sql.
--
-- Security model, stated plainly:
-- The app sends the anon key (Authorization / apikey) and a space id
-- (header x-sync-space). Row level security returns a row only when its
-- space_id equals that header. The SQL editor role and the service_role
-- key bypass row level security. Do not put the service_role key in the
-- app, in GitHub Actions, or in scripts/remote-edit.mjs.
--
-- The anon key and the space id are both compiled into the public APK
-- (Vite inlines every VITE_ variable). Anyone who unpacks the app can
-- read and write this space. Row level security stops a request that does
-- not present the space id, and it stops one space from seeing another.
-- It does not stop the person who has the app. Do not store anyone else's
-- private notes here. To rotate the space id, generate a new one, update
-- the GitHub secret, rebuild the APK, and leave the old rows behind.
--
-- Writes keep the newer updated_at. A tie does not overwrite the stored row.
-- Deletes set deleted_at to the same timestamp (they are not hard deletes)
-- so a phone that is offline can learn about the delete on the next pull.
--
-- A trigger broadcasts {changed: true} on the public topic sync:<space id>.
-- The payload has no row contents. If Realtime is unavailable the trigger
-- ignores the error and the phone polls about every 30 seconds instead.

create table if not exists public.sync_lists (
  space_id text not null,
  id text not null,
  slug text not null default '',
  name text not null default '',
  invite_token text not null default '',
  shared boolean not null default false,
  day text,
  system boolean not null default false,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (space_id, id),
  constraint sync_lists_space_nonempty check (length(btrim(space_id)) > 0)
);

create table if not exists public.sync_tasks (
  space_id text not null,
  id text not null,
  list_id text not null,
  title text not null default '',
  done boolean not null default false,
  notes text not null default '',
  due text,
  calendar_event_id text,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (space_id, id),
  constraint sync_tasks_space_nonempty check (length(btrim(space_id)) > 0)
);

alter table public.sync_lists enable row level security;
alter table public.sync_tasks enable row level security;

grant select, insert, update, delete on public.sync_lists to anon, authenticated;
grant select, insert, update, delete on public.sync_tasks to anon, authenticated;

create or replace function public.sync_space()
returns text
language plpgsql
stable
as $$
declare
  headers text;
  space text;
begin
  headers := current_setting('request.headers', true);
  if headers is null or btrim(headers) = '' then
    return null;
  end if;
  begin
    space := btrim(headers::json->>'x-sync-space');
  exception when others then
    return null;
  end;
  if space is null or space = '' then
    return null;
  end if;
  return space;
end;
$$;

revoke all on function public.sync_space() from public;
grant execute on function public.sync_space() to anon, authenticated;

drop policy if exists sync_lists_space on public.sync_lists;
create policy sync_lists_space on public.sync_lists
  for all
  to anon, authenticated
  using (space_id = public.sync_space())
  with check (space_id = public.sync_space());

drop policy if exists sync_tasks_space on public.sync_tasks;
create policy sync_tasks_space on public.sync_tasks
  for all
  to anon, authenticated
  using (space_id = public.sync_space())
  with check (space_id = public.sync_space());

create or replace function public.sync_keep_newer()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_keep_newer() from public, anon, authenticated;

drop trigger if exists sync_lists_keep_newer on public.sync_lists;
create trigger sync_lists_keep_newer
  before update on public.sync_lists
  for each row
  execute function public.sync_keep_newer();

drop trigger if exists sync_tasks_keep_newer on public.sync_tasks;
create trigger sync_tasks_keep_newer
  before update on public.sync_tasks
  for each row
  execute function public.sync_keep_newer();

create or replace function public.sync_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sid text;
begin
  sid := coalesce(new.space_id, old.space_id);
  begin
    perform realtime.send(
      jsonb_build_object('changed', true),
      'changed',
      'sync:' || sid,
      false
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.sync_broadcast() from public, anon, authenticated;

drop trigger if exists sync_lists_broadcast on public.sync_lists;
create trigger sync_lists_broadcast
  after insert or update on public.sync_lists
  for each row
  execute function public.sync_broadcast();

drop trigger if exists sync_tasks_broadcast on public.sync_tasks;
create trigger sync_tasks_broadcast
  after insert or update on public.sync_tasks
  for each row
  execute function public.sync_broadcast();
