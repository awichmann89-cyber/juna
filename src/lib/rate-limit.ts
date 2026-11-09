import "server-only";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { adminDb } from "@/db";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Einfacher, instanzübergreifender Rate-Limiter (Fixed Window) auf auth.rate_limit.
 * Das Fenster beginnt mit der ersten Anfrage; last_request speichert den Fensterbeginn.
 */
export async function consumeRateLimit(key: string, windowSeconds: number, max: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const id = `juna:${key}`;
  const result = await adminDb().execute<{ count: number; started: string }>(sql`
    insert into auth.rate_limit (id, key, count, last_request)
    values (${id}, ${id}, 1, ${now})
    on conflict (key) do update set
      count = case when auth.rate_limit.last_request < ${windowStart} then 1 else auth.rate_limit.count + 1 end,
      last_request = case when auth.rate_limit.last_request < ${windowStart} then ${now} else auth.rate_limit.last_request end
    returning count, last_request as started
  `);
  const row = result.rows[0];
  const count = Number(row?.count ?? 1);
  const started = Number(row?.started ?? now);
  const retryAfterSeconds = Math.max(1, Math.ceil((started + windowSeconds * 1000 - now) / 1000));
  return { allowed: count <= max, retryAfterSeconds };
}

/** „in 42 Minuten“ / „in 1 Minute“ / „in wenigen Sekunden“ */
export function formatRetryAfter(seconds: number) {
  if (seconds < 60) return "in wenigen Sekunden";
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "in einer Minute" : `in ${minutes} Minuten`;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
