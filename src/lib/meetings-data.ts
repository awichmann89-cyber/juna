import "server-only";
import { and, asc, desc, eq, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { schema, withUser, type Tx } from "@/db";
import type { ActionStatus, AgendaKind, AttendanceStatus, MeetingStatus, MeetingType, SeriesColor } from "@/db/schema";
import type { OrgUser } from "@/lib/auth";
import { addDays } from "@/lib/planning";

const m = schema.meetings;

export const meetingTypeLabels: Record<MeetingType, string> = {
  jahresplanung: "Jahresplanung",
  monatstreffen: "Monatstreffen",
  sonstiges: "Treffen",
};
export const meetingStatusLabels: Record<MeetingStatus, string> = {
  geplant: "Geplant",
  laufend: "Läuft",
  abgeschlossen: "Abgeschlossen",
};
export const agendaKindLabels: Record<AgendaKind, string> = {
  feedback: "Feedback",
  planung: "Planung",
  sonstiges: "Sonstiges",
};
export const attendanceLabels: Record<AttendanceStatus, string> = {
  anwesend: "Anwesend",
  entschuldigt: "Entschuldigt",
  fehlt: "Fehlt",
};

/** Anwesenheit anderer erfassen dürfen: Protokollführung, Admins – oder alle, solange niemand eingeteilt ist */
export function canRecordOthers(user: OrgUser, meeting: { protocolOwner: string | null }) {
  return user.role === "admin" || !meeting.protocolOwner || meeting.protocolOwner === user.id;
}

export type MeetingListItem = {
  id: string;
  type: MeetingType;
  title: string;
  date: string;
  startTime: string | null;
  location: string | null;
  status: MeetingStatus;
  agendaCount: number;
  agendaDone: number;
  present: number;
};

export async function listMeetings(user: OrgUser): Promise<MeetingListItem[]> {
  return withUser(user.id, (tx) =>
    tx
      .select({
        id: m.id,
        type: m.type,
        title: m.title,
        date: m.date,
        startTime: m.startTime,
        location: m.location,
        status: m.status,
        agendaCount: sql<number>`(select count(*)::int from public.meeting_agenda a where a.meeting_id = "meetings"."id")`,
        agendaDone: sql<number>`(select count(*)::int from public.meeting_agenda a where a.meeting_id = "meetings"."id" and a.done)`,
        present: sql<number>`(select count(*)::int from public.meeting_attendance t where t.meeting_id = "meetings"."id" and t.status = 'anwesend')`,
      })
      .from(m)
      .where(eq(m.orgId, user.org.id))
      .orderBy(desc(m.date), desc(m.startTime)),
  );
}

export async function getMeeting(user: OrgUser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await withUser(user.id, (tx) =>
    tx
      .select({
        id: m.id,
        type: m.type,
        title: m.title,
        date: m.date,
        startTime: m.startTime,
        location: m.location,
        status: m.status,
        protocolOwner: m.protocolOwner,
        protocolOwnerName: sql<string | null>`(select pn.display_name from public.profiles pn where pn.id = "meetings"."protocol_owner")`,
        notes: m.notes,
        notesText: m.notesText,
        notesVersion: m.notesVersion,
        notesUpdatedAt: m.notesUpdatedAt,
        notesUpdatedByName: sql<string | null>`(select pn.display_name from public.profiles pn where pn.id = "meetings"."notes_updated_by")`,
      })
      .from(m)
      .where(and(eq(m.id, id), eq(m.orgId, user.org.id))),
  );
  return row ?? null;
}

export type Meeting = NonNullable<Awaited<ReturnType<typeof getMeeting>>>;

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  position: number;
  done: boolean;
  title: string | null;
  actionId: string | null;
  actionTitle: string | null;
  actionDate: string | null;
  actionEndDate: string | null;
  actionStartTime: string | null;
  actionEndTime: string | null;
  actionStatus: ActionStatus | null;
  seriesName: string | null;
  seriesColor: SeriesColor | null;
};

