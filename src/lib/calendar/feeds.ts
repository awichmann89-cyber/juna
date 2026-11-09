import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { schema, withUser, type Tx } from "@/db";
import { statusLabels } from "@/lib/action-format";
import { env } from "@/lib/env";
import { agendaKindLabels, meetingTypeLabels } from "@/lib/meetings-data";
import { addDays, slotAttendance, taskDueDate, tsDate, tsTime, type LocalTs } from "@/lib/planning";
import { renderCalendar, zonedToUtc, type IcsEvent } from "./ics";

/** Zeitraum der Feeds: ein halbes Jahr zurück, zwei Jahre voraus */
const PAST_DAYS = 180;
const FUTURE_DAYS = 730;
/** Treffen ohne Endzeit: angenommene Dauer */
const MEETING_MINUTES = 120;

export type FeedOwner = { userId: string; orgId: string; orgName: string; timezone: string; displayName: string };

const SEQ_EPOCH = Date.UTC(2026, 0, 1);
/** Monoton steigende SEQUENCE aus dem Änderungszeitpunkt (Minuten seit 2026) */
const sequenceOf = (d: Date | null | undefined) => (d ? Math.max(0, Math.floor((d.getTime() - SEQ_EPOCH) / 60_000)) : 0);

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
const link = (path: string) => `${env.siteUrl}${path}`;
const uidOf = (kind: string, ...ids: string[]) => `${kind}-${ids.join("-")}@juna.app`;

