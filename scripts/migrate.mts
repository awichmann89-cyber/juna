/**
 * Spielt SQL-Migrationen aus db/migrations in Reihenfolge ein (je Datei eine Transaktion).
 *   npm run db:migrate            (liest DATABASE_URL aus .env.local)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}

const dir = join(process.cwd(), "db", "migrations");
const client = new Client({ connectionString: url });
await client.connect();
await client.query(`create table if not exists public._migrations (
  name text primary key, applied_at timestamptz not null default now())`);
const applied = new Set((await client.query("select name from public._migrations")).rows.map((r) => r.name));

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
let count = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  process.stdout.write(`→ ${file} … `);
  try {
    await client.query("begin");
    await client.query(readFileSync(join(dir, file), "utf8"));
    await client.query("insert into public._migrations (name) values ($1)", [file]);
    await client.query("commit");
    count++;
    console.log("ok");
  } catch (e) {
    await client.query("rollback");
    console.log("FEHLER");
    console.error(e);
    process.exit(1);
  }
}
console.log(count ? `${count} Migration(en) eingespielt.` : "Datenbank ist aktuell.");
await client.end();
