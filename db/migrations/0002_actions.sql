-- juna · Phase 2 · Aktionen und Aktionsreihen

create type public.action_status as enum ('idee', 'geplant', 'in_planung', 'durchgefuehrt', 'abgeschlossen');

-- Setzt updated_by auf den aktuellen User (falls im User-Kontext)
create or replace function app.touch_updated_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(app.current_user_id(), new.updated_by);
  return new;
end;
$$;
grant execute on function app.touch_updated_by() to juna_app;

-- ---------------------------------------------------------------------------
-- Aktionsreihen: wiederkehrende Aktionen (jährlich oder mehrmals im Jahr)
-- ---------------------------------------------------------------------------
create table public.action_series (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 120),
  description  text check (description is null or char_length(description) <= 2000),
  color        text not null default 'orange'
               check (color in ('orange', 'red', 'pink', 'purple', 'blue', 'teal', 'green', 'yellow', 'gray')),
  archived     boolean not null default false,
  created_by   text references auth."user" (id) on delete set null default app.current_user_id(),
  updated_by   text references auth."user" (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint action_series_id_org_unique unique (id, org_id)
);
create unique index action_series_org_name_unique on public.action_series (org_id, lower(btrim(name)));
create trigger action_series_touch before update on public.action_series
  for each row execute function app.touch_updated_by();

-- ---------------------------------------------------------------------------
-- Aktionen: konkrete Durchführungen
-- ---------------------------------------------------------------------------
create table public.actions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  series_id         uuid,
  title             text not null check (char_length(btrim(title)) between 2 and 160),
  status            public.action_status not null default 'geplant',
  date              date,
  end_date          date,
  start_time        time,
  end_time          time,
  location          text check (location is null or char_length(location) <= 200),
  -- Notizen: BlockNote-Dokument (JSON) + daraus abgeleiteter Klartext (Suche, Kalender-Export)
  notes             jsonb,
  notes_text        text not null default '',
  notes_version     integer not null default 0,
  notes_updated_at  timestamptz,
  notes_updated_by  text references auth."user" (id) on delete set null,
  created_by        text references auth."user" (id) on delete set null default app.current_user_id(),
  updated_by        text references auth."user" (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint actions_id_org_unique unique (id, org_id),
  -- Reihe muss zur selben Organisation gehören; beim Löschen der Reihe bleibt die Aktion bestehen
  constraint actions_series_fk foreign key (series_id, org_id)
    references public.action_series (id, org_id) on delete set null (series_id),
  constraint actions_date_required check (date is not null or status = 'idee'),
  constraint actions_end_date_valid check (end_date is null or (date is not null and end_date >= date)),
  constraint actions_end_time_needs_start check (end_time is null or start_time is not null),
  constraint actions_notes_size check (notes is null or pg_column_size(notes) <= 1000000)
);
create index actions_org_date_idx on public.actions (org_id, date);
create index actions_series_date_idx on public.actions (series_id, date);
create trigger actions_touch before update on public.actions
  for each row execute function app.touch_updated_by();

-- ---------------------------------------------------------------------------
-- RLS: Alle Mitglieder einer Organisation sehen und bearbeiten Aktionen/Reihen,
-- löschen dürfen nur Admins.
-- ---------------------------------------------------------------------------
alter table public.action_series enable row level security;
alter table public.actions enable row level security;

revoke all on public.action_series, public.actions from public;

grant select, insert, delete on public.action_series to juna_app;
grant update (name, description, color, archived, updated_by, updated_at) on public.action_series to juna_app;

grant select, insert, delete on public.actions to juna_app;
grant update (series_id, title, status, date, end_date, start_time, end_time, location,
              notes, notes_text, notes_version, notes_updated_at, notes_updated_by,
              updated_by, updated_at) on public.actions to juna_app;

create policy action_series_select on public.action_series for select to juna_app
  using (org_id = app.current_org_id());
create policy action_series_insert on public.action_series for insert to juna_app
  with check (org_id = app.current_org_id());
create policy action_series_update on public.action_series for update to juna_app
  using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy action_series_delete on public.action_series for delete to juna_app
  using (org_id = app.current_org_id() and app.is_org_admin());

create policy actions_select on public.actions for select to juna_app
  using (org_id = app.current_org_id());
create policy actions_insert on public.actions for insert to juna_app
  with check (org_id = app.current_org_id());
create policy actions_update on public.actions for update to juna_app
  using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy actions_delete on public.actions for delete to juna_app
  using (org_id = app.current_org_id() and app.is_org_admin());
