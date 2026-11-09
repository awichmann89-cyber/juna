"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withUser, type Tx } from "@/db";
import { feedbackKind, participationStatus } from "@/db/schema";
import { requireOrgUser, type OrgUser } from "@/lib/auth";
import { daysBetween, localTs, shiftTs } from "@/lib/planning";

export type PlanFormState = {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** ID der gespeicherten Aufgabe (für Aufgaben-Blöcke in der Planung) */
  taskId?: string;
};

const uuid = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

/** Lädt die Aktion (nur eigene Organisation) – Grundlage für alle Planungsaktionen */
async function loadAction(tx: Tx, user: OrgUser, actionId: string) {
  const [a] = await tx
    .select({ id: schema.actions.id, date: schema.actions.date, endDate: schema.actions.endDate, seriesId: schema.actions.seriesId })
    .from(schema.actions)
    .where(and(eq(schema.actions.id, actionId), eq(schema.actions.orgId, user.org.id)));
  if (!a) throw new Error("not-found");
  return a;
}

async function memberIds(tx: Tx, user: OrgUser, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(and(eq(schema.profiles.orgId, user.org.id), inArray(schema.profiles.id, ids)));
  return rows.map((r) => r.id);
}

const refresh = (actionId: string) => {
  revalidatePath(`/aktionen/${actionId}`);
  revalidatePath("/aufgaben");
  revalidatePath("/uebersicht");
  revalidatePath("/leiterrunde", "layout");
};

// --- Zeitplan ------------------------------------------------------------------

const slotSchema = z.object({
  actionId: uuid,
  slotId: uuid.optional(),
  title: z.string().trim().min(1, "Bitte einen Titel angeben.").max(120),
  day: isoDate,
  start: hhmm,
  end: hhmm,
  minPeople: z.coerce.number().int().min(1, "Mindestens 1.").max(500).optional(),
  description: z.string().trim().max(1000).optional(),
});

