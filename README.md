# juna

Aktionsplanung für Leiterrunden – **juna.app**

Next.js 16 (App Router, Cache Components) · Neon Postgres (RLS) · Drizzle ORM · Better Auth · Tailwind CSS 4 · Vercel

Der vollständige Projektplan liegt im claude.ai-Projekt „juna“ (`projektplan.md`).

## Stand: Phase 1 – Fundament

- Mandantenfähiges Datenmodell mit Row Level Security (`db/migrations`)
- Organisation beantragen → Freigabe durch Superadmin → Org-Admin wird eingeladen
- Mitgliederverwaltung (einladen, Rolle, deaktivieren/reaktivieren, Einladung erneut senden)
- Login (E-Mail + Passwort), Passwort beim ersten Login setzen, Passwort vergessen
- Profil inkl. persönlicher Erinnerungszeit (15-Minuten-Raster)
- Responsive App-Shell (Desktop-Sidebar, mobile Bottom-Navigation), PWA-Manifest + App-Icons
- Rate-Limiting (Login, Passwort-Reset, Anträge) instanzübergreifend in der Datenbank
- Tests: RLS-Isolation (`tests/db`), Unit-Tests (`tests/unit`), End-to-End-Durchläufe (`tests/e2e`)

## Stand: Phase 2 – Aktionen

- Aktionen anlegen/bearbeiten/löschen (Löschen nur Admins): Titel, Status, Datum (auch mehrtägig), Uhrzeiten, Ort
- Ansichten: Kommend, Kalender (Monatsraster, mobil als Liste), Vergangen, Ideen (ohne Termin); Filter nach Reihe
- Aktionsreihen (auch mehrmals im Jahr): Farbe, Beschreibung, Archivieren; „Neue Durchführung“ schlägt Titel, Ort und Uhrzeiten vom letzten Mal vor
- Detailseite mit Tabs (Notizen aktiv; Zeitplan, Team, Aufgaben, Feedback, Dateien folgen) und „Historie der Reihe“ mit den Notizen früherer Durchführungen
- Notiz-Editor (BlockNote, deutsch): Markdown-Shortcuts, Slash-Menü, Formatierungsleiste, Checklisten, Tabellen; Autosave mit Konflikterkennung, wenn zwei Personen gleichzeitig schreiben; Klartext-Ableitung für Suche und Kalender-Export

## Stand: Phase 3 – Planung

- **Zeitplan** pro Aktion (auch mehrtägig, über Mitternacht) mit Mindestbesetzung und Warnung bei Unterbesetzung
- **Teilnahme** dabei / vielleicht / nicht dabei – jede*r kann für alle eintragen (Protokollführer), jede*r ändert die eigene; optionales **Anwesenheitsfenster** („komme ab“, „gehe um“), daraus automatische Zuordnung zu den Zeitslots, einzelne Slots manuell überschreibbar; Änderungsverlauf
- **Planungsteam** (mehrere Personen) pro Aktion
- **Aufgaben** mit mehreren Zuständigen, Deadline relativ („14 Tage vorher“, wandert mit dem Datum) oder fest; persönliche Liste „Meine Aufgaben“ (überfällig / heute / 7 Tage / später)
- **Datum verschieben** verschiebt Zeitplan und Anwesenheitsfenster mit
- **Feedback** (lief gut / verbessern / fürs nächste Mal); „Fürs nächste Mal“ erscheint bei der nächsten Durchführung der Reihe als **„Aus dem letzten Mal“** → als Aufgabe übernehmen oder abhaken
- **Von früherer Durchführung übernehmen**: Zeitplan (aufs neue Datum verschoben), Aufgaben (offen, relativ), Planungsteam, Notizen

## Stand: Phase 4 – Leiterrunde, Dateien, Echtzeit