function todayIn(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
function slotTimeLabel(start: LocalTs, end: LocalTs, multiDay: boolean) {
  const prefix = multiDay ? `${dayFmt.format(new Date(`${tsDate(start)}T00:00:00Z`))} ` : "";
  const endDay = tsDate(end) !== tsDate(start) ? `${dayFmt.format(new Date(`${tsDate(end)}T00:00:00Z`))} ` : "";
  return `${prefix}${tsTime(start)}–${endDay}${tsTime(end)}`;
}

function names(ids: string[], nameOf: Map<string, string>) {
  return ids
    .map((id) => nameOf.get(id) ?? "?")
    .sort((a, b) => a.localeCompare(b, "de"))
    .join(", ");
}

async function memberNames(tx: Tx, orgId: string) {
  const rows = await tx
    .select({ id: schema.profiles.id, name: schema.profiles.displayName })
    .from(schema.profiles)
    .where(eq(schema.profiles.orgId, orgId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function planningFor(tx: Tx, actionIds: string[]) {
  if (actionIds.length === 0) return { slots: [], participants: [], overrides: [], planners: [] };
  const slots = await tx
    .select({
      id: schema.actionSlots.id,
      actionId: schema.actionSlots.actionId,
      title: schema.actionSlots.title,
      description: schema.actionSlots.description,
      startsAt: schema.actionSlots.startsAt,
      endsAt: schema.actionSlots.endsAt,
      minPeople: schema.actionSlots.minPeople,
      updatedAt: schema.actionSlots.updatedAt,
    })
    .from(schema.actionSlots)
    .where(inArray(schema.actionSlots.actionId, actionIds))
    .orderBy(asc(schema.actionSlots.startsAt));
  const participants = await tx
    .select({
      actionId: schema.actionParticipants.actionId,
      userId: schema.actionParticipants.userId,
      status: schema.actionParticipants.status,
      presentFrom: schema.actionParticipants.presentFrom,
      presentUntil: schema.actionParticipants.presentUntil,
      updatedAt: schema.actionParticipants.updatedAt,
    })
    .from(schema.actionParticipants)
    .where(inArray(schema.actionParticipants.actionId, actionIds));
  const slotIds = slots.map((s) => s.id);
  const overrides = slotIds.length
    ? await tx
        .select({ slotId: schema.slotOverrides.slotId, userId: schema.slotOverrides.userId, present: schema.slotOverrides.present })
        .from(schema.slotOverrides)
        .where(inArray(schema.slotOverrides.slotId, slotIds))
    : [];
  const planners = await tx
    .select({ actionId: schema.actionPlanners.actionId, userId: schema.actionPlanners.userId })
    .from(schema.actionPlanners)
    .where(inArray(schema.actionPlanners.actionId, actionIds));
  return { slots, participants, overrides, planners };
}

type Planning = Awaited<ReturnType<typeof planningFor>>;

function byAction<T extends { actionId: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(r.actionId, [...(map.get(r.actionId) ?? []), r]);
  return map;
}

// ---------------------------------------------------------------------------
// Org-Kalender: alle Aktionen als Ganztagstermine + Leiterrundentreffen
// ---------------------------------------------------------------------------

export async function orgFeed(owner: FeedOwner) {
  const today = todayIn(owner.timezone);
  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, FUTURE_DAYS);

  const data = await withUser(owner.userId, async (tx) => {
    const a = schema.actions;
    const actions = await tx
      .select({
        id: a.id,
        title: a.title,
        date: a.date,
        endDate: a.endDate,
        startTime: a.startTime,
        endTime: a.endTime,
        location: a.location,
        status: a.status,
        notesText: a.notesText,
        updatedAt: a.updatedAt,
        seriesName: schema.actionSeries.name,
      })
      .from(a)
      .leftJoin(schema.actionSeries, eq(schema.actionSeries.id, a.seriesId))
      .where(
        and(
          eq(a.orgId, owner.orgId),
          isNotNull(a.date),
          ne(a.status, "idee"),
          gte(sql`coalesce(${a.endDate}, ${a.date})`, from),
          lte(a.date, to),
        ),
      )
      .orderBy(asc(a.date));
    const planning = await planningFor(
      tx,
      actions.map((x) => x.id),
    );
    const m = schema.meetings;
    const meetings = await tx
      .select({
        id: m.id,
        title: m.title,
        type: m.type,
        date: m.date,
        startTime: m.startTime,
        location: m.location,
        updatedAt: m.updatedAt,
        protocolOwner: m.protocolOwner,
      })
      .from(m)
      .where(and(eq(m.orgId, owner.orgId), gte(m.date, from), lte(m.date, to)))
      .orderBy(asc(m.date));
    const agenda = meetings.length
      ? await tx
          .select({
            meetingId: schema.meetingAgenda.meetingId,
            kind: schema.meetingAgenda.kind,
            title: sql<string>`coalesce(${schema.meetingAgenda.title}, ${schema.actions.title})`,
          })
          .from(schema.meetingAgenda)
          .leftJoin(schema.actions, eq(schema.actions.id, schema.meetingAgenda.actionId))
          .where(
            inArray(
              schema.meetingAgenda.meetingId,
              meetings.map((x) => x.id),
            ),
          )
          .orderBy(asc(schema.meetingAgenda.position))
      : [];
    const nameOf = await memberNames(tx, owner.orgId);
    return { actions, planning, meetings, agenda, nameOf };
  });

  const slotsBy = byAction(data.planning.slots);
  const partsBy = byAction(data.planning.participants);
  const plannersBy = byAction(data.planning.planners);
  const events: IcsEvent[] = [];

  for (const act of data.actions) {
    const slots = slotsBy.get(act.id) ?? [];
    const parts = partsBy.get(act.id) ?? [];
    const multiDay = Boolean(act.endDate && act.endDate !== act.date);
    const lines: string[] = [];
    const start = hm(act.startTime);
    const end = hm(act.endTime);
    if (start) lines.push(`Zeit: ${start}${end ? `–${end}` : ""} Uhr`);
    if (act.seriesName) lines.push(`Reihe: ${act.seriesName}`);
    lines.push(`Status: ${statusLabels[act.status]}`);

    if (slots.length) {
      const att = slotAttendance(slots, parts, data.planning.overrides.filter((o) => slots.some((s) => s.id === o.slotId)));
      lines.push("", "ZEITPLAN");
      for (const s of slots) {
        const a = att.get(s.id)!;
        const count = s.minPeople ? `${a.present.length}/${s.minPeople}` : `${a.present.length}`;
        lines.push(`• ${slotTimeLabel(s.startsAt, s.endsAt, multiDay)} ${s.title} (${count} dabei${a.understaffed ? ", unterbesetzt" : ""})`);
      }
    }
    const dabei = parts.filter((p) => p.status === "dabei").map((p) => p.userId);
    const vielleicht = parts.filter((p) => p.status === "vielleicht").map((p) => p.userId);
    const planners = (plannersBy.get(act.id) ?? []).map((p) => p.userId);
    if (dabei.length || vielleicht.length || planners.length) {
      lines.push("", "TEAM");
      if (planners.length) lines.push(`Planungsteam: ${names(planners, data.nameOf)}`);
      if (dabei.length) lines.push(`Dabei: ${names(dabei, data.nameOf)}`);
      if (vielleicht.length) lines.push(`Vielleicht: ${names(vielleicht, data.nameOf)}`);
    }
    if (act.notesText.trim()) lines.push("", "NOTIZEN", act.notesText.trim());
    lines.push("", link(`/aktionen/${act.id}`));

    const lastChange = [act.updatedAt, ...slots.map((s) => s.updatedAt), ...parts.map((p) => p.updatedAt)].reduce((x, y) =>
      y > x ? y : x,
    );
    events.push({
      uid: uidOf("aktion", act.id),
      summary: act.title,
      start: { kind: "date", date: act.date! },
      end: { kind: "date", date: addDays(act.endDate && act.endDate > act.date! ? act.endDate : act.date!, 1) },
      description: lines.join("\n"),
      location: act.location,
      url: link(`/aktionen/${act.id}`),
      status: act.status === "geplant" || act.status === "in_planung" ? "CONFIRMED" : undefined,
      sequence: sequenceOf(act.updatedAt),
      lastModified: lastChange,
      categories: act.seriesName ? [act.seriesName] : undefined,
    });
  }

  for (const mt of data.meetings) {
    const items = data.agenda.filter((x) => x.meetingId === mt.id);
    const lines = [meetingTypeLabels[mt.type]];
    if (mt.protocolOwner) lines.push(`Protokoll: ${data.nameOf.get(mt.protocolOwner) ?? "?"}`);
    if (items.length) {
      lines.push("", "AGENDA");
      items.forEach((it, i) => lines.push(`${i + 1}. ${it.title}${it.kind !== "sonstiges" ? ` (${agendaKindLabels[it.kind]})` : ""}`));
    }
    lines.push("", link(`/leiterrunde/${mt.id}`));
    const start = mt.startTime ? zonedToUtc(`${mt.date} ${hm(mt.startTime)}`, owner.timezone) : null;
    events.push({
      uid: uidOf("treffen", mt.id),
      summary: `Leiterrunde: ${mt.title}`,
      start: start ? { kind: "utc", at: start } : { kind: "date", date: mt.date },
      end: start ? { kind: "utc", at: new Date(start.getTime() + MEETING_MINUTES * 60_000) } : { kind: "date", date: addDays(mt.date, 1) },
      description: lines.join("\n"),
      location: mt.location,
      url: link(`/leiterrunde/${mt.id}`),
      status: "CONFIRMED",
      sequence: sequenceOf(mt.updatedAt),
      lastModified: mt.updatedAt,
      categories: ["Leiterrunde"],
    });
  }

  return renderCalendar({
    name: `juna · ${owner.orgName}`,
    description: `Aktionen und Treffen von ${owner.orgName}`,
    timezone: owner.timezone,
    now: new Date(),
    events,
  });
}

// ---------------------------------------------------------------------------
// Persönlicher Kalender: meine Zeitslots, Einsätze ohne Zeitplan, Deadlines meiner Aufgaben
// ---------------------------------------------------------------------------

export async function personalFeed(owner: FeedOwner) {
  const tz = owner.timezone;
  const today = todayIn(tz);
  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, FUTURE_DAYS);

  const data = await withUser(owner.userId, async (tx) => {
    const a = schema.actions;
    const mine = await tx
      .select({
        id: a.id,
        title: a.title,
        date: a.date,
        endDate: a.endDate,
        startTime: a.startTime,
        endTime: a.endTime,
        location: a.location,
        updatedAt: a.updatedAt,
      })
      .from(schema.actionParticipants)
      .innerJoin(a, eq(a.id, schema.actionParticipants.actionId))
      .where(
        and(
          eq(schema.actionParticipants.userId, owner.userId),
          ne(schema.actionParticipants.status, "nicht_dabei"),
          isNotNull(a.date),
          gte(sql`coalesce(${a.endDate}, ${a.date})`, from),
          lte(a.date, to),
        ),
      );
    const planning: Planning = await planningFor(
      tx,
      mine.map((x) => x.id),
    );
    const t = schema.tasks;
    const tasks = await tx
      .select({
        id: t.id,
        title: t.title,
        description: t.description,
        dueDaysBefore: t.dueDaysBefore,
        dueDate: t.dueDate,
        updatedAt: t.updatedAt,
        actionId: a.id,
        actionTitle: a.title,
        actionDate: a.date,
      })
      .from(schema.taskAssignees)
      .innerJoin(t, eq(t.id, schema.taskAssignees.taskId))
      .innerJoin(a, eq(a.id, t.actionId))
      .where(
        and(
          eq(schema.taskAssignees.userId, owner.userId),
          eq(t.status, "offen"),
          or(isNotNull(t.dueDate), and(isNotNull(t.dueDaysBefore), isNotNull(a.date))),
        ),
      );
    const nameOf = await memberNames(tx, owner.orgId);
    return { mine, planning, tasks, nameOf };
  });

  const slotsBy = byAction(data.planning.slots);
  const partsBy = byAction(data.planning.participants);
  const events: IcsEvent[] = [];

  for (const act of data.mine) {
    const slots = slotsBy.get(act.id) ?? [];
    const parts = partsBy.get(act.id) ?? [];
    const me = parts.find((p) => p.userId === owner.userId)!;
    const maybe = me.status === "vielleicht";
    const url = link(`/aktionen/${act.id}?tab=team`);

    if (slots.length) {
      const att = slotAttendance(slots, parts, data.planning.overrides.filter((o) => slots.some((s) => s.id === o.slotId)));
      for (const s of slots) {
        const a = att.get(s.id)!;
        if (!a.present.includes(owner.userId) && !a.maybe.includes(owner.userId)) continue;
        const others = a.present.filter((id) => id !== owner.userId);
        const lines = [act.title];
        if (s.description) lines.push(s.description);
        lines.push(`Mit dabei: ${others.length ? names(others, data.nameOf) : "noch niemand"}`);
        if (a.maybe.length) lines.push(`Vielleicht: ${names(a.maybe, data.nameOf)}`);
        if (s.minPeople && a.present.length < s.minPeople) lines.push(`⚠ Unterbesetzt (${a.present.length}/${s.minPeople})`);
        if (maybe) lines.push("", "Du bist als „vielleicht“ eingetragen – bitte zu- oder absagen.");
        lines.push("", url);
        events.push({
          uid: uidOf("slot", s.id, owner.userId),
          summary: `${maybe ? "(?) " : ""}${s.title} · ${act.title}`,
          start: { kind: "utc", at: zonedToUtc(s.startsAt, tz) },
          end: { kind: "utc", at: zonedToUtc(s.endsAt, tz) },
          description: lines.join("\n"),
          location: act.location,
          url,
          status: maybe ? "TENTATIVE" : "CONFIRMED",
          sequence: sequenceOf(s.updatedAt > me.updatedAt ? s.updatedAt : me.updatedAt),
          lastModified: [act.updatedAt, s.updatedAt, me.updatedAt].reduce((x, y) => (y > x ? y : x)),
        });
      }
      continue;
    }

    // Kein Zeitplan: ganze Aktion bzw. mein Anwesenheitsfenster
    const lastDay = act.endDate && act.endDate > act.date! ? act.endDate : act.date!;
    const startLocal = me.presentFrom ?? (act.startTime ? `${act.date} ${hm(act.startTime)}` : null);
    let endLocal = me.presentUntil ?? (act.endTime ? `${lastDay} ${hm(act.endTime)}` : null);
    const lines = [maybe ? "Du bist als „vielleicht“ eingetragen – bitte zu- oder absagen." : "Du bist dabei."];
    const others = parts.filter((p) => p.status === "dabei" && p.userId !== owner.userId).map((p) => p.userId);
    if (others.length) lines.push(`Mit dabei: ${names(others, data.nameOf)}`);
    lines.push("", url);
    let start: IcsEvent["start"];
    let end: IcsEvent["end"];
    if (startLocal) {
      const s = zonedToUtc(startLocal, tz);
      if (!endLocal || endLocal <= startLocal) endLocal = null;
      start = { kind: "utc", at: s };
      end = { kind: "utc", at: endLocal ? zonedToUtc(endLocal, tz) : new Date(s.getTime() + 2 * 3_600_000) };
    } else {
      start = { kind: "date", date: act.date! };
      end = { kind: "date", date: addDays(lastDay, 1) };
    }
    events.push({
      uid: uidOf("einsatz", act.id, owner.userId),
      summary: `${maybe ? "(?) " : ""}${act.title}`,
      start,
      end,
      description: lines.join("\n"),
      location: act.location,
      url,
      status: maybe ? "TENTATIVE" : "CONFIRMED",
      sequence: sequenceOf(act.updatedAt > me.updatedAt ? act.updatedAt : me.updatedAt),
      lastModified: act.updatedAt > me.updatedAt ? act.updatedAt : me.updatedAt,
    });
  }

  for (const task of data.tasks) {
    const due = taskDueDate(task, task.actionDate);
    if (!due || due < from || due > to) continue;
    const lines = [`Aufgabe für „${task.actionTitle}“`];
    if (task.description) lines.push(task.description);
    lines.push("", link(`/aktionen/${task.actionId}?tab=planung`));
    events.push({
      uid: uidOf("aufgabe", task.id, owner.userId),
      summary: `☐ ${task.title} (${task.actionTitle})`,
      start: { kind: "date", date: due },
      end: { kind: "date", date: addDays(due, 1) },
      description: lines.join("\n"),
      url: link(`/aktionen/${task.actionId}?tab=planung`),
      sequence: sequenceOf(task.updatedAt),
      lastModified: task.updatedAt,
      transparent: true,
      categories: ["Aufgabe"],
    });
  }

  return renderCalendar({
    name: `juna · ${owner.displayName}`,
    description: `Meine Einsätze und Aufgaben bei ${owner.orgName}`,
    timezone: tz,
    now: new Date(),
    events,
  });
}
