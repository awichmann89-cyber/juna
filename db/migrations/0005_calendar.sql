-- juna · Phase 5 · Kalender-Abos (ICS)
-- Ein Abo-Link pro User. Der geheime Teil des Links ist ein HMAC über die ID (nicht in der DB gespeichert);
-- „Link zurücksetzen“ legt eine neue Zeile mit neuer ID an, der alte Link ist damit ungültig.

create table public.calendar_feeds (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  user_id           text not null unique,
  created_at        timestamptz not null default now(),
  last_accessed_at  timestamptz,
  constraint calendar_feeds_user_fk foreign key (user_id, org_id)
    references public.profiles (id, org_id) on delete cascade
);

alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from public;
grant select, insert, delete on public.calendar_feeds to juna_app;

-- Nur der eigene Feed: sehen, anlegen, zurücksetzen
create policy calendar_feeds_select on public.calendar_feeds for select to juna_app
  using (user_id = app.current_user_id() and org_id = app.current_org_id());
create policy calendar_feeds_insert on public.calendar_feeds for insert to juna_app
  with check (user_id = app.current_user_id() and org_id = app.current_org_id());
create policy calendar_feeds_delete on public.calendar_feeds for delete to juna_app
  using (user_id = app.current_user_id());
