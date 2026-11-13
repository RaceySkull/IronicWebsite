-- =====================================================================
-- Orbyt Designs: database setup
-- Run this once in Supabase: SQL Editor → New query → paste → Run.
-- It's safe to run again; it only creates what's missing.
--
-- How the security works: every table has row-level security (RLS) on.
-- The database itself checks "is this person on this team, and does
-- their role allow this?" on every request, so nobody can see or change
-- another team's things, even by tampering with the editor in their browser.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  number text check (char_length(number) <= 20),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  -- Per-person switches, e.g. {"kit": false, "data": true, "download": true}
  perms jsonb not null default '{}'::jsonb,
  -- Optional list of page paths this person may edit; null = all pages
  pages text[],
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text check (email is null or char_length(email) <= 254),
  role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_files (
  site_id uuid not null references public.sites(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 400 and path !~ '(^|/)\.\.(/|$)' and path !~ '^/'),
  size bigint not null default 0,
  changed boolean not null default true,      -- changed since the last download
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (site_id, path)
);

create table if not exists public.site_changes (
  id bigserial primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  text text not null check (char_length(text) <= 300),
  place text not null default '' check (char_length(place) <= 120),
  downloaded boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists site_changes_site_idx on public.site_changes(site_id, at desc);

-- ---------- Permission helpers ----------
-- These run with the definer's rights so they can read team_members without
-- tripping over their own security rules. They only ever answer about auth.uid().
create or replace function public.role_in(t uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from team_members where team_id = t and user_id = auth.uid()
$$;

create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid())
$$;

-- What each role may do. Editors' "switch" permissions default to on and can be
-- turned off per person by an owner or admin.
create or replace function public.can(t uuid, perm text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text; p jsonb;
begin
  select role, perms into r, p from team_members where team_id = t and user_id = auth.uid();
  if r is null then return false; end if;
  if r = 'owner' then return true; end if;
  if r = 'admin' then return perm <> 'delete_team'; end if;
  if r = 'editor' then
    if perm in ('view', 'comment', 'edit', 'media') then return true; end if;
    if perm in ('kit', 'data', 'download') then return coalesce((p ->> perm)::boolean, true); end if;
    return false;
  end if;
  if r = 'viewer' then return perm in ('view', 'comment'); end if;
  return false;
end $$;

create or replace function public.site_team(s uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from sites where id = s
$$;

-- ---------- Actions that need several steps at once ----------
create or replace function public.create_team(team_name text, team_number text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into teams (name, number, created_by) values (trim(team_name), nullif(trim(team_number), ''), auth.uid()) returning id into tid;
  insert into team_members (team_id, user_id, role) values (tid, auth.uid(), 'owner');
  return tid;
end $$;

-- What an invite is for, shown before someone accepts it. Reveals nothing else.
create or replace function public.invite_info(invite_token text) returns table (team_name text, team_number text, role text, invited_by text, expired boolean, used boolean)
language sql stable security definer set search_path = public as $$
  select t.name, t.number, i.role, coalesce(p.display_name, ''), i.expires_at < now(), i.accepted_at is not null
  from invites i join teams t on t.id = i.team_id left join profiles p on p.id = i.created_by
  where i.token = invite_token
$$;

create or replace function public.accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites; my_email text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from invites where token = invite_token for update;
  if inv.id is null then raise exception 'This invite link isn''t valid'; end if;
  if inv.accepted_at is not null then raise exception 'This invite was already used'; end if;
  if inv.expires_at < now() then raise exception 'This invite has expired. Ask for a new one.'; end if;
  select email into my_email from auth.users where id = auth.uid();
  if inv.email is not null and lower(inv.email) <> lower(my_email) then
    raise exception 'This invite was sent to a different email address';
  end if;
  insert into team_members (team_id, user_id, role) values (inv.team_id, auth.uid(), inv.role)
    on conflict (team_id, user_id) do nothing;
  update invites set accepted_by = auth.uid(), accepted_at = now() where id = inv.id;
  return inv.team_id;
end $$;

-- Change someone's role, switches or page list. Owners can't be demoted here,
-- and only the owner can make someone an admin.
create or replace function public.set_member(t uuid, member uuid, new_role text, new_perms jsonb default null, new_pages text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare their_role text; my_role text := public.role_in(t);
begin
  if not public.can(t, 'roles') then raise exception 'You can''t change roles on this team'; end if;
  select role into their_role from team_members where team_id = t and user_id = member;
  if their_role is null then raise exception 'That person isn''t on this team'; end if;
  if their_role = 'owner' then raise exception 'The owner''s role can''t be changed'; end if;
  if new_role not in ('admin', 'editor', 'viewer') then raise exception 'Unknown role'; end if;
  if new_role = 'admin' and my_role <> 'owner' then raise exception 'Only the owner can make someone an admin'; end if;
  if their_role = 'admin' and my_role <> 'owner' then raise exception 'Only the owner can change an admin'; end if;
  update team_members set role = new_role, perms = coalesce(new_perms, perms), pages = new_pages
    where team_id = t and user_id = member;
end $$;

create or replace function public.remove_member(t uuid, member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare their_role text; my_role text := public.role_in(t);
begin
  select role into their_role from team_members where team_id = t and user_id = member;
  if their_role is null then return; end if;
  if their_role = 'owner' then raise exception 'The owner can''t be removed'; end if;
  if member <> auth.uid() then
    if not public.can(t, 'roles') then raise exception 'You can''t remove people from this team'; end if;
    if their_role = 'admin' and my_role <> 'owner' then raise exception 'Only the owner can remove an admin'; end if;
  end if;
  delete from team_members where team_id = t and user_id = member;
end $$;

-- After a download: everything counts as downloaded.
create or replace function public.mark_downloaded(s uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can(public.site_team(s), 'download') then raise exception 'You can''t download this site'; end if;
  update site_files set changed = false where site_id = s;
  update site_changes set downloaded = true where site_id = s and not downloaded;
end $$;

-- New accounts get a profile row automatically.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.invites enable row level security;
alter table public.sites enable row level security;
alter table public.site_files enable row level security;
alter table public.site_changes enable row level security;

-- Start clean so re-running doesn't leave old rules behind
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('profiles','teams','team_members','invites','sites','site_files','site_changes')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- Profiles: you see yourself and your teammates; you edit only yourself
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_write on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());

-- Teams: members see them; admins rename; only the owner deletes. Creating goes through create_team().
create policy teams_read on public.teams for select to authenticated using (public.is_member(id));
create policy teams_update on public.teams for update to authenticated using (public.can(id, 'roles')) with check (public.can(id, 'roles'));
create policy teams_delete on public.teams for delete to authenticated using (public.can(id, 'delete_team'));

-- Members: teammates can see the member list. Changes go through set_member() / remove_member().
create policy members_read on public.team_members for select to authenticated using (public.is_member(team_id));

-- Invites: only people allowed to invite can see, make or cancel them
create policy invites_read on public.invites for select to authenticated using (public.can(team_id, 'invite'));
create policy invites_insert on public.invites for insert to authenticated with check (
  public.can(team_id, 'invite') and created_by = auth.uid()
  and (role <> 'admin' or public.role_in(team_id) = 'owner'));
create policy invites_delete on public.invites for delete to authenticated using (public.can(team_id, 'invite'));

-- Sites
create policy sites_read on public.sites for select to authenticated using (public.is_member(team_id));
create policy sites_insert on public.sites for insert to authenticated with check (public.can(team_id, 'edit') and created_by = auth.uid());
create policy sites_update on public.sites for update to authenticated using (public.can(team_id, 'edit')) with check (public.can(team_id, 'edit'));
create policy sites_delete on public.sites for delete to authenticated using (public.can(team_id, 'delete_site'));

-- Site files (the list; the files themselves live in Storage)
create policy files_read on public.site_files for select to authenticated using (public.is_member(public.site_team(site_id)));
create policy files_insert on public.site_files for insert to authenticated with check (public.can(public.site_team(site_id), 'edit'));
create policy files_update on public.site_files for update to authenticated using (public.can(public.site_team(site_id), 'edit')) with check (public.can(public.site_team(site_id), 'edit'));
create policy files_delete on public.site_files for delete to authenticated using (public.can(public.site_team(site_id), 'edit'));

-- Change log
create policy changes_read on public.site_changes for select to authenticated using (public.is_member(public.site_team(site_id)));
create policy changes_insert on public.site_changes for insert to authenticated with check (public.can(public.site_team(site_id), 'edit') and user_id = auth.uid());

-- ---------- File storage ----------
-- One private bucket. Files are stored as  <team id>/<site id>/<path in the site>
insert into storage.buckets (id, name, public, file_size_limit)
values ('sites', 'sites', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'orbyt_%'
  loop execute format('drop policy %I on storage.objects', r.policyname); end loop;
end $$;

create policy orbyt_read on storage.objects for select to authenticated using (
  bucket_id = 'sites' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy orbyt_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'sites' and public.can(((storage.foldername(name))[1])::uuid, 'edit')
  and public.site_team(((storage.foldername(name))[2])::uuid) = ((storage.foldername(name))[1])::uuid);
create policy orbyt_update on storage.objects for update to authenticated using (
  bucket_id = 'sites' and public.can(((storage.foldername(name))[1])::uuid, 'edit'));
create policy orbyt_delete on storage.objects for delete to authenticated using (
  bucket_id = 'sites' and public.can(((storage.foldername(name))[1])::uuid, 'edit'));

-- ---------- Live presence (who's on which page) ----------
-- Only members of the site's team can join a site's channel.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'alter table realtime.messages enable row level security';
    execute 'drop policy if exists orbyt_presence_read on realtime.messages';
    execute 'drop policy if exists orbyt_presence_write on realtime.messages';
    execute $p$create policy orbyt_presence_read on realtime.messages for select to authenticated using (
      exists (select 1 from public.sites s where 'site:' || s.id::text = realtime.topic() and public.is_member(s.team_id)))$p$;
    execute $p$create policy orbyt_presence_write on realtime.messages for insert to authenticated with check (
      exists (select 1 from public.sites s where 'site:' || s.id::text = realtime.topic() and public.is_member(s.team_id)))$p$;
  end if;
end $$;

-- Functions are callable only by signed-in users
revoke execute on function public.create_team(text, text), public.accept_invite(text), public.set_member(uuid, uuid, text, jsonb, text[]),
  public.remove_member(uuid, uuid), public.mark_downloaded(uuid), public.invite_info(text) from anon, public;
grant execute on function public.create_team(text, text), public.accept_invite(text), public.set_member(uuid, uuid, text, jsonb, text[]),
  public.remove_member(uuid, uuid), public.mark_downloaded(uuid), public.invite_info(text),
  public.can(uuid, text), public.is_member(uuid), public.role_in(uuid), public.site_team(uuid) to authenticated;

-- ---------- Your own view of your teams (pin, archive, last opened) ----------
alter table public.team_members add column if not exists pinned boolean not null default false;
alter table public.team_members add column if not exists archived boolean not null default false;
alter table public.team_members add column if not exists last_opened timestamptz;

-- Only changes the caller's own row, and only these three view settings.
create or replace function public.set_team_view(t uuid, pin boolean, arch boolean, opened boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  update team_members set pinned = pin, archived = arch,
    last_opened = case when opened then now() else last_opened end
  where team_id = t and user_id = auth.uid();
end $$;
revoke execute on function public.set_team_view(uuid, boolean, boolean, boolean) from anon, public;
grant execute on function public.set_team_view(uuid, boolean, boolean, boolean) to authenticated;