export async function saveSlot(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireOrgUser();
  const values = Object.fromEntries(
    ["title", "day", "start", "end", "minPeople", "description"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = slotSchema.safeParse({
    actionId: formData.get("actionId"),
    slotId: blank(formData.get("slotId")),
    title: formData.get("title"),
    day: formData.get("day"),
    start: formData.get("start"),
    end: formData.get("end"),
    minPeople: blank(formData.get("minPeople")),
    description: blank(formData.get("description")),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const v = parsed.data;
  const startsAt = localTs(v.day, v.start);
  // Endzeit vor Beginn → über Mitternacht (nächster Tag)
  let endsAt = localTs(v.day, v.end);
  if (endsAt <= startsAt) endsAt = shiftTs(endsAt, 1);

  try {
    await withUser(user.id, async (tx) => {
      await loadAction(tx, user, v.actionId);
      const data = { title: v.title, startsAt, endsAt, minPeople: v.minPeople ?? null, description: v.description ?? null };
      if (v.slotId) {
        await tx
          .update(schema.actionSlots)
          .set(data)
          .where(and(eq(schema.actionSlots.id, v.slotId), eq(schema.actionSlots.actionId, v.actionId)));
      } else {
        await tx.insert(schema.actionSlots).values({ ...data, orgId: user.org.id, actionId: v.actionId });
      }
    });
  } catch (e) {
    console.error("[zeitplan]", e);
    return { error: "Speichern fehlgeschlagen.", values };
  }
  refresh(v.actionId);
  return { ok: v.slotId ? "Gespeichert." : `„${v.title}“ hinzugefügt.` };
}

export async function deleteSlot(formData: FormData) {
  const user = await requireOrgUser();
  const actionId = uuid.parse(formData.get("actionId"));
  const slotId = uuid.parse(formData.get("slotId"));
  await withUser(user.id, (tx) =>
    tx.delete(schema.actionSlots).where(and(eq(schema.actionSlots.id, slotId), eq(schema.actionSlots.actionId, actionId))),
  );
  refresh(actionId);
}

// --- Teilnahme -------------------------------------------------------------------

/** Status setzen (auch für andere – z. B. Protokollführer im Treffen). Leerer Status entfernt den Eintrag. */
export async function setParticipation(formData: FormData) {
  const user = await requireOrgUser();
  const actionId = uuid.parse(formData.get("actionId"));
  const userId = z.string().min(1).max(64).parse(formData.get("userId"));
  const statusRaw = String(formData.get("status") ?? "");
  const status = statusRaw === "" ? null : z.enum(participationStatus.enumValues).parse(statusRaw);

  await withUser(user.id, async (tx) => {
    await loadAction(tx, user, actionId);
    if (!(await memberIds(tx, user, [userId])).length) throw new Error("not-found");
    if (!status) {
      await tx
        .delete(schema.actionParticipants)
        .where(and(eq(schema.actionParticipants.actionId, actionId), eq(schema.actionParticipants.userId, userId)));
      return;
    }
    await tx
      .insert(schema.actionParticipants)
      .values({ orgId: user.org.id, actionId, userId, status })
      .onConflictDoUpdate({
        target: [schema.actionParticipants.actionId, schema.actionParticipants.userId],
        set: { status },
      });
  });
  refresh(actionId);
}

const windowSchema = z.object({
  actionId: uuid,
  userId: z.string().min(1).max(64),
  fromDay: isoDate.optional(),
  fromTime: hhmm.optional(),
  untilDay: isoDate.optional(),
  untilTime: hhmm.optional(),
});

/** Anwesenheitsfenster („komme ab“, „gehe um“) – leer = ganze Aktion */
export async function setPresenceWindow(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireOrgUser();
  const parsed = windowSchema.safeParse({
    actionId: formData.get("actionId"),
    userId: formData.get("userId"),
    fromDay: blank(formData.get("fromDay")),
    fromTime: blank(formData.get("fromTime")),
    untilDay: blank(formData.get("untilDay")),
    untilTime: blank(formData.get("untilTime")),
  });
  if (!parsed.success) return { error: "Bitte gültige Uhrzeiten angeben." };
  const v = parsed.data;

  let res: PlanFormState = {};
  await withUser(user.id, async (tx) => {
    const action = await loadAction(tx, user, v.actionId);
    if (!action.date) {
      res = { error: "Die Aktion hat noch kein Datum." };
      return;
    }
    const presentFrom = v.fromTime ? localTs(v.fromDay ?? action.date, v.fromTime) : null;
    const presentUntil = v.untilTime ? localTs(v.untilDay ?? action.date, v.untilTime) : null;
    if (presentFrom && presentUntil && presentUntil <= presentFrom) {
      res = { error: "„Geht um“ muss nach „kommt ab“ liegen." };
      return;
    }
    const [row] = await tx
      .update(schema.actionParticipants)
      .set({ presentFrom, presentUntil })
      .where(and(eq(schema.actionParticipants.actionId, v.actionId), eq(schema.actionParticipants.userId, v.userId)))
      .returning({ userId: schema.actionParticipants.userId });
    if (!row) {
      // Wer ein Fenster angibt, ist (zumindest teilweise) dabei
      if (!(await memberIds(tx, user, [v.userId])).length) throw new Error("not-found");
      await tx
        .insert(schema.actionParticipants)
        .values({ orgId: user.org.id, actionId: v.actionId, userId: v.userId, status: "dabei", presentFrom, presentUntil });
    }
    res = { ok: "Gespeichert." };
  });
  if (res.ok) refresh(v.actionId);
  return res;
}

/** Slot abweichend von der Ableitung: present = "true" | "false" | "" (Override entfernen) */
export async function setSlotOverride(formData: FormData) {
  const user = await requireOrgUser();
  const actionId = uuid.parse(formData.get("actionId"));
  const slotId = uuid.parse(formData.get("slotId"));
  const userId = z.string().min(1).max(64).parse(formData.get("userId"));
  const present = String(formData.get("present") ?? "");
  await withUser(user.id, async (tx) => {
    await loadAction(tx, user, actionId);
    const where = and(eq(schema.slotOverrides.slotId, slotId), eq(schema.slotOverrides.userId, userId));
    if (present === "") {
      await tx.delete(schema.slotOverrides).where(where);
      return;
    }
    await tx
      .insert(schema.slotOverrides)
      .values({ orgId: user.org.id, slotId, userId, present: present === "true" })
      .onConflictDoUpdate({ target: [schema.slotOverrides.slotId, schema.slotOverrides.userId], set: { present: present === "true" } });
  });
  refresh(actionId);
}

// --- Planungsteam --------------------------------------------------------------------

export async function setPlanners(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireOrgUser();
  const actionId = uuid.parse(formData.get("actionId"));
  const requested = formData.getAll("planner").map(String).slice(0, 50);
  await withUser(user.id, async (tx) => {
    await loadAction(tx, user, actionId);
    const valid = await memberIds(tx, user, requested);
    await tx.delete(schema.actionPlanners).where(eq(schema.actionPlanners.actionId, actionId));
    if (valid.length) {
      await tx.insert(schema.actionPlanners).values(valid.map((userId) => ({ orgId: user.org.id, actionId, userId })));
    }
  });
  refresh(actionId);
  return { ok: "Planungsteam gespeichert." };
}

// --- Aufgaben --------------------------------------------------------------------------

const taskSchema = z
  .object({
    actionId: uuid,
    taskId: uuid.optional(),
    title: z.string().trim().min(2, "Bitte einen Titel angeben (mind. 2 Zeichen).").max(200),
    description: z.string().trim().max(2000).optional(),
    dueMode: z.enum(["relativ", "datum", "ohne"]),
    dueDaysBefore: z.coerce.number().int().min(0, "0 oder mehr Tage.").max(365).optional(),
    dueDate: isoDate.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.dueMode === "relativ" && v.dueDaysBefore === undefined) {
      ctx.addIssue({ code: "custom", path: ["dueDaysBefore"], message: "Wie viele Tage vor der Aktion?" });
    }
    if (v.dueMode === "datum" && !v.dueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Bitte ein Datum wählen." });
    }
  });

type Block = { type?: unknown; props?: Record<string, unknown>; children?: unknown[] } & Record<string, unknown>;

function hasTaskBlocks(blocks: unknown): boolean {
  return Array.isArray(blocks) && blocks.some((b: Block) => b?.type === "task" || hasTaskBlocks(b?.children));
}

/**
 * Aufgaben-Blöcke auf die neu angelegten Aufgaben umbiegen.
 * Ohne übernommene Aufgabe wird daraus ein normaler Checklisten-Punkt mit dem alten Titel.
 */
function remapTaskBlocks(blocks: unknown[], map: Map<string, string>, titles: Map<string, string>): unknown[] {
  return blocks.map((raw) => {
    const b = raw as Block;
    const children = Array.isArray(b.children) ? remapTaskBlocks(b.children, map, titles) : [];
    if (b.type !== "task") return { ...b, children };
    const oldId = String(b.props?.taskId ?? "");
    const newId = map.get(oldId);
    if (newId) return { ...b, props: { ...b.props, taskId: newId }, children };
    const title = titles.get(oldId);
    if (!title) return null;
    return { type: "checkListItem", props: { checked: false }, content: [{ type: "text", text: title, styles: {} }], children };
  }).filter(Boolean);
}

export async function saveTask(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireOrgUser();
  const values = Object.fromEntries(
    ["title", "description", "dueMode", "dueDaysBefore", "dueDate"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const assignees = formData.getAll("assignee").map(String).slice(0, 30);
  values.assignees = assignees.join(",");
  const parsed = taskSchema.safeParse({
    actionId: formData.get("actionId"),
    taskId: blank(formData.get("taskId")),
    title: formData.get("title"),
    description: blank(formData.get("description")),
    dueMode: formData.get("dueMode") ?? "ohne",
    dueDaysBefore: blank(formData.get("dueDaysBefore")),
    dueDate: blank(formData.get("dueDate")),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const v = parsed.data;

  let res: PlanFormState = {};
  try {
    await withUser(user.id, async (tx) => {
      const action = await loadAction(tx, user, v.actionId);
      if (v.dueMode === "relativ" && !action.date) {
        res = { fieldErrors: { dueDaysBefore: "Die Aktion hat noch kein Datum – bitte ein festes Datum wählen." }, values };
        return;
      }
      const data = {
        title: v.title,
        description: v.description ?? null,
        dueDaysBefore: v.dueMode === "relativ" ? v.dueDaysBefore! : null,
        dueDate: v.dueMode === "datum" ? v.dueDate! : null,
      };
      let taskId = v.taskId;
      if (taskId) {
        const [row] = await tx
          .update(schema.tasks)
          .set(data)
          .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.actionId, v.actionId)))
          .returning({ id: schema.tasks.id });
        if (!row) throw new Error("not-found");
        await tx.delete(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, taskId));
      } else {
        const [row] = await tx
          .insert(schema.tasks)
          .values({ ...data, orgId: user.org.id, actionId: v.actionId })
          .returning({ id: schema.tasks.id });
        taskId = row!.id;
      }
      const valid = await memberIds(tx, user, assignees);
      if (valid.length) {
        await tx.insert(schema.taskAssignees).values(valid.map((userId) => ({ orgId: user.org.id, taskId: taskId!, userId })));
      }
      res = { ok: v.taskId ? "Aufgabe gespeichert." : `Aufgabe „${v.title}“ angelegt.`, taskId };
    });
  } catch (e) {
    console.error("[aufgaben]", e);
    return { error: "Speichern fehlgeschlagen.", values };
  }
  if (res.ok) refresh(v.actionId);
  return res;
}

export async function toggleTask(formData: FormData) {
  const user = await requireOrgUser();
  const taskId = uuid.parse(formData.get("taskId"));
  const done = formData.get("done") === "true";
  let actionId: string | undefined;
  await withUser(user.id, async (tx) => {
    const [row] = await tx
      .update(schema.tasks)
      .set(done ? { status: "erledigt", doneAt: new Date(), doneBy: user.id } : { status: "offen", doneAt: null, doneBy: null })
      .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.orgId, user.org.id)))
      .returning({ actionId: schema.tasks.actionId });
    actionId = row?.actionId;
  });
  if (actionId) refresh(actionId);
}

