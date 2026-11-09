-- Superadmin anlegen bzw. neuen Link zum Passwort-Setzen erzeugen – direkt im Neon-SQL-Editor ausführen.
-- Idempotent: legt Konto/Profil nur an, wenn nicht vorhanden; erzeugt bei jedem Lauf einen neuen Link (1 h gültig).
-- E-Mail/Name bei Bedarf anpassen (3 Stellen).
with u as (
  insert into auth."user" (id, name, email, email_verified)
  values (gen_random_uuid()::text, 'ALW Mediaworks', 'apps@alw-mediaworks.de', true)
  on conflict (email) do update set email = excluded.email
  returning id
), p as (
  insert into public.profiles (id, org_id, role, status, is_superadmin, display_name, email, invited_at)
  select id, null, 'member', 'invited', true, 'ALW Mediaworks', 'apps@alw-mediaworks.de', now() from u
  on conflict (id) do update set is_superadmin = true
  returning id
), t as (
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') as token
)
insert into auth.verification (id, identifier, value, expires_at)
select gen_random_uuid()::text, 'reset-password:' || t.token, p.id, now() + interval '1 hour'
from p, t
returning 'https://juna.app/passwort-setzen?token=' || substring(identifier from 16) as link;
