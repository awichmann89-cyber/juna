import "server-only";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { schema, withUser } from "@/db";
import type { FeedbackKind, ParticipationStatus, TaskStatus } from "@/db/schema";
import type { OrgUser } from "@/lib/auth";
import { taskDueDate } from "@/lib/planning";

/**
 * Anzeigename zu einer User-ID-Spalte. Achtung: Drizzle rendert Spalten bei Einzeltabellen-Abfragen
 * unqualifiziert – die Spaltennamen dürfen daher nicht in public.profiles vorkommen (z. B. updated_by, done_by).
 */
const nameOf = (col: unknown) => sql<string | null>`(select pn.display_name from public.profiles pn where pn.id = ${col})`;

export type Member = { id: string; name: string; status: "invited" | "active" | "deactivated" };

/** Mitglieder der Organisation (ohne Deaktivierte, außer sie sind bereits eingetragen) */
export async function orgMembers(user: OrgUser): Promise<Member[]> {
  return withUser(user.id, (tx) =>
    tx
      .select({ id: schema.profiles.id, name: schema.profiles.displayName, status: schema.profiles.status })
      .from(schema.profiles)
      .where(eq(schema.profiles.orgId, user.org.id))
      .orderBy(asc(sql`lower(${schema.profiles.displayName})`)),
  );
}

export async function getPlanning(user: OrgUser, actionId: string) {
  // Nacheinander: eine Transaktion = eine Verbindung, parallele Queries darauf sind nicht erlaubt
  return withUser(user.id, async (tx) => {
    const slots = await tx
      .select()
      .from(schema.actionSlots)
      .where(eq(schema.actionSlots.actionId, actionId))
      .orderBy(asc(schema.actionSlots.startsAt), asc(schema.actionSlots.endsAt));
    const participants = await tx
      .select({
        userId: schema.actionParticipants.userId,
        status: schema.actionParticipants.status,
        presentFrom: schema.actionParticipants.presentFrom,
        presentUntil: schema.actionParticipants.presentUntil,
        updatedAt: schema.actionParticipants.updatedAt,
        updatedBy: schema.actionParticipants.updatedBy,
        updatedByName: nameOf(schema.actionParticipants.updatedBy),
      })
      .from(schema.actionParticipants)
      .where(eq(schema.actionParticipants.actionId, actionId));
    const overrides = await tx
      .select({ slotId: schema.slotOverrides.slotId, userId: schema.slotOverrides.userId, present: schema.slotOverrides.present })
      .from(schema.slotOverrides)
      .innerJoin(schema.actionSlots, eq(schema.actionSlots.id, schema.slotOverrides.slotId))
      .where(eq(schema.actionSlots.actionId, actionId));
    const planners = await tx
      .select({ userId: schema.actionPlanners.userId })
      .from(schema.actionPlanners)
      .where(eq(schema.actionPlanners.actionId, actionId));
    const history = await tx
      .select({
        id: schema.participationHistory.id,
        userName: nameOf(schema.participationHistory.userId),
        changedByName: nameOf(schema.participationHistory.changedBy),
        userId: schema.participationHistory.userId,
        changedBy: schema.participationHistory.changedBy,
        oldStatus: schema.participationHistory.oldStatus,
        newStatus: schema.participationHistory.newStatus,
        newFrom: schema.participationHistory.newFrom,
        newUntil: schema.participationHistory.newUntil,
        changedAt: schema.participationHistory.changedAt,
      })
      .from(schema.participationHistory)
      .where(eq(schema.participationHistory.actionId, actionId))
      .orderBy(desc(schema.participationHistory.changedAt), desc(schema.participationHistory.id))
      .limit(50);
    return { slots, participants, overrides, planners: planners.map((p) => p.userId), history };
  });
}

export type Planning = Awaited<ReturnType<typeof getPlanning>>;

