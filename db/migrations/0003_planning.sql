-- juna · Phase 3 · Planung: Zeitplan, Teilnahme, Planungsteam, Aufgaben, Feedback
--
-- Zeiten sind lokale Wandzeit (timestamp without time zone, Europe/Berlin), wie sie die Leiterrunde plant.
-- Wird das Datum einer Aktion verschoben, verschiebt die App Zeitslots und Anwesenheitsfenster mit.

create type public.participation_status as enum ('dabei', 'vielleicht', 'nicht_dabei');
create type public.task_status as enum ('offen', 'erledigt');
create type public.feedback_kind as enum ('gut', 'verbessern', 'naechstes_mal');
create type public.followup_resolution as enum ('aufgabe', 'beruecksichtigt');

-- ---------------------------------------------------------------------------
-- Zeitplan
-- ---------------------------------------------------------------------------
create table public.action_slots (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  action_id   uuid not null,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  starts_at   timestamp not null,
  ends_at     timestamp not null,
  min_people  integer check (min_people is null or min_people between 1 and 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text references auth."user" (id) on delete set null,
  constraint action_slots_id_org_unique unique (id, org_id),
  constraint action_slots_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade,
  constraint action_slots_order check (ends_at > starts_at)
);
create index action_slots_action_idx on public.action_slots (action_id, starts_at);
create trigger action_slots_touch before update on public.action_slots
  for each row execute function app.touch_updated_by();

-- ---------------------------------------------------------------------------
-- Teilnahme (pro Aktion) mit optionalem Anwesenheitsfenster
-- ---------------------------------------------------------------------------
create table public.action_participants (
  org_id      uuid not null,
  action_id   uuid not null,
  user_id     text not null,
  status      public.participation_status not null,
  present_from  timestamp,
  present_until timestamp,
  updated_by  text references auth."user" (id) on delete set null default app.current_user_id(),
  updated_at  timestamptz not null default now(),
  primary key (action_id, user_id),
  constraint action_participants_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade,
  constraint action_participants_user_fk foreign key (user_id, org_id)
    references public.profiles (id, org_id) on delete cascade,
  constraint action_participants_window check (present_from is null or present_until is null or present_until > present_from)
);
create index action_participants_user_idx on public.action_participants (user_id);
create trigger action_participants_touch before update on public.action_participants
  for each row execute function app.touch_updated_by();

-- Einzelne Slots abweichend von der abgeleiteten Zuordnung (explizit dabei / nicht dabei)
create table public.slot_overrides (
  org_id    uuid not null,
  slot_id   uuid not null,
  user_id   text not null,
  present   boolean not null,
  primary key (slot_id, user_id),
  constraint slot_overrides_slot_fk foreign key (slot_id, org_id)
    references public.action_slots (id, org_id) on delete cascade,
  constraint slot_overrides_user_fk foreign key (user_id, org_id)
    references public.profiles (id, org_id) on delete cascade
);

-- Nachvollziehbarkeit: jede Änderung an einer Teilnahme
create table public.participation_history (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  action_id   uuid not null,
  user_id     text not null,
  changed_by  text,
  old_status  public.participation_status,
  new_status  public.participation_status,
  old_from    timestamp,
  new_from    timestamp,
  old_until   timestamp,
  new_until   timestamp,
  changed_at  timestamptz not null default now(),
  constraint participation_history_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade
);
create index participation_history_action_idx on public.participation_history (action_id, changed_at desc);

create or replace function app.log_participation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    -- Kaskade beim Löschen der ganzen Aktion: nichts protokollieren
    if not exists (select 1 from public.actions a where a.id = old.action_id) then
      return old;
    end if;
    insert into public.participation_history (org_id, action_id, user_id, changed_by, old_status, old_from, old_until)
    values (old.org_id, old.action_id, old.user_id, app.current_user_id(), old.status, old.present_from, old.present_until);
    return old;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.present_from is not distinct from old.present_from
     and new.present_until is not distinct from old.present_until then
    return new;
  end if;
  insert into public.participation_history
    (org_id, action_id, user_id, changed_by, old_status, new_status, old_from, new_from, old_until, new_until)
  values
    (new.org_id, new.action_id, new.user_id, app.current_user_id(),
     case when tg_op = 'UPDATE' then old.status end, new.status,
     case when tg_op = 'UPDATE' then old.present_from end, new.present_from,
     case when tg_op = 'UPDATE' then old.present_until end, new.present_until);
  return new;
end;
$$;
revoke all on function app.log_participation() from public;
create trigger action_participants_history after insert or update or delete on public.action_participants
  for each row execute function app.log_participation();

-- ---------------------------------------------------------------------------
-- Planungsteam (Verantwortliche einer Aktion, mehrere möglich)
-- ---------------------------------------------------------------------------
create table public.action_planners (
  org_id     uuid not null,
  action_id  uuid not null,
  user_id    text not null,
  primary key (action_id, user_id),
  constraint action_planners_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade,
  constraint action_planners_user_fk foreign key (user_id, org_id)
    references public.profiles (id, org_id) on delete cascade
);
create index action_planners_user_idx on public.action_planners (user_id);

-- ---------------------------------------------------------------------------
-- Aufgaben
-- ---------------------------------------------------------------------------
create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  action_id        uuid not null,
  title            text not null check (char_length(btrim(title)) between 2 and 200),
  description      text check (description is null or char_length(description) <= 2000),
  status           public.task_status not null default 'offen',
  -- Deadline: relativ („X Tage vor der Aktion“) ODER absolut – nie beides
  due_days_before  integer check (due_days_before is null or due_days_before between 0 and 365),
  due_date         date,
  done_at          timestamptz,
  done_by          text references auth."user" (id) on delete set null,
  created_by       text references auth."user" (id) on delete set null default app.current_user_id(),
  updated_by       text references auth."user" (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tasks_id_org_unique unique (id, org_id),
  constraint tasks_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade,
  constraint tasks_due_exclusive check (due_days_before is null or due_date is null)
);
create index tasks_action_idx on public.tasks (action_id);
create trigger tasks_touch before update on public.tasks
  for each row execute function app.touch_updated_by();

create table public.task_assignees (
  org_id   uuid not null,
  task_id  uuid not null,
  user_id  text not null,
  primary key (task_id, user_id),
  constraint task_assignees_task_fk foreign key (task_id, org_id)
    references public.tasks (id, org_id) on delete cascade,
  constraint task_assignees_user_fk foreign key (user_id, org_id)
    references public.profiles (id, org_id) on delete cascade
);
create index task_assignees_user_idx on public.task_assignees (user_id);

-- ---------------------------------------------------------------------------
-- Feedback + Übernahme in spätere Durchführungen
-- ---------------------------------------------------------------------------
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  action_id   uuid not null,
  kind        public.feedback_kind not null,
  text        text not null check (char_length(btrim(text)) between 2 and 2000),
  author_id   text references auth."user" (id) on delete set null default app.current_user_id(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text references auth."user" (id) on delete set null,
  constraint feedback_id_org_unique unique (id, org_id),
  constraint feedback_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade
);
create index feedback_action_idx on public.feedback (action_id);
create trigger feedback_touch before update on public.feedback
  for each row execute function app.touch_updated_by();

-- „Aus dem letzten Mal“: wie ein Feedback-Punkt in einer späteren Aktion behandelt wurde
create table public.feedback_followups (
  org_id       uuid not null,
  feedback_id  uuid not null,
  action_id    uuid not null,
  resolution   public.followup_resolution not null,
  task_id      uuid references public.tasks (id) on delete set null,
  resolved_by  text references auth."user" (id) on delete set null default app.current_user_id(),
  resolved_at  timestamptz not null default now(),
  primary key (feedback_id, action_id),
  constraint feedback_followups_feedback_fk foreign key (feedback_id, org_id)
    references public.feedback (id, org_id) on delete cascade,
  constraint feedback_followups_action_fk foreign key (action_id, org_id)
    references public.actions (id, org_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- RLS: Alle Mitglieder einer Organisation planen gemeinsam (lesen/schreiben).
-- Feedback ändern/löschen: Autor*in oder Admin. Historie: nur lesen.
-- ---------------------------------------------------------------------------
alter table public.action_slots          enable row level security;
alter table public.action_participants   enable row level security;
alter table public.slot_overrides        enable row level security;
alter table public.participation_history enable row level security;
alter table public.action_planners       enable row level security;
alter table public.tasks                 enable row level security;
alter table public.task_assignees        enable row level security;
alter table public.feedback              enable row level security;
alter table public.feedback_followups    enable row level security;

revoke all on public.action_slots, public.action_participants, public.slot_overrides, public.participation_history,
              public.action_planners, public.tasks, public.task_assignees, public.feedback, public.feedback_followups
  from public;

grant select, insert, delete on public.action_slots to juna_app;
grant update (title, description, starts_at, ends_at, min_people, updated_by, updated_at) on public.action_slots to juna_app;

grant select, insert, delete on public.action_participants to juna_app;
grant update (status, present_from, present_until, updated_by, updated_at) on public.action_participants to juna_app;

grant select, insert, delete on public.slot_overrides to juna_app;
grant update (present) on public.slot_overrides to juna_app;

grant select on public.participation_history to juna_app;

grant select, insert, delete on public.action_planners to juna_app;

grant select, insert, delete on public.tasks to juna_app;
grant update (title, description, status, due_days_before, due_date, done_at, done_by, updated_by, updated_at)
  on public.tasks to juna_app;

grant select, insert, delete on public.task_assignees to juna_app;

grant select, insert, delete on public.feedback to juna_app;
grant update (kind, text, updated_by, updated_at) on public.feedback to juna_app;

grant select, insert, delete on public.feedback_followups to juna_app;
grant update (resolution, task_id, resolved_by, resolved_at) on public.feedback_followups to juna_app;

-- Org-weite Policies (lesen + schreiben innerhalb der eigenen Organisation)
do $$
declare t text;
begin
  foreach t in array array['action_slots', 'action_participants', 'slot_overrides', 'action_planners',
                           'tasks', 'task_assignees', 'feedback_followups'] loop
    execute format('create policy %1$s_select on public.%1$s for select to juna_app using (org_id = app.current_org_id())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to juna_app with check (org_id = app.current_org_id())', t);
    execute format('create policy %1$s_update on public.%1$s for update to juna_app using (org_id = app.current_org_id()) with check (org_id = app.current_org_id())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to juna_app using (org_id = app.current_org_id())', t);
  end loop;
end $$;

create policy participation_history_select on public.participation_history for select to juna_app
  using (org_id = app.current_org_id());

create policy feedback_select on public.feedback for select to juna_app
  using (org_id = app.current_org_id());
create policy feedback_insert on public.feedback for insert to juna_app
  with check (org_id = app.current_org_id() and author_id = app.current_user_id());
create policy feedback_update on public.feedback for update to juna_app
  using (org_id = app.current_org_id() and (author_id = app.current_user_id() or app.is_org_admin()))
  with check (org_id = app.current_org_id());
create policy feedback_delete on public.feedback for delete to juna_app
  using (org_id = app.current_org_id() and (author_id = app.current_user_id() or app.is_org_admin()));
