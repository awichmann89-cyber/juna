import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { normalizeConnectionString } from "./connection-string";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { junaPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL fehlt (siehe .env.example).");
  const pool = new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max: 5,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    connectionTimeoutMillis: 10_000,
  });
  // Vercel Fluid Compute: Pool sauber schließen, wenn die Instanz suspendiert wird
  attachDatabasePool(pool);
  // Abgebrochene Leerlauf-Verbindungen (Neon/Pooler, eingefrorene Instanz) dürfen den Prozess nicht stören
  pool.on("error", (err) => console.warn("[db] Leerlauf-Verbindung beendet:", err.message));
  // Auch ausgeliehene Verbindungen ohne laufende Abfrage: Fehler nur protokollieren (sonst uncaughtException).
  // Laufende Abfragen bekommen den Fehler weiterhin als Rejection.
  pool.on("connect", (client) => {
    client.on("error", (err) => console.warn("[db] Verbindung beendet:", err.message));
  });

  // Einzelabfragen (u. a. Better Auth) einmal wiederholen, wenn eine tote Verbindung erwischt wurde.
  // Die Verbindung wird vom Pool verworfen, der zweite Versuch nimmt eine frische.
  const query = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
  pool.query = (async (...args: unknown[]) => {
    if (typeof args.at(-1) === "function") return query(...args);
    try {
      return await query(...args);
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      console.warn("[db] Verbindung verloren, wiederhole Abfrage:", (err as Error).message);
      return query(...args);
    }
  }) as typeof pool.query;
  return pool;
}

/** Fehler, bei denen die Verbindung (nicht die Abfrage) das Problem war */
export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: unknown } | null;
  if (!e) return false;
  if (e.cause && isConnectionError(e.cause)) return true;
  if (e.code && ["ECONNRESET", "EPIPE", "ETIMEDOUT", "57P01", "57P02", "57P03", "08006", "08003"].includes(e.code)) return true;
  return /Connection terminated|Client has encountered a connection error|connection is closed/i.test(e.message ?? "");
}

let _db: Db | undefined;

/**
 * Privilegierter Zugriff (Owner-Rolle, umgeht RLS).
 * Nur für Better Auth und Server-Operationen NACH expliziter Berechtigungsprüfung im DAL.
 */
export function adminDb(): Db {
  if (!_db) {
    const pool = (globalForDb.junaPool ??= createPool());
    _db = drizzle(pool, { schema });
  }
  return _db;
}

/**
 * Führt fn im Namen eines Users aus: RLS-Policies und Spaltenrechte der Rolle juna_app greifen.
 * Alles innerhalb von fn läuft in einer Transaktion.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let started = false;
  const run = () =>
    adminDb().transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      started = true;
      await tx.execute(sql`set local role juna_app`);
      return fn(tx);
    });
  try {
    return await run();
  } catch (err) {
    // Nur wiederholen, wenn die Verbindung schon vor der ersten Anweisung tot war –
    // dann ist sicher nichts ausgeführt worden.
    if (started || !isConnectionError(err)) throw err;
    console.warn("[db] Verbindung verloren, wiederhole Transaktion:", (err as Error).message);
    return run();
  }
}

export { schema };