export async function meetingAgenda(user: OrgUser, meetingId: string): Promise<AgendaItem[]> {
  const a = schema.actions;
  return withUser(user.id, (tx) =>
    tx
      .select({
        id: schema.meetingAgenda.id,
        kind: schema.meetingAgenda.kind,
        position: schema.meetingAgenda.position,
        done: schema.meetingAgenda.done,
        title: schema.meetingAgenda.title,
        actionId: schema.meetingAgenda.actionId,
        actionTitle: a.title,
        actionDate: a.date,
        actionEndDate: a.endDate,
        actionStartTime: a.startTime,
        actionEndTime: a.endTime,
        actionStatus: a.status,
        seriesName: schema.actionSeries.name,
        seriesColor: schema.actionSeries.color,
      })
      .from(schema.meetingAgenda)
      .leftJoin(a, eq(a.id, schema.meetingAgenda.actionId))
      .leftJoin(schema.actionSeries, eq(schema.actionSeries.id, a.seriesId))
      .where(eq(schema.meetingAgenda.meetingId, meetingId))
      .orderBy(asc(schema.meetingAgenda.position), asc(schema.meetingAgenda.id)),
  ) as Promise<AgendaItem[]>;
}

export async function meetingAttendance(user: OrgUser, meetingId: string) {
  const rows = await withUser(user.id, (tx) =>
    tx
      .select({ userId: schema.meetingAttendance.userId, status: schema.meetingAttendance.status })
      .from(schema.meetingAttendance)
      .where(eq(schema.meetingAttendance.meetingId, meetingId)),
  );
  return new Map(rows.map((r) => [r.userId, r.status]));
}

/** Aktionen, die als Agendapunkt hinzugefügt werden können (kommende, letzte 3 Monate, Ideen) */
export async function agendaCandidates(user: OrgUser, meetingDate: string) {
  const a = schema.actions;
  return withUser(user.id, (tx) =>
    tx
      .select({ id: a.id, title: a.title, date: a.date })
      .from(a)
      .where(and(eq(a.orgId, user.org.id), or(isNull(a.date), gte(a.date, addDays(meetingDate, -90)))))
      .orderBy(sql`${a.date} asc nulls last`, asc(a.title)),
  );
}

/**
 * Agenda-Vorschlag:
 * - Feedback: vergangene Aktionen der letzten 90 Tage (nicht Idee) ohne Feedback
 * - Planung: Monatstreffen → nächste 8 Wochen; Jahresplanung → nächste 12 Monate + Ideen ohne Termin
 */
export async function suggestAgenda(tx: Tx, orgId: string, type: MeetingType, date: string) {
  const a = schema.actions;
  const feedback = await tx
    .select({ id: a.id })
    .from(a)
    .where(
      and(
        eq(a.orgId, orgId),
        ne(a.status, "idee"),
        gte(a.date, addDays(date, -90)),
        lt(sql`coalesce(${a.endDate}, ${a.date})`, date),
        sql`not exists (select 1 from public.feedback f where f.action_id = "actions"."id")`,
      ),
    )
    .orderBy(asc(a.date));
  const horizon = type === "jahresplanung" ? addDays(date, 365) : addDays(date, 56);
  const planning = await tx
    .select({ id: a.id })
    .from(a)
    .where(
      and(
        eq(a.orgId, orgId),
        type === "jahresplanung"
          ? or(and(gte(a.date, date), lte(a.date, horizon)), isNull(a.date))
          : and(gte(sql`coalesce(${a.endDate}, ${a.date})`, date), lte(a.date, horizon)),
      ),
    )
    .orderBy(sql`${a.date} asc nulls last`, asc(a.title));
  return [
    ...feedback.map((r) => ({ actionId: r.id, kind: "feedback" as const })),
    ...planning.map((r) => ({ actionId: r.id, kind: "planung" as const })),
  ];
}