export type TaskItem = {
  id: string;
  actionId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDaysBefore: number | null;
  dueDate: string | null;
  due: string | null;
  doneAt: Date | null;
  doneByName: string | null;
  assignees: { id: string; name: string }[];
};

async function assigneesFor(tx: Parameters<Parameters<typeof withUser>[1]>[0], taskIds: string[]) {
  if (taskIds.length === 0) return new Map<string, { id: string; name: string }[]>();
  const rows = await tx
    .select({ taskId: schema.taskAssignees.taskId, id: schema.profiles.id, name: schema.profiles.displayName })
    .from(schema.taskAssignees)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.taskAssignees.userId))
    .where(inArray(schema.taskAssignees.taskId, taskIds))
    .orderBy(asc(schema.profiles.displayName));
  const map = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) map.set(r.taskId, [...(map.get(r.taskId) ?? []), { id: r.id, name: r.name }]);
  return map;
}

export async function actionTasks(user: OrgUser, actionId: string, actionDate: string | null): Promise<TaskItem[]> {
  return withUser(user.id, async (tx) => {
    const rows = await tx
      .select({
        id: schema.tasks.id,
        actionId: schema.tasks.actionId,
        title: schema.tasks.title,
        description: schema.tasks.description,
        status: schema.tasks.status,
        dueDaysBefore: schema.tasks.dueDaysBefore,
        dueDate: schema.tasks.dueDate,
        doneAt: schema.tasks.doneAt,
        doneByName: nameOf(schema.tasks.doneBy),
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.actionId, actionId))
      .orderBy(asc(schema.tasks.createdAt));
    const assignees = await assigneesFor(tx, rows.map((r) => r.id));
    return rows
      .map((r) => ({ ...r, due: taskDueDate(r, actionDate), assignees: assignees.get(r.id) ?? [] }))
      .sort((a, b) => (a.status === b.status ? (a.due ?? "9999").localeCompare(b.due ?? "9999") : a.status === "offen" ? -1 : 1));
  });
}

export type MyTask = TaskItem & { actionTitle: string; actionDate: string | null };

/** Alle Aufgaben, die mir zugewiesen sind (über alle Aktionen) */
export async function myTasks(user: OrgUser, opts: { includeDone?: boolean } = {}): Promise<MyTask[]> {
  return withUser(user.id, async (tx) => {
    const rows = await tx
      .select({
        id: schema.tasks.id,
        actionId: schema.tasks.actionId,
        title: schema.tasks.title,
        description: schema.tasks.description,
        status: schema.tasks.status,
        dueDaysBefore: schema.tasks.dueDaysBefore,
        dueDate: schema.tasks.dueDate,
        doneAt: schema.tasks.doneAt,
        doneByName: nameOf(schema.tasks.doneBy),
        actionTitle: schema.actions.title,
        actionDate: schema.actions.date,
      })
      .from(schema.taskAssignees)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.taskAssignees.taskId))
      .innerJoin(schema.actions, eq(schema.actions.id, schema.tasks.actionId))
      .where(
        and(
          eq(schema.taskAssignees.userId, user.id),
          opts.includeDone ? undefined : eq(schema.tasks.status, "offen"),
        ),
      );
    const assignees = await assigneesFor(tx, rows.map((r) => r.id));
    return rows
      .map((r) => ({ ...r, due: taskDueDate(r, r.actionDate), assignees: assignees.get(r.id) ?? [] }))
      .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title));
  });
}

export type FeedbackItem = {
  id: string;
  kind: FeedbackKind;
  text: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
};

export async function actionFeedback(user: OrgUser, actionId: string): Promise<FeedbackItem[]> {
  return withUser(user.id, (tx) =>
    tx
      .select({
        id: schema.feedback.id,
        kind: schema.feedback.kind,
        text: schema.feedback.text,
        authorId: schema.feedback.authorId,
        authorName: nameOf(schema.feedback.authorId),
        createdAt: schema.feedback.createdAt,
      })
      .from(schema.feedback)
      .where(eq(schema.feedback.actionId, actionId))
      .orderBy(asc(schema.feedback.createdAt)),
  );
}

