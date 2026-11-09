-- juna · Phase 1 · Fundament (Neon / Postgres 16+)
--
-- Zugriffsmodell:
--   * Die App verbindet sich als Owner-Rolle (z. B. neondb_owner). Owner umgeht RLS – das nutzen
--     nur explizit privilegierte Server-Operationen (Einladungen, Freigaben, Better Auth).
--   * Alle Zugriffe im Namen eines Users laufen in einer Transaktion mit
--       set_config('app.user_id', <id>, true);  set local role juna_app;
--     Dann greifen RLS-Policies und Spaltenrechte (siehe src/db/index.ts → withUser).

-- ---------------------------------------------------------------------------
-- Rolle für User-Kontext
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'juna_app') then
    create role juna_app nologin;
  end if;
end $$;
grant juna_app to current_user;

create schema if not exists app;
grant usage on schema app to juna_app;
grant usage on schema public to juna_app;

-- ---------------------------------------------------------------------------
-- Better Auth (Schema "auth"; nur Owner hat Zugriff)
-- ---------------------------------------------------------------------------
create schema if not exists auth;
revoke all on schema auth from public;

create table auth."user" (
  id              text primary key,
  name            text not null,
  email           text not null unique,
  email_verified  boolean not null default false,
  image           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table auth.session (
  id          text primary key,
  expires_at  timestamptz not null,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  ip_address  text,
  user_agent  text,
  user_id     text not null references auth."user" (id) on delete cascade
);
create index session_user_id_idx on auth.session (user_id);

create table auth.account (
  id                        text primary key,
  account_id                text not null,
  provider_id               text not null,
  user_id                   text not null references auth."user" (id) on delete cascade,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  password                  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index account_user_id_idx on auth.account (user_id);

create table auth.verification (
  id          text primary key,
  identifier  text not null,
  value       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index verification_identifier_idx on auth.verification (identifier);

-- Rate-Limiting von Better Auth (instanzübergreifend, wichtig auf Serverless)
create table auth.rate_limit (
  id            text primary key,
  key           text not null unique,
  count         integer not null,
  last_request  bigint not null
);

-- ---------------------------------------------------------------------------
-- Typen
-- ---------------------------------------------------------------------------
create type public.org_status as enum ('active', 'suspended');
create type public.application_status as enum ('pending', 'approved', 'rejected');
create type public.org_role as enum ('admin', 'member');
create type public.member_status as enum ('invited', 'active', 'deactivated');

create or replace function app.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organisationen
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  status      public.org_status not null default 'active',
  timezone    text not null default 'Europe/Berlin',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Anträge auf neue Organisationen
-- ---------------------------------------------------------------------------
create table public.organization_applications (
  id               uuid primary key default gen_random_uuid(),
  org_name         text not null check (char_length(btrim(org_name)) between 2 and 120),
  contact_name     text not null check (char_length(btrim(contact_name)) between 2 and 120),
  contact_email    text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message          text check (message is null or char_length(message) <= 2000),
  status           public.application_status not null default 'pending',
  organization_id  uuid references public.organizations (id) on delete set null,
  reviewed_by      text references auth."user" (id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now()
);
create unique index organization_applications_one_pending_per_email
  on public.organization_applications (lower(contact_email)) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Profile (1:1 zu auth.user). Genau eine Organisation pro User; reine Superadmins ohne Org.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  text primary key references auth."user" (id) on delete cascade,
  org_id              uuid references public.organizations (id) on delete cascade,
  role                public.org_role not null default 'member',
  status              public.member_status not null default 'invited',
  is_superadmin       boolean not null default false,
  display_name        text not null check (char_length(btrim(display_name)) between 1 and 80),
  email               text not null,
  reminder_time       time not null default '18:00',
  timezone            text,
  notification_prefs  jsonb not null default '{}'::jsonb,
  telegram_chat_id    bigint unique,
  invited_at          timestamptz,
  activated_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint profiles_org_required check (org_id is not null or is_superadmin),
  constraint profiles_reminder_quarter_hour check (extract(minute from reminder_time)::int % 15 = 0
                                                   and extract(second from reminder_time) = 0)
);
create unique index profiles_email_unique on public.profiles (lower(email));
create index profiles_org_id_idx on public.profiles (org_id);
alter table public.profiles add constraint profiles_id_org_unique unique (id, org_id);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Modulberechtigungen (Vorbereitung Kasse / Mitgliederlisten)
-- ---------------------------------------------------------------------------
create table public.module_permissions (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    text not null,
  module     text not null check (module in ('kasse', 'mitgliederliste')),
  can_read   boolean not null default false,
  can_write  boolean not null default false,
  primary key (user_id, module),
  foreign key (user_id, org_id) references public.profiles (id, org_id) on delete cascade,
  constraint module_permissions_write_implies_read check (not can_write or can_read)
);
create index module_permissions_org_idx on public.module_permissions (org_id);

-- ---------------------------------------------------------------------------
-- Plattform-Einstellungen (Superadmin; z. B. Telegram-Bot, Geheimnisse verschlüsselt)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text references auth."user" (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen für RLS (security definer → keine Rekursion über profiles)
-- ---------------------------------------------------------------------------
create or replace function app.current_user_id()
returns text language sql stable set search_path = '' as $$
  select nullif(current_setting('app.user_id', true), '')
$$;

create or replace function app.current_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.org_id
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = app.current_user_id()
    and p.status <> 'deactivated'
    and o.status = 'active'
$$;

create or replace function app.is_org_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.role = 'admin'
    from public.profiles p
    join public.organizations o on o.id = p.org_id
    where p.id = app.current_user_id() and p.status = 'active' and o.status = 'active'
  ), false)
$$;

create or replace function app.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.is_superadmin from public.profiles p
    where p.id = app.current_user_id() and p.status <> 'deactivated'
  ), false)
