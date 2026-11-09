-- juna · Phase 4 · Leiterrundentreffen (Agenda, Anwesenheit, Protokoll) und Dateien

create type public.meeting_type as enum ('jahresplanung', 'monatstreffen', 'sonstiges');
create type public.meeting_status as enum ('geplant', 'laufend', 'abgeschlossen');
create type public.agenda_kind as enum ('feedback', 'planung', 'sonstiges');
create type public.attendance_status as enum ('anwesend', 'entschuldigt', 'fehlt');

-- ---------------------------------------------------------------------------
-- Treffen
-- ---------------------------------------------------------------------------
create table public.meetings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  type             public.meeting_type not null default 'monatstreffen',
  title            text not null check (char_length(btrim(title)) between 2 and 160),
  date             date not null,
  start_time       time,
  location         text check (location is null or char_length(location) <= 200),
  status           public.meeting_status not null default 'geplant',
  protocol_owner   text,
  -- Protokoll: BlockNote-Dokument + Klartext (wie bei Aktionen)
  notes            jsonb,
  notes_text       text not null default '',
  notes_version    integer not null default 0,
  notes_updated_at timestamptz,
  notes_updated_by text references auth."user" (id) on delete set null,
  created_by       text references auth."user" (id) on delete set null default app.current_user_id(),
  updated_by       text references auth."user" (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint meetings_id_org_unique unique (id, org_id),
  constraint meetings_protocol_owner_fk foreign key (protocol_owner, org_id)
    references public.profiles (id, org_id) on delete set null (protocol_owner),
  constraint meetings_notes_size check (notes is null or pg_column_size(notes) <= 1000000)
);
create index meetings_org_date_idx on public.meetings (org_id, date desc);
create trigger meetings_touch before update on public.meetings
  for each row execute function app.touch_updated_by();

create table public.meeting_agenda (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  meeting_id  uuid not null,
  action_id   uuid,
  title       text check (title is null or char_length(btrim(title)) between 1 and 160),
  kind        public.agenda_kind not null default 'planung',
  position    integer not null default 0,
  done        boolean not null default false,
  constraint meeting_agenda_meeting_fk foreign key (meeting_id, org_id)
    references public.meetings (id, org_id) on delete cascade,
  constraint meeting_agenda_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade,
  -- Entweder eine Aktion oder ein freier Punkt mit Titel
  constraint meeting_agenda_target check (action_id is not null or title is not null)
);
create unique index meeting_agenda_action_unique on public.meeting_agenda (meeting_id, action_id) where action_id is not null;
create index meeting_agenda_meeting_idx on public.meeting_agenda (meeting_id, position);

create table public.meeting_attendance (
  org_id      uuid not null,
  meeting_id  uuid not null,
  user_id     text not null,
  status      public.attendance_status not null,
  primary key (meeting_id, user_id),
  constraint meeting_attendance_meeting_fk foreign key (meeting_id, org_id)
    references public.meetings (id, org_id) on delete cascade,
  constraint meeting_attendance_user_fk foreign key (user_id, org_id)
    references public.profiles (id, org_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Dateien einer Aktion (Inhalt liegt im privaten Blob-Speicher, hier nur Metadaten)
-- ---------------------------------------------------------------------------
create table public.action_files (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  action_id     uuid not null,
  storage_key   text not null unique,
  filename      text not null check (char_length(filename) between 1 and 255),
  content_type  text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  group_label   text check (group_label is null or char_length(btrim(group_label)) between 1 and 60),
  uploaded_by   text references auth."user" (id) on delete set null default app.current_user_id(),
  created_at    timestamptz not null default now(),
  constraint action_files_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade,
  -- Speicherpfad muss zur Organisation und Aktion passen
  constraint action_files_key_scope check (storage_key like 'orgs/' || org_id || '/actions/' || action_id || '/%')
);
create index action_files_action_idx on public.action_files (action_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.meetings           enable row level security;
alter table public.meeting_agenda     enable row level security;
alter table public.meeting_attendance enable row level security;
alter table public.action_files       enable row level security;

revoke all on public.meetings, public.meeting_agenda, public.meeting_attendance, public.action_files from public;

grant select, insert on public.meetings to juna_app;
grant update (type, title, date, start_time, location, status, protocol_owner,
              notes, notes_text, notes_version, notes_updated_at, notes_updated_by, updated_by, updated_at)
  on public.meetings to juna_app;
grant delete on public.meetings to juna_app;

grant select, insert, delete on public.meeting_agenda to juna_app;
grant update (title, kind, position, done) on public.meeting_agenda to juna_app;

grant select, insert, delete on public.meeting_attendance to juna_app;
grant update (status) on public.meeting_attendance to juna_app;

grant select, insert, delete on public.action_files to juna_app;
grant update (group_label, filename) on public.action_files to juna_app;

do $$
declare t text;
begin
  foreach t in array array['meeting_agenda', 'meeting_attendance'] loop
    execute format('create policy %1$s_select on public.%1$s for select to juna_app using (org_id = app.current_org_id())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to juna_app with check (org_id = app.current_org_id())', t);
    execute format('create policy %1$s_update on public.%1$s for update to juna_app using (org_id = app.current_org_id()) with check (org_id = app.current_org_id())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to juna_app using (org_id = app.current_org_id())', t);
  end loop;
end $$;

create policy meetings_select on public.meetings for select to juna_app using (org_id = app.current_org_id());
create policy meetings_insert on public.meetings for insert to juna_app with check (org_id = app.current_org_id());
create policy meetings_update on public.meetings for update to juna_app
  using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy meetings_delete on public.meetings for delete to juna_app
  using (org_id = app.current_org_id() and app.is_org_admin());

create policy action_files_select on public.action_files for select to juna_app using (org_id = app.current_org_id());
create policy action_files_insert on public.action_files for insert to juna_app
  with check (org_id = app.current_org_id() and uploaded_by = app.current_user_id());
create policy action_files_update on public.action_files for update to juna_app
  using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
-- Löschen: wer hochgeladen hat oder Admin
create policy action_files_delete on public.action_files for delete to juna_app
  using (org_id = app.current_org_id() and (uploaded_by = app.current_user_id() or app.is_org_admin()));
