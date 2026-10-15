-- Checklist sharing for the Supabase free tier.
-- Run this once in the Supabase SQL editor.
--
-- Access is only through these functions. The anon key cannot read the
-- tables directly. The invite token is the capability.
--
-- Keep v_list_cap and v_member_cap in sync with
-- FREE_SHARED_LIST_CAP and FREE_MEMBER_CAP in src/lib/checklist/limits.ts.
--
-- UPGRADE PATH: raise the caps when you leave the free tier, and switch
-- src/lib/checklist/sharing.ts from polling to Realtime if you want
-- push updates instead of a 5 second pull.

create table if not exists public.checklist_lists (
  id uuid primary key,
  invite_token text unique not null,
  name text not null,
  slug text not null,
  payload jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null,
  owner_device text not null
);

create table if not exists public.checklist_members (
  list_id uuid not null references public.checklist_lists (id) on delete cascade,
  device_key text not null,
  joined_at timestamptz not null default now(),
  primary key (list_id, device_key)
);

alter table public.checklist_lists enable row level security;
alter table public.checklist_members enable row level security;

revoke all on public.checklist_lists from anon, authenticated;
revoke all on public.checklist_members from anon, authenticated;

create or replace function public.checklist_list_json(l public.checklist_lists)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'id', l.id,
    'name', l.name,
    'slug', l.slug,
    'inviteToken', l.invite_token,
    'updatedAt', l.updated_at,
    'tasks', l.payload
  );
$$;

create or replace function public.checklist_push(
  p_id uuid,
  p_token text,
  p_name text,
  p_slug text,
  p_device text,
  p_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.checklist_lists;
  owned int;
  members int;
  v_list_cap int := 2;
  v_member_cap int := 3;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'error', 'detail', 'invite token is too short');
  end if;
  if jsonb_typeof(p_payload) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'reason', 'error', 'detail', 'tasks must be an array');
  end if;

  select * into existing from public.checklist_lists where invite_token = p_token;

  if not found then
    select count(*) into owned from public.checklist_lists where owner_device = p_device;
    if owned >= v_list_cap then
      return jsonb_build_object('ok', false, 'reason', 'list-cap');
    end if;
    insert into public.checklist_lists (id, invite_token, name, slug, payload, updated_at, owner_device)
    values (p_id, p_token, p_name, p_slug, p_payload, p_updated_at, p_device);
    insert into public.checklist_members (list_id, device_key) values (p_id, p_device);
    return jsonb_build_object('ok', true);
  end if;

  if not exists (
    select 1 from public.checklist_members where list_id = existing.id and device_key = p_device
  ) then
    select count(*) into members from public.checklist_members where list_id = existing.id;
    if members >= v_member_cap then
      return jsonb_build_object('ok', false, 'reason', 'member-cap');
    end if;
    insert into public.checklist_members (list_id, device_key) values (existing.id, p_device);
  end if;

  if existing.updated_at > p_updated_at then
    return public.checklist_list_json(existing) || jsonb_build_object('stale', true);
  end if;

  update public.checklist_lists
  set name = p_name,
      slug = p_slug,
      payload = p_payload,
      updated_at = p_updated_at
  where id = existing.id;

  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'reason', 'error', 'detail', SQLERRM);
end;
$$;

create or replace function public.checklist_pull(p_token text, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.checklist_lists;
  members int;
  v_member_cap int := 3;
begin
  select * into existing from public.checklist_lists where invite_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;

  if not exists (
    select 1 from public.checklist_members where list_id = existing.id and device_key = p_device
  ) then
    select count(*) into members from public.checklist_members where list_id = existing.id;
    if members >= v_member_cap then
      return jsonb_build_object('ok', false, 'reason', 'member-cap');
    end if;
    insert into public.checklist_members (list_id, device_key) values (existing.id, p_device);
  end if;

  return public.checklist_list_json(existing);
exception when others then
  return jsonb_build_object('ok', false, 'reason', 'error', 'detail', SQLERRM);
end;
$$;

create or replace function public.checklist_join(p_token text, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.checklist_pull(p_token, p_device);
end;
$$;

create or replace function public.checklist_drop(p_token text, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.checklist_lists;
begin
  select * into existing from public.checklist_lists where invite_token = p_token;
  if not found then
    return jsonb_build_object('ok', true);
  end if;
  if existing.owner_device is distinct from p_device then
    return jsonb_build_object('ok', false, 'reason', 'not-owner');
  end if;
  delete from public.checklist_lists where id = existing.id;
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'reason', 'error', 'detail', SQLERRM);
end;
$$;

revoke all on function public.checklist_list_json(public.checklist_lists) from public, anon, authenticated;
grant execute on function public.checklist_push(uuid, text, text, text, text, timestamptz, jsonb) to anon, authenticated;
grant execute on function public.checklist_pull(text, text) to anon, authenticated;
grant execute on function public.checklist_join(text, text) to anon, authenticated;
grant execute on function public.checklist_drop(text, text) to anon, authenticated;
