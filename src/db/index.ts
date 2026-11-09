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
  });
  // Vercel Fluid Compute: Pool sauber schließen, wenn die Instanz suspendiert wird
  attachDatabasePool(pool);
  return pool;
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
  return adminDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`set local role juna_app`);
    return fn(tx);
  });
}

export { schema };