$$;

revoke all on function app.current_user_id(), app.current_org_id(), app.is_org_admin(), app.is_superadmin() from public;
grant execute on function app.current_user_id(), app.current_org_id(), app.is_org_admin(), app.is_superadmin() to juna_app;

-- ---------------------------------------------------------------------------
-- Row Level Security + Spaltenrechte für juna_app
-- ---------------------------------------------------------------------------
alter table public.organizations             enable row level security;
alter table public.organization_applications enable row level security;
alter table public.profiles                  enable row level security;
alter table public.module_permissions        enable row level security;
alter table public.platform_settings         enable row level security;

revoke all on public.organizations, public.organization_applications, public.profiles,
              public.module_permissions, public.platform_settings from public;

grant select on public.organizations to juna_app;
grant update (name, timezone, settings) on public.organizations to juna_app;

grant select on public.organization_applications to juna_app;

grant select on public.profiles to juna_app;
-- Eigene Einstellungen: nur unkritische Spalten (keine Rolle, Org, Status, Superadmin)
grant update (display_name, reminder_time, timezone, notification_prefs) on public.profiles to juna_app;

grant select on public.module_permissions to juna_app;
grant select, insert, update on public.platform_settings to juna_app;

create policy org_select on public.organizations for select to juna_app
  using (id = app.current_org_id() or app.is_superadmin());
create policy org_update on public.organizations for update to juna_app
  using (id = app.current_org_id() and app.is_org_admin())
  with check (id = app.current_org_id() and app.is_org_admin());

create policy applications_select on public.organization_applications for select to juna_app
  using (app.is_superadmin());

create policy profiles_select on public.profiles for select to juna_app
  using (id = app.current_user_id() or org_id = app.current_org_id() or app.is_superadmin());
create policy profiles_update_own on public.profiles for update to juna_app
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

create policy module_permissions_select on public.module_permissions for select to juna_app
  using (org_id = app.current_org_id());

create policy platform_settings_all on public.platform_settings for all to juna_app
  using (app.is_superadmin())
  with check (app.is_superadmin());
