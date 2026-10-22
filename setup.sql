create table if not exists lists (
  id uuid primary key, space_id text not null, name text not null, slug text,
  kind text not null default 'normal', position double precision not null default 0,
  columns jsonb not null default '[]', theme jsonb, last_shift jsonb,
  shift_history jsonb not null default '[]',
  updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists tasks (
  id uuid primary key, space_id text not null,
  list_id uuid not null references lists(id), column_id text,
  title text not null, done boolean not null default false, notes text not null default '',
  position double precision not null default 0, due_at timestamptz, lead_minutes int,
  done_at timestamptz, on_time boolean, calendar_event_id text,
  updated_at timestamptz not null default now(), deleted_at timestamptz);
create table if not exists settings (
  space_id text primary key, default_theme jsonb, calendar_id text default 'primary',
  shift_match text default 'Fire department', fd_last_reset_day text,
  updated_at timestamptz not null default now());
create index if not exists tasks_list_idx on tasks(list_id);
create index if not exists lists_space_idx on lists(space_id);
create index if not exists tasks_space_idx on tasks(space_id);
create or replace function sync_space() returns text language sql stable as $$
  select coalesce(current_setting('request.headers', true)::json->>'x-sync-space', '') $$;
alter table lists enable row level security;
alter table tasks enable row level security;
alter table settings enable row level security;
drop policy if exists lists_space on lists;
drop policy if exists tasks_space on tasks;
drop policy if exists settings_space on settings;
create policy lists_space on lists for all to anon
  using (space_id = sync_space() and sync_space() <> '')
  with check (space_id = sync_space() and sync_space() <> '');
create policy tasks_space on tasks for all to anon
  using (space_id = sync_space() and sync_space() <> '')
  with check (space_id = sync_space() and sync_space() <> '');
create policy settings_space on settings for all to anon
  using (space_id = sync_space() and sync_space() <> '')
  with check (space_id = sync_space() and sync_space() <> '');
-- Only allow a write when it is newer (last write wins).
create or replace function keep_newer() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then return old; end if;
  return new;
end $$;
drop trigger if exists lists_lww on lists;
drop trigger if exists tasks_lww on tasks;
drop trigger if exists settings_lww on settings;
create trigger lists_lww before update on lists for each row execute function keep_newer();
create trigger tasks_lww before update on tasks for each row execute function keep_newer();
create trigger settings_lww before update on settings for each row execute function keep_newer();