export async function deleteTask(formData: FormData) {
  const user = await requireOrgUser();
  const taskId = uuid.parse(formData.get("taskId"));
  const actionId = uuid.parse(formData.get("actionId"));
  await withUser(user.id, (tx) =>
    tx.delete(schema.tasks).where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.actionId, actionId))),
  );
  refresh(actionId);
}

// --- Feedback --------------------------------------------------------------------------

export async function addFeedback(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireOrgUser();
  const values = { kind: String(formData.get("kind") ?? ""), text: String(formData.get("text") ?? "") };
  const parsed = z
    .object({
      actionId: uuid,
      kind: z.enum(feedbackKind.enumValues),
      text: z.string().trim().min(2, "Bitte etwas mehr schreiben.").max(2000),
    })
    .safeParse({ actionId: formData.get("actionId"), kind: formData.get("kind"), text: formData.get("text") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  await withUser(user.id, async (tx) => {
    await loadAction(tx, user, parsed.data.actionId);
    await tx.insert(schema.feedback).values({
      orgId: user.org.id,
      actionId: parsed.data.actionId,
      kind: parsed.data.kind,
      text: parsed.data.text,
    });
  });
  refresh(parsed.data.actionId);
  return { ok: "Danke für dein Feedback!", values: { kind: parsed.data.kind, text: "" } };
}

export async function deleteFeedback(formData: FormData) {
  const user = await requireOrgUser();
  const id = uuid.parse(formData.get("feedbackId"));
  const actionId = uuid.parse(formData.get("actionId"));
  // RLS: nur Autor*in oder Admin
  await withUser(user.id, (tx) =>
    tx.delete(schema.feedback).where(and(eq(schema.feedback.id, id), eq(schema.feedback.actionId, actionId))),
  );
  refresh(actionId);
}

/** „Aus dem letzten Mal“: Punkt als Aufgabe übernehmen oder als berücksichtigt abhaken (bzw. zurücknehmen) */
export async function resolveFollowup(formData: FormData) {
  const user = await requireOrgUser();
  const feedbackId = uuid.parse(formData.get("feedbackId"));
  const actionId = uuid.parse(formData.get("actionId"));
  const resolution = z.enum(["aufgabe", "beruecksichtigt", "zuruecksetzen"]).parse(formData.get("resolution"));

  await withUser(user.id, async (tx) => {
    const action = await loadAction(tx, user, actionId);
    const [fb] = await tx
      .select({ text: schema.feedback.text })
      .from(schema.feedback)
      .where(and(eq(schema.feedback.id, feedbackId), eq(schema.feedback.orgId, user.org.id)));
    if (!fb) throw new Error("not-found");
    const where = and(eq(schema.feedbackFollowups.feedbackId, feedbackId), eq(schema.feedbackFollowups.actionId, actionId));
    if (resolution === "zuruecksetzen") {
      await tx.delete(schema.feedbackFollowups).where(where);
      return;
    }
    let taskId: string | null = null;
    if (resolution === "aufgabe") {
      const title = fb.text.length > 190 ? `${fb.text.slice(0, 187)}…` : fb.text;
      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: user.org.id,
          actionId,
          title: title.length >= 2 ? title : "Punkt vom letzten Mal",
          description: fb.text.length > 190 ? fb.text : null,
          dueDaysBefore: action.date ? 7 : null,
        })
        .returning({ id: schema.tasks.id });
      taskId = task!.id;
    }
    await tx
      .insert(schema.feedbackFollowups)
      .values({ orgId: user.org.id, feedbackId, actionId, resolution, taskId })
      .onConflictDoUpdate({
        target: [schema.feedbackFollowups.feedbackId, schema.feedbackFollowups.actionId],
        set: { resolution, taskId },
      });
  });
  refresh(actionId);
}

