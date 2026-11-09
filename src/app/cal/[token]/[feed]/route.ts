import { and, eq, sql } from "drizzle-orm";
import { adminDb, schema } from "@/db";
import { orgFeed, personalFeed, type FeedOwner } from "@/lib/calendar/feeds";
import { verifyFeedToken } from "@/lib/calendar/token";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";

const notFound = () => new Response("Kalender nicht gefunden.", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Öffentliche Abo-URL (ohne Login, das Token ist das Geheimnis):
 *   /cal/<token>/personal.ics – meine Einsätze und Aufgaben
 *   /cal/<token>/org.ics      – alle Aktionen und Treffen der Organisation
 * Die Inhalte werden im RLS-Kontext des Token-Inhabers gelesen.
 */
async function handle(_request: Request, ctx: RouteContext<"/cal/[token]/[feed]">) {
  const { token, feed } = await ctx.params;
  if (feed !== "personal.ics" && feed !== "org.ics") return notFound();

  // Ratenbegrenzung gegen Ausprobieren von Tokens (pro IP) und gegen zu häufiges Abrufen (pro Feed)
  const ip = await clientIp();
  const ipLimit = await consumeRateLimit(`ics-ip:${ip}`, 600, 300);
  if (!ipLimit.allowed) return new Response("Zu viele Anfragen.", { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } });

  const feedId = verifyFeedToken(token);
  if (!feedId) return notFound();

  const [row] = await adminDb()
    .select({
      userId: schema.calendarFeeds.userId,
      orgId: schema.calendarFeeds.orgId,
      lastAccessedAt: schema.calendarFeeds.lastAccessedAt,
      displayName: schema.profiles.displayName,
      memberStatus: schema.profiles.status,
      orgName: schema.organizations.name,
      orgStatus: schema.organizations.status,
      timezone: sql<string>`coalesce(${schema.profiles.timezone}, ${schema.organizations.timezone})`,
    })
    .from(schema.calendarFeeds)
    .innerJoin(schema.profiles, and(eq(schema.profiles.id, schema.calendarFeeds.userId), eq(schema.profiles.orgId, schema.calendarFeeds.orgId)))
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.calendarFeeds.orgId))
    .where(eq(schema.calendarFeeds.id, feedId));
  // Deaktivierte Mitglieder und gesperrte Organisationen bekommen nichts mehr
  if (!row || row.memberStatus !== "active" || row.orgStatus !== "active") return notFound();

  const feedLimit = await consumeRateLimit(`ics-feed:${feedId}`, 3600, 120);
  if (!feedLimit.allowed) return new Response("Zu viele Anfragen.", { status: 429, headers: { "Retry-After": String(feedLimit.retryAfterSeconds) } });

  const owner: FeedOwner = {
    userId: row.userId,
    orgId: row.orgId,
    orgName: row.orgName,
    timezone: row.timezone || "Europe/Berlin",
    displayName: row.displayName,
  };
  const body = feed === "org.ics" ? await orgFeed(owner) : await personalFeed(owner);

  // Letzten Abruf vermerken (höchstens alle 15 Minuten schreiben)
  if (!row.lastAccessedAt || Date.now() - row.lastAccessedAt.getTime() > 15 * 60_000) {
    await adminDb()
      .update(schema.calendarFeeds)
      .set({ lastAccessedAt: new Date() })
      .where(eq(schema.calendarFeeds.id, feedId))
      .catch(() => {});
  }

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="juna-${feed === "org.ics" ? "organisation" : "persoenlich"}.ics"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export const GET = handle;
export const HEAD = async (request: Request, ctx: RouteContext<"/cal/[token]/[feed]">) => {
  const res = await handle(request, ctx);
  return new Response(null, { status: res.status, headers: res.headers });
};
