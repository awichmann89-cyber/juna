import "server-only";
import { and, asc, count, desc, eq, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { schema, withUser } from "@/db";
import type { ActionStatus, SeriesColor } from "@/db/schema";
import type { OrgUser } from "@/lib/auth";

const a = schema.actions;
const s = schema.actionSeries;

/** Felder für Listen/Kalender (ohne Notizen-JSON) */
const listFields = {
  id: a.id,
  title: a.title,
  status: a.status,
  date: a.date,
  endDate: a.endDate,
  startTime: a.startTime,
  endTime: a.endTime,
  location: a.location,
  seriesId: a.seriesId,
  seriesName: s.name,
  seriesColor: s.color,
};

export type ActionListItem = {
  id: string;
  title: string;
  status: ActionStatus;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  seriesId: string | null;
  seriesName: string | null;
  seriesColor: SeriesColor | null;
};

export type ActionView = "kommend" | "vergangen" | "ideen";

export async function listActions(
  user: OrgUser,
  opts: { view: ActionView; today: string; seriesId?: string; limit?: number },
): Promise<ActionListItem[]> {
  return withUser(user.id, async (tx) => {
    const conds = [eq(a.orgId, user.org.id)];
    if (opts.seriesId) conds.push(eq(a.seriesId, opts.seriesId));
    if (opts.view === "ideen") conds.push(isNull(a.date));
    // Mehrtägige Aktionen gelten bis zum Enddatum als „kommend“
    const lastDay = sql`coalesce(${a.endDate}, ${a.date})`;
    if (opts.view === "kommend") conds.push(sql`${lastDay} >= ${opts.today}`);
    if (opts.view === "vergangen") conds.push(sql`${lastDay} < ${opts.today}`);

    const q = tx
      .select(listFields)
      .from(a)
      .leftJoin(s, eq(s.id, a.seriesId))
      .where(and(...conds))
      .orderBy(
        opts.view === "vergangen" ? desc(a.date) : asc(a.date),
        asc(a.startTime),
        opts.view === "ideen" ? desc(a.createdAt) : asc(a.title),
      );
    return (await (opts.limit ? q.limit(opts.limit) : q)) as ActionListItem[];
  });
}

/** Aktionen, die einen Zeitraum berühren (Kalender) */
export async function listActionsInRange(user: OrgUser, from: string, to: string): Promise<ActionListItem[]> {
  return withUser(user.id, async (tx) => {
    const rows = await tx
      .select(listFields)
      .from(a)
      .leftJoin(s, eq(s.id, a.seriesId))
      .where(
        and(
          eq(a.orgId, user.org.id),
          lte(a.date, to),
          or(gte(sql`coalesce(${a.endDate}, ${a.date})`, from)),
        ),
      )
      .orderBy(asc(a.date), asc(a.startTime), asc(a.title));
    return rows as ActionListItem[];
  });
}

export async function countIdeas(user: OrgUser) {
  return withUser(user.id, async (tx) => {
    const [row] = await tx
      .select({ n: count() })
      .from(a)
      .where(and(eq(a.orgId, user.org.id), isNull(a.date)));
    return row?.n ?? 0;
  });
}

export async function getAction(user: OrgUser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return withUser(user.id, async (tx) => {
    const [row] = await tx
      .select({
        ...listFields,
        notes: a.notes,
        notesText: a.notesText,
        notesVersion: a.notesVersion,
        notesUpdatedAt: a.notesUpdatedAt,
        notesUpdatedByName: sql<string | null>`(select display_name from public.profiles p where p.id = ${a.notesUpdatedBy})`,
        createdAt: a.createdAt,
        createdByName: sql<string | null>`(select display_name from public.profiles p where p.id = ${a.createdBy})`,
      })
      .from(a)
      .leftJoin(s, eq(s.id, a.seriesId))
      .where(and(eq(a.id, id), eq(a.orgId, user.org.id)));
    return row ?? null;
  });
}

export type ActionDetail = NonNullable<Awaited<ReturnType<typeof getAction>>>;

/** Frühere (und spätere) Durchführungen derselben Reihe – neueste zuerst */
export async function seriesHistory(user: OrgUser, seriesId: string, excludeId: string) {
  return withUser(user.id, async (tx) =>
    tx
      .select({
        id: a.id,
        title: a.title,
        status: a.status,
        date: a.date,
        endDate: a.endDate,
        startTime: a.startTime,
        endTime: a.endTime,
        notesText: a.notesText,
      })
      .from(a)
      .where(and(eq(a.orgId, user.org.id), eq(a.seriesId, seriesId), ne(a.id, excludeId)))
      .orderBy(sql`${a.date} desc nulls last`)
      .limit(30),
  );
}

export type SeriesItem = {
  id: string;
  name: string;
  description: string | null;
  color: SeriesColor;
  archived: boolean;
  actionCount: number;
  lastDate: string | null;
  nextDate: string | null;
};

export async function listSeries(user: OrgUser, today: string): Promise<SeriesItem[]> {
  return withUser(user.id, async (tx) => {
    const rows = await tx
      .select({
        id: s.id,
        name: s.name,
        description: s.description,
        color: s.color,
        archived: s.archived,
        actionCount: sql<number>`count(${a.id})::int`,
        lastDate: sql<string | null>`max(${a.date}) filter (where ${a.date} < ${today})`,
        nextDate: sql<string | null>`min(${a.date}) filter (where ${a.date} >= ${today})`,
      })
      .from(s)
      .leftJoin(a, eq(a.seriesId, s.id))
      .where(eq(s.orgId, user.org.id))
      .groupBy(s.id)
      .orderBy(asc(s.archived), asc(sql`lower(${s.name})`));
    return rows.map((r) => ({ ...r, lastDate: r.lastDate ? String(r.lastDate).slice(0, 10) : null, nextDate: r.nextDate ? String(r.nextDate).slice(0, 10) : null })) as SeriesItem[];
  });
}

/** Für Auswahllisten */
export async function seriesOptions(user: OrgUser) {
  return withUser(user.id, (tx) =>
    tx
      .select({ id: s.id, name: s.name, color: s.color, archived: s.archived })
      .from(s)
      .where(eq(s.orgId, user.org.id))
      .orderBy(asc(sql`lower(${s.name})`)),
  );
}

/** Letzte Durchführung einer Reihe vor einem Datum (für Vorschläge beim Anlegen) */
export async function lastInSeries(user: OrgUser, seriesId: string, before?: string) {
  return withUser(user.id, async (tx) => {
    const [row] = await tx
      .select({ id: a.id, title: a.title, location: a.location, startTime: a.startTime, endTime: a.endTime, date: a.date })
      .from(a)
      .where(
        and(eq(a.orgId, user.org.id), eq(a.seriesId, seriesId), before ? lt(a.date, before) : undefined),
      )
      .orderBy(sql`${a.date} desc nulls last`)
      .limit(1);
    return row ?? null;
  });
}