// --- Von früherer Durchführung übernehmen ------------------------------------------------

const copyParts = ["zeitplan", "aufgaben", "planungsteam", "notizen"] as const;

export async function copyFromPrevious(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const user = await requireOrgUser();
  const targetId = uuid.parse(formData.get("actionId"));
  const sourceId = uuid.safeParse(formData.get("sourceId"));
  const parts = formData.getAll("part").map(String).filter((p): p is (typeof copyParts)[number] => copyParts.includes(p as never));
  if (!sourceId.success) return { error: "Bitte eine frühere Durchführung wählen." };
  if (parts.length === 0) return { error: "Bitte mindestens einen Bereich auswählen." };

  const copied: string[] = [];
  await withUser(user.id, async (tx) => {
    const target = await loadAction(tx, user, targetId);
    const [source] = await tx
      .select({ id: schema.actions.id, date: schema.actions.date, seriesId: schema.actions.seriesId, notes: schema.actions.notes, notesText: schema.actions.notesText })
      .from(schema.actions)
      .where(and(eq(schema.actions.id, sourceId.data), eq(schema.actions.orgId, user.org.id)));
    if (!source) throw new Error("not-found");
    const shift = source.date && target.date ? daysBetween(source.date, target.date) : null;

    if (parts.includes("zeitplan")) {
      const slots = await tx.select().from(schema.actionSlots).where(eq(schema.actionSlots.actionId, source.id));
      if (slots.length && shift === null) throw new Error("no-date");
      if (slots.length) {
        await tx.insert(schema.actionSlots).values(
          slots.map((s) => ({
            orgId: user.org.id,
            actionId: target.id,
            title: s.title,
            description: s.description,
            minPeople: s.minPeople,
            startsAt: shiftTs(s.startsAt, shift!),
            endsAt: shiftTs(s.endsAt, shift!),
          })),
        );
        copied.push(`${slots.length} Zeitslot${slots.length === 1 ? "" : "s"}`);
      }
    }
    // Aufgaben-Blöcke in den kopierten Notizen: alte → neue Aufgaben-ID
    const sourceTasks = await tx
      .select({ id: schema.tasks.id, title: schema.tasks.title })
      .from(schema.tasks)
      .where(eq(schema.tasks.actionId, source.id));
    const taskIdMap = new Map<string, string>();
    if (parts.includes("aufgaben")) {
      const tasks = await tx.select().from(schema.tasks).where(eq(schema.tasks.actionId, source.id));
      if (tasks.length) {
        const rows = tasks.map((t) => {
            // Absolute Deadlines werden relativ übernommen („so viele Tage vorher wie letztes Mal“)
            let dueDaysBefore = t.dueDaysBefore;
            let dueDate: string | null = null;
            if (t.dueDate) {
              if (source.date && target.date) dueDaysBefore = Math.max(0, daysBetween(t.dueDate, source.date));
              else dueDate = t.dueDate;
            }
            if (dueDaysBefore != null && !target.date) dueDaysBefore = null;
            return { sourceId: t.id, orgId: user.org.id, actionId: target.id, title: t.title, description: t.description, dueDaysBefore, dueDate };
          });
        // Einzeln einfügen, damit die Zuordnung alt → neu eindeutig ist
        for (const { sourceId, ...row } of rows) {
          const [created] = await tx.insert(schema.tasks).values(row).returning({ id: schema.tasks.id });
          taskIdMap.set(sourceId, created!.id);
        }
        copied.push(`${tasks.length} Aufgabe${tasks.length === 1 ? "" : "n"} (offen, ohne Zuständige)`);
      }
    }
    if (parts.includes("planungsteam")) {
      const planners = await tx
        .select({ userId: schema.actionPlanners.userId })
        .from(schema.actionPlanners)
        .innerJoin(schema.profiles, eq(schema.profiles.id, schema.actionPlanners.userId))
        .where(and(eq(schema.actionPlanners.actionId, source.id), sql`${schema.profiles.status} <> 'deactivated'`));
      if (planners.length) {
        await tx
          .insert(schema.actionPlanners)
          .values(planners.map((p) => ({ orgId: user.org.id, actionId: target.id, userId: p.userId })))
          .onConflictDoNothing();
        copied.push("Planungsteam");
      }
    }
    if (parts.includes("notizen") && Array.isArray(source.notes) && source.notes.length > 0) {
      const [t] = await tx
        .select({ notes: schema.actions.notes, notesText: schema.actions.notesText, notesVersion: schema.actions.notesVersion })
        .from(schema.actions)
        .where(eq(schema.actions.id, target.id));
      if (t && t.notesText.trim() === "" && !hasTaskBlocks(t.notes)) {
        const titles = new Map(sourceTasks.map((x) => [x.id, x.title]));
        await tx
          .update(schema.actions)
          .set({
            notes: remapTaskBlocks(source.notes, taskIdMap, titles),
            notesText: source.notesText,
            notesVersion: t.notesVersion + 1,
            notesUpdatedAt: new Date(),
            notesUpdatedBy: user.id,
          })
          .where(eq(schema.actions.id, target.id));
        copied.push("Planung");
      }
    }
  }).catch((e) => {
    if (e instanceof Error && e.message === "no-date") {
      copied.length = 0;
      copied.push("__no-date");
      return;
    }
    throw e;
  });

  if (copied[0] === "__no-date") return { error: "Für den Zeitplan brauchen beide Aktionen ein Datum." };
  refresh(targetId);
  return { ok: copied.length ? `Übernommen: ${copied.join(", ")}.` : "Nichts zu übernehmen – die Quelle enthält in diesen Bereichen keine Daten." };
}