export type LastTimeItem = {
  id: string;
  text: string;
  sourceActionId: string;
  sourceTitle: string;
  sourceDate: string | null;
  resolution: "aufgabe" | "beruecksichtigt" | null;
};

/**
 * „Aus dem letzten Mal“: „fürs nächste Mal“-Punkte aus früheren Durchführungen der Reihe
 * (vor dieser Aktion), inkl. ob sie hier schon behandelt wurden.
 */
export async function lastTimeItems(
  user: OrgUser,
  action: { id: string; seriesId: string | null; date: string | null },
): Promise<LastTimeItem[]> {
  if (!action.seriesId) return [];
  return withUser(user.id, async (tx) => {
    const a = schema.actions;
    const rows = await tx
      .select({
        id: schema.feedback.id,
        text: schema.feedback.text,
        sourceActionId: a.id,
        sourceTitle: a.title,
        sourceDate: a.date,
        resolution: sql<"aufgabe" | "beruecksichtigt" | null>`(
          select f.resolution from public.feedback_followups f
          where f.feedback_id = ${schema.feedback.id} and f.action_id = ${action.id})`,
        // Bereits in einer anderen (späteren) Durchführung erledigt?
        resolvedElsewhere: sql<boolean>`exists (
          select 1 from public.feedback_followups f
          where f.feedback_id = ${schema.feedback.id} and f.action_id <> ${action.id})`,
      })
      .from(schema.feedback)
      .innerJoin(a, eq(a.id, schema.feedback.actionId))
      .where(
        and(
          eq(a.seriesId, action.seriesId!),
          ne(a.id, action.id),
          eq(schema.feedback.kind, "naechstes_mal"),
          action.date ? lt(a.date, action.date) : undefined,
        ),
      )
      .orderBy(sql`${a.date} desc nulls last`, asc(schema.feedback.createdAt));
    return rows.filter((r) => !r.resolvedElsewhere || r.resolution).map(({ resolvedElsewhere: _r, ...rest }) => {
      void _r;
      return rest;
    });
  });
}

/** Mögliche Quellen für „Von früherer Durchführung übernehmen“ */
export async function copySources(user: OrgUser, action: { id: string; seriesId: string | null }) {
  if (!action.seriesId) return [];
  return withUser(user.id, async (tx) => {
    const a = schema.actions;
    return tx
      .select({
        id: a.id,
        title: a.title,
        date: a.date,
        status: a.status,
        // Explizit qualifiziert: Drizzle rendert Spalten bei Einzeltabellen-Abfragen unqualifiziert
        slots: sql<number>`(select count(*)::int from public.action_slots s where s.action_id = "actions"."id")`,
        tasks: sql<number>`(select count(*)::int from public.tasks t where t.action_id = "actions"."id")`,
        planners: sql<number>`(select count(*)::int from public.action_planners p where p.action_id = "actions"."id")`,
        hasNotes: sql<boolean>`${a.notesText} <> ''`,
      })
      .from(a)
      .where(and(eq(a.seriesId, action.seriesId!), ne(a.id, action.id)))
      .orderBy(sql`${a.date} desc nulls last`);
  });
}

/** Zähler für die Tab-Leiste */
export async function planningCounts(user: OrgUser, actionId: string) {
  return withUser(user.id, async (tx) => {
    const [row] = await tx.execute<{ slots: number; dabei: number; tasks_open: number; feedback: number }>(sql`
      select
        (select count(*)::int from public.action_slots where action_id = ${actionId}) as slots,
        (select count(*)::int from public.action_participants where action_id = ${actionId} and status = 'dabei') as dabei,
        (select count(*)::int from public.tasks where action_id = ${actionId} and status = 'offen') as tasks_open,
        (select count(*)::int from public.feedback where action_id = ${actionId}) as feedback
    `).then((r) => r.rows);
    return row!;
  });
}

export type { ParticipationStatus };
