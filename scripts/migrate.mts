/**
 * Spielt SQL-Migrationen aus db/migrations in Reihenfolge ein (je Datei eine Transaktion).
 *
 *   npm run db:migrate            lokal (liest .env.local)
 *   Vercel                        automatisch vor jedem Build (vercel.json → buildCommand)
 *
 * Regeln:
 *   - Eingespielte Migrationen nie mehr ändern, sondern eine neue Datei anlegen
 *     (0002_…sql, 0003_…sql). Geänderte Dateien werden per Prüfsumme erkannt → Abbruch.
 *   - Migrationen abwärtskompatibel halten: Während des Builds läuft noch die alte Version
 *     gegen dieselbe Datenbank (erst Spalte hinzufügen, später in eigener Migration entfernen).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { normalizeConnectionString } from "../src/db/connection-string";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL bzw. DATABASE_URL_UNPOOLED fehlt – Migrationen nicht möglich.");
  process.exit(1);
}

const target = new URL(url);
const env = process.env.VERCEL_ENV ? ` [Vercel: ${process.env.VERCEL_ENV}]` : "";
console.log(`Migrationen → ${target.hostname}/${target.pathname.slice(1)} (User ${target.username})${env}`);

const dir = join(process.cwd(), "db", "migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
  .sort();
// CRLF/LF-neutral, damit Windows-Checkouts und Vercel dieselbe Prüfsumme ergeben
const sha = (s: string) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex");

const client = new Client({ connectionString: normalizeConnectionString(url) });
await client.connect();

// Gleichzeitige Builds (z. B. zwei Pushes kurz hintereinander) serialisieren
const LOCK_ID = 727_001;
await client.query("select pg_advisory_lock($1)", [LOCK_ID]);

let exitCode = 0;
try {
  await client.query(`create table if not exists public._migrations (
    name text primary key,
    checksum text,
    applied_at timestamptz not null default now())`);
  await client.query("alter table public._migrations add column if not exists checksum text");

  const applied = new Map<string, string | null>(
    (await client.query("select name, checksum from public._migrations")).rows.map((r) => [r.name, r.checksum]),
  );

  let count = 0;
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf8");
    const checksum = sha(content);

    if (applied.has(file)) {
      const stored = applied.get(file);
      if (stored === null) {
        await client.query("update public._migrations set checksum = $2 where name = $1", [file, checksum]);
      } else if (stored !== checksum) {
        throw new Error(
          `${file} wurde nach dem Einspielen verändert. Änderungen bitte als neue Migration anlegen.`,
        );
      }
      continue;
    }

    process.stdout.write(`→ ${file} … `);
    try {
      await client.query("begin");
      await client.query(content);
      await client.query("insert into public._migrations (name, checksum) values ($1, $2)", [file, checksum]);
      await client.query("commit");
      count++;
      console.log("ok");
    } catch (e) {
      await client.query("rollback");
      console.log("FEHLER");
      throw e;
    }
  }
  console.log(count ? `✔ ${count} Migration(en) eingespielt.` : "✔ Datenbank ist aktuell.");
} catch (e) {
  console.error("✖", e instanceof Error ? e.message : e);
  exitCode = 1;
} finally {
  await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
  await client.end();
}
process.exit(exitCode);