- **Leiterrunden-Modus** (`/leiterrunde`): Treffen (Monatstreffen, Jahresplanung, Sonstiges) mit Protokollführung
  - **Agenda-Vorschlag** beim Anlegen: Feedback zu vergangenen Aktionen (90 Tage) ohne Rückmeldung + anstehende Aktionen (Monatstreffen: 8 Wochen, Jahresplanung: 12 Monate + Ideen); Punkte ergänzen (Aktion oder frei), sortieren, abhaken
  - **Anwesenheit** (anwesend / entschuldigt / fehlt): Protokollführung und Admins erfassen für alle, jede*r ändert die eigene; „Übrige als anwesend“
  - **Ablauf**: Punkt für Punkt durchklicken, je Aktion Feedback / Team / Aufgaben / Zeitplan / Notizen direkt bearbeiten, „Erledigt & weiter“; Seite aktualisiert sich während des Treffens automatisch
  - **Protokoll** im selben Editor wie die Notizen
- **Dateien** pro Aktion (privater Vercel-Blob-Store): Upload bis 50 MB direkt aus dem Browser, Gruppen (z. B. „Plakat“), Bildvorschau, Download nur angemeldet über `/api/dateien/<id>`; Löschen durch Hochladende oder Admins; HTML/SVG sind gesperrt
- **Gemeinsames Bearbeiten in Echtzeit** (Liveblocks) für Notizen und Protokoll, inkl. Anzeige, wer gerade mitschreibt. Ohne `LIVEBLOCKS_SECRET_KEY` bleibt es beim Autosave mit Konflikterkennung.

## Stand: Phase 5 – Kalender-Abos

- Unter **Einstellungen → Kalender abonnieren** erzeugt jede*r eigene Abo-Links („Abonnieren“ öffnet `webcal://` auf iPhone/Mac, „Link kopieren“ für Google/Outlook)
  - **Mein Kalender** (`/cal/<token>/personal.ics`): eigene Zeitslots (abgeleitet aus Teilnahme, Fenster und Overrides; „vielleicht“ als vorläufig mit „(?)“), Einsätze ohne Zeitplan, Deadlines der eigenen offenen Aufgaben (ganztägig, nicht „belegt“)
  - **Organisation** (`/cal/<token>/org.ics`): alle datierten Aktionen als Ganztagstermine mit Zeitplan, Team, Planungsteam und Notizen als Klartext; Leiterrundentreffen mit Agenda
- Zeitraum: 180 Tage zurück bis 2 Jahre voraus; Zeiten in UTC, Ganztagstermine als Datum; stabile UIDs, SEQUENCE aus dem Änderungszeitpunkt
- Token = Feed-ID + HMAC (Schlüssel aus `BETTER_AUTH_SECRET`, nicht in der DB); „Links zurücksetzen“ macht alte Links ungültig. Deaktivierte Mitglieder und gesperrte Organisationen bekommen 404. Rate-Limit pro IP und pro Feed.
- Hinweis: Google Kalender aktualisiert Abos nur etwa alle 12–24 Stunden, iOS lässt sich auf 15 Minuten stellen.

## Aktion: Tabs und Aufgaben-Blöcke

- Reihenfolge: **Zeitplan** (Start-Tab) · **Team** · **Planung** · **Feedback** · **Dateien** (· Historie unter 1536 px Breite)
- **Planung** (vorher „Notizen“) enthält Aufgaben direkt im Text: „/Aufgabe“ im Editor öffnet einen Dialog (Titel, Deadline relativ/fest, Zuständige); der Block zeigt Status, Deadline und Zuständige und lässt sich abhaken oder bearbeiten
- Der Block speichert nur die Aufgaben-ID – es sind dieselben Aufgaben wie in „Meine Aufgaben“ und im Kalender. Block löschen löscht die Aufgabe nicht; Aufgaben ohne Block stehen unter „Weitere Aufgaben dieser Aktion“ (mit „Einfügen“)
- „Von früherer Durchführung übernehmen“ biegt Aufgaben-Blöcke auf die neu angelegten Aufgaben um (ohne übernommene Aufgaben werden es Checklisten-Punkte)
- Alte Links `?tab=notizen` und `?tab=aufgaben` führen zur Planung

## Einrichtung

### 1. Neon

1. Neues Projekt, **Region AWS Europe Central 1 (Frankfurt)**, Postgres 17.
2. Unter *Connect* zwei Connection Strings kopieren:
   - **pooled** (Host mit `-pooler`) → `DATABASE_URL`
   - **direct** (ohne `-pooler`) → `DATABASE_URL_UNPOOLED` (für Migrationen)
