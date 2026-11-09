# juna – Hinweise für Claude

@AGENTS.md

## Arbeitsweise
- Commits: Claude darf in diesem Repo selbstständig committen (Freigabe von Alex, 09.11.2026). Pushen nur auf Nachfrage – ein Push auf `main` löst ein Production-Deployment inkl. Migration aus.
- Commit-Messages auf Deutsch, kurz im Imperativ/Präsens, z. B. „Migrationen bei jedem Deployment ausführen“.
- UI-Texte, Kommentare und Doku auf Deutsch.

## Datenbank
- Migrationen: neue Datei `db/migrations/000N_beschreibung.sql`, eingespielte Dateien nie ändern (Prüfsumme). Abwärtskompatibel schreiben.
- Neue Tabellen: `org_id`, RLS-Policies, Grants für `juna_app`, Eintrag in `src/db/schema.ts`, Test in `tests/db/rls.test.ts`.
- Innerhalb einer `withUser()`-Transaktion Abfragen nacheinander ausführen (kein `Promise.all` auf `tx`).
- Drizzle rendert Spalten in Einzeltabellen-Abfragen unqualifiziert – in `sql`-Unterabfragen Spalten der äußeren Tabelle explizit qualifizieren (`"actions"."id"`).
- User-Zugriffe über `withUser()`, privilegierte über `adminDb()` nur nach Prüfung im DAL (`src/lib/auth.ts`).

## Prüfen vor dem Commit
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:db` (leere Test-DB), bei Flow-Änderungen `tests/e2e/flow.mjs` → `phase2.mjs` → `phase3.mjs` (frische DB).
