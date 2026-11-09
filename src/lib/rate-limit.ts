import "server-only";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { adminDb } from "@/db";

/**
 * Einfacher, instanzübergreifender Rate-Limiter (Fixed Window) auf auth.rate_limit.
 * Gibt true zurück, wenn die Aktion erlaubt ist.
 */
export async function consumeRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const result = await adminDb().execute<{ count: number }>(sql`
    insert into auth.rate_limit (id, key, count, last_request)
    values (${`juna:${key}`}, ${`juna:${key}`}, 1, ${now})
    on conflict (key) do update set
      count = case when auth.rate_limit.last_request < ${windowStart} then 1 else auth.rate_limit.count + 1 end,
      last_request = case when auth.rate_limit.last_request < ${windowStart} then ${now} else auth.rate_limit.last_request end
    returning count
  `);
  return (result.rows[0]?.count ?? 1) <= max;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