3. Migrationen einspielen:

   ```bash
   npm install
   npm run db:migrate
   ```

   Auf Vercel passiert das automatisch bei jedem Deployment (siehe [Datenbank-Änderungen](#datenbank-änderungen)).

   Die Migration legt u. a. die Rolle `juna_app` an. Die App verbindet sich als Owner (`neondb_owner`) und wechselt für alle Zugriffe im Namen eines Users per `set local role juna_app` in den RLS-Kontext.

Tipp: Für Preview-Deployments und Tests eigene **Neon-Branches** verwenden (die Vercel-Integration von Neon kann pro Preview automatisch einen Branch anlegen).

### 2. Umgebungsvariablen

`.env.example` nach `.env.local` kopieren und ausfüllen. Dieselben Variablen in Vercel (*Project → Settings → Environment Variables*) hinterlegen, dort `NEXT_PUBLIC_SITE_URL=https://juna.app`.

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Neon, pooled – Laufzeit der App |
| `DATABASE_URL_UNPOOLED` | Neon, direkt – nur `npm run db:migrate` |
| `BETTER_AUTH_SECRET` | Signatur der Sessions, ≥ 32 Zeichen (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_SITE_URL` | Basis-URL für Links in Mails |
| `PLATFORM_ADMIN_EMAIL` | Empfänger neuer Anträge (Standard `apps@alw-mediaworks.de`) |
| `RESEND_API_KEY`, `MAIL_FROM` | Mailversand; ohne Key werden Mails in der Konsole ausgegeben |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (privater Store) für den Tab „Dateien“; wird beim Verbinden des Stores gesetzt |
| `JUNA_LOCAL_STORAGE_DIR` | nur lokal/Tests: Dateien in einem Ordner statt Blob (max. 5 MB) |
| `LIVEBLOCKS_SECRET_KEY` | Echtzeit-Bearbeitung (Secret Key `sk_…`); optional |

### 3. Vercel Blob und Liveblocks

- **Blob**: Vercel → *Storage* → *Create* → **Blob**, Zugriff **Private**, Region Frankfurt (`fra1`), mit dem Projekt verbinden (setzt `BLOB_READ_WRITE_TOKEN`). Ohne Store ist der Upload deaktiviert.
- **Liveblocks** (optional): Konto auf liveblocks.io, Projekt anlegen, unter *API keys* den **Secret key** als `LIVEBLOCKS_SECRET_KEY` hinterlegen. Der Raum-Zugang wird von `/api/liveblocks-auth` nur für Aktionen/Treffen der eigenen Organisation ausgegeben. Hinweis: Liveblocks speichert die Live-Dokumente in den USA; juna speichert zusätzlich einen Schnappschuss in Neon.

### 4. Resend

Domain `juna.app` in Resend verifizieren (DNS-Einträge SPF/DKIM), API-Key erzeugen.

### 5. Superadmin anlegen (einmalig)

```bash
npm run bootstrap:superadmin -- apps@alw-mediaworks.de "ALW Mediaworks"
```

Das Skript gibt einen Link aus (24 h gültig), über den das Passwort gesetzt wird. Danach ist unter `/admin` die Plattform-Verwaltung erreichbar.

### 6. Lokal entwickeln

```bash
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
```

## Datenbank-Änderungen

Migrationen laufen **automatisch bei jedem Push**: `vercel.json` setzt den Build-Befehl auf `npm run db:migrate && npm run build`. Schlägt eine Migration fehl, bricht der Build ab und die bisherige Version bleibt live.

- Ziel ist die Datenbank aus den Umgebungsvariablen der jeweiligen Vercel-Umgebung (`DATABASE_URL_UNPOOLED`, sonst `DATABASE_URL`):
  - **Production** → Produktions-Branch in Neon
  - **Preview** → mit der Neon-Integration ein eigener Branch pro Preview-Deployment; ohne Integration die Preview-Variablen (dafür einen separaten Neon-Branch `dev` hinterlegen, **nicht** Production)
- Variablen müssen in Vercel für *Production* und *Preview* gesetzt sein (beim Build verfügbar – bei normalen Env-Variablen der Fall).
- Neue Änderung = **neue Datei** `db/migrations/000N_beschreibung.sql`. Bereits eingespielte Dateien nie ändern – der Runner erkennt das per Prüfsumme und bricht ab.
- Migrationen **abwärtskompatibel** schreiben: Während des Builds läuft noch die alte Version gegen dieselbe Datenbank. Also erst Spalten/Tabellen hinzufügen, Entfernen erst in einer späteren Migration.
- Parallele Builds werden über einen Postgres-Advisory-Lock serialisiert.
- Stand prüfen: `select * from _migrations;` im Neon-SQL-Editor.
- Bei neuen Tabellen immer `org_id`, RLS-Policies und Grants für `juna_app` mitliefern und `src/db/schema.ts` nachziehen.

## Tests

**RLS / Mandantentrennung** – spielt alle Migrationen in eine **leere** Datenbank ein (z. B. ein frischer Neon-Branch oder lokales Postgres, nie Produktion) und prüft u. a., dass Mitglieder keine Daten fremder Organisationen sehen, sich keine Rechte selbst geben und keine Auth-Tabellen lesen können.

```bash
TEST_DATABASE_URL=postgresql://... npm run test:db
npm run test:unit
```

**End-to-End** – Antrag → Freigabe → Einladung → Passwort → Mitglied einladen → Rechte → Deaktivieren → Reset → Rate-Limit. Gegen eine leere Datenbank, ohne `RESEND_API_KEY`:

```bash
npx playwright install chromium     # einmalig
npm run build && npm start > /tmp/juna.log 2>&1 &
npm run bootstrap:superadmin -- apps@alw-mediaworks.de     # Link kopieren
E2E_BASE_URL=http://localhost:3000 E2E_MAIL_LOG=/tmp/juna.log node tests/e2e/flow.mjs "<Link>"
E2E_BASE_URL=http://localhost:3000 E2E_MAIL_LOG=/tmp/juna.log node tests/e2e/phase2.mjs   # danach, gleiche DB
E2E_BASE_URL=http://localhost:3000 E2E_MAIL_LOG=/tmp/juna.log node tests/e2e/phase3.mjs   # danach, gleiche DB
DATABASE_URL=... E2E_BASE_URL=http://localhost:3000 node tests/e2e/phase4.mjs   # Server mit JUNA_LOCAL_STORAGE_DIR starten
E2E_BASE_URL=http://localhost:3000 node tests/e2e/phase5.mjs
```

## Sicherheitsprinzipien

- Jede org-gebundene Tabelle hat `org_id` + RLS gegen `app.current_org_id()`; Zugriffe im User-Kontext laufen über `withUser()` (`src/db/index.ts`).
- Spaltenrechte: User dürfen am eigenen Profil nur unkritische Felder ändern (keine Rolle, Org, Status, Superadmin).
- Privilegierte Zugriffe (`adminDb()`) nur in Server Actions **nach** Prüfung über den Data Access Layer (`src/lib/auth.ts`); Ziel-Datensätze werden zusätzlich immer auf die eigene `org_id` gefiltert.
- Keine öffentliche Registrierung von Konten: User entstehen nur über Einladungen/Freigaben. Einladungs- und Reset-Links werden erst per Formular (POST) eingelöst, Link-Scanner in Mailprogrammen verbrauchen sie nicht.
- Deaktivierte Mitglieder: alle Sessions werden beendet, neue Anmeldungen blockiert. Nach einem Passwort-Reset werden alle bestehenden Sessions widerrufen.

## Struktur

```
db/migrations/      SQL-Migrationen (Quelle der Wahrheit), npm run db:migrate
src/
  app/
    (auth)/         Login, Passwort setzen/vergessen, Organisation beantragen
    (app)/          geschützte App: Übersicht, Aktionen, Aufgaben, Leiterrunde, Einstellungen, Admin
    manifest.ts     PWA-Manifest; icon.svg / apple-icon.png = Favicon & Homescreen-Icon
  components/       UI-Bausteine, App-Shell
  db/               Drizzle-Schema + Verbindung (adminDb / withUser)
  lib/              Better Auth, DAL, Einladungen, Mail, Rate-Limit
  proxy.ts          optimistischer Routenschutz (Next 16: ehemals middleware)
scripts/            Migrationen, Superadmin-Bootstrap
tests/              RLS- und E2E-Tests
public/brand, public/icons   Logo & App-Icons
```
