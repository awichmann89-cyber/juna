"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withUser, type Tx } from "@/db";
import { agendaKind, attendanceStatus, meetingStatus, meetingType } from "@/db/schema";
import { requireOrgAdmin, requireOrgUser, type OrgUser } from "@/lib/auth";
import { deleteLiveRoom } from "@/lib/liveblocks";
import { canRecordOthers, suggestAgenda } from "@/lib/meetings-data";
import { blocksToText, MAX_NOTES_BYTES, sanitizeBlocks } from "@/lib/notes-text";
import type { SaveNotesResult } from "@/app/(app)/aktionen/actions";

export type MeetingFormState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

const uuid = z.uuid();
const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

const typeTitle = { jahresplanung: "Jahresplanung", monatstreffen: "Monatstreffen", sonstiges: "Leiterrundentreffen" } as const;
const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

const meetingSchema = z.object({
  type: z.enum(meetingType.enumValues),
  title: z.string().trim().max(160).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum wählen."),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  location: z.string().trim().max(200).optional(),
  protocolOwner: z.string().max(64).optional(),
  status: z.enum(meetingStatus.enumValues).optional(),
});

async function loadMeeting(tx: Tx, user: OrgUser, meetingId: string) {
  const [row] = await tx
    .select({
      id: schema.meetings.id,
      date: schema.meetings.date,
      type: schema.meetings.type,
      protocolOwner: schema.meetings.protocolOwner,
    })
    .from(schema.meetings)
    .where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.orgId, user.org.id)));
  if (!row) throw new Error("not-found");
  return row;
}

const refresh = (meetingId?: string) => {
  revalidatePath("/leiterrunde", "layout");
  if (meetingId) revalidatePath(`/leiterrunde/${meetingId}`, "layout");
};

function parseMeeting(formData: FormData) {
  const values = Object.fromEntries(
    ["type", "title", "date", "startTime", "location", "protocolOwner", "status"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = meetingSchema.safeParse({
    type: formData.get("type") ?? "monatstreffen",
    title: blank(formData.get("title")),
    date: formData.get("date"),
    startTime: blank(formData.get("startTime")),
    location: blank(formData.get("location")),
    protocolOwner: blank(formData.get("protocolOwner")),
    status: blank(formData.get("status")),
  });
  return { values, parsed };
}

export async function createMeeting(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const user = await requireOrgUser();
  const { values, parsed } = parseMeeting(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  const v = parsed.data;
  const title =
    v.title ||
    (v.type === "jahresplanung"
      ? `Jahresplanung ${Number(v.date.slice(0, 4)) + (Number(v.date.slice(5, 7)) >= 10 ? 1 : 0)}`
      : `${typeTitle[v.type]} ${monthFmt.format(new Date(`${v.date}T00:00:00Z`))}`);
  const withAgenda = formData.get("autoAgenda") === "on";

  const id = await withUser(user.id, async (tx) => {
    const [row] = await tx
      .insert(schema.meetings)
      .values({
        orgId: user.org.id,
        type: v.type,
        title,
        date: v.date,
        startTime: v.startTime ?? null,
        location: v.location ?? null,
        protocolOwner: v.protocolOwner ?? null,
      })
      .returning({ id: schema.meetings.id });
    if (withAgenda) {
      const items = await suggestAgenda(tx, user.org.id, v.type, v.date);
      if (items.length) {
        await tx.insert(schema.meetingAgenda).values(
          items.map((it, i) => ({ orgId: user.org.id, meetingId: row!.id, actionId: it.actionId, kind: it.kind, position: i })),
        );
      }
    }
    return row!.id;
  });
  refresh();
  redirect(`/leiterrunde/${id}`);
}

export async function updateMeeting(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const user = await requireOrgUser();
  const meetingId = uuid.parse(formData.get("meetingId"));
  const { values, parsed } = parseMeeting(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  const v = parsed.data;
  await withUser(user.id, async (tx) => {
    await loadMeeting(tx, user, meetingId);
    await tx
      .update(schema.meetings)
      .set({
        type: v.type,
        title: v.title || typeTitle[v.type],
        date: v.date,
        startTime: v.startTime ?? null,
        location: v.location ?? null,
        protocolOwner: v.protocolOwner ?? null,
        ...(v.status ? { status: v.status } : {}),
      })
      .where(eq(schema.meetings.id, meetingId));
  });
  refresh(meetingId);
  return { ok: "Gespeichert." };
}

export async function setMeetingStatus(formData: FormData) {
  const user = await requireOrgUser();
  const meetingId = uuid.parse(formData.get("meetingId"));
  const status = z.enum(meetingStatus.enumValues).parse(formData.get("status"));
  await withUser(user.id, (tx) =>
    tx
      .update(schema.meetings)
      .set({ status })
      .where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.orgId, user.org.id))),
  );
  refresh(meetingId);
  if (status === "laufend") redirect(`/leiterrunde/${meetingId}/ablauf`);
}

export async function deleteMeeting(formData: FormData) {
  const user = await requireOrgAdmin();
  const meetingId = uuid.parse(formData.get("meetingId"));
  await withUser(user.id, (tx) =>
    tx.delete(schema.meetings).where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.orgId, user.org.id))),
  );
  await deleteLiveRoom(user.org.id, "treffen", meetingId);
  refresh();
  redirect("/leiterrunde");
}

export async function setAttendance(formData: FormData) {
  const user = await requireOrgUser();
  const meetingId = uuid.parse(formData.get("meetingId"));
  const userId = z.string().min(1).max(64).parse(formData.get("userId"));
  const raw = String(formData.get("status") ?? "");
  const status = raw === "" ? null : z.enum(attendanceStatus.enumValues).parse(raw);
  await withUser(user.id, async (tx) => {
    const meeting = await loadMeeting(tx, user, meetingId);
    if (userId !== user.id && !canRecordOthers(user, meeting)) throw new Error("forbidden");
    const where = and(eq(schema.meetingAttendance.meetingId, meetingId), eq(schema.meetingAttendance.userId, userId));
    if (!status) {
      await tx.delete(schema.meetingAttendance).where(where);
      return;
    }
    await tx
      .insert(schema.meetingAttendance)
      .values({ orgId: user.org.id, meetingId, userId, status })
      .onConflictDoUpdate({ target: [schema.meetingAttendance.meetingId, schema.meetingAttendance.userId], set: { status } });
  });
  refresh(meetingId);
}

/** Alle (noch nicht erfassten) Mitglieder auf einmal als anwesend markieren */
export async function markAllPresent(formData: FormData) {
  const user = await requireOrgUser();
  const meetingId = uuid.parse(formData.get("meetingId"));
  await withUser(user.id, async (tx) => {
    const meeting = await loadMeeting(tx, user, meetingId);
    if (!canRecordOthers(user, meeting)) throw new Error("forbidden");
    await tx.execute(sql`
      insert into public.meeting_attendance (org_id, meeting_id, user_id, status)
      select ${user.org.id}, ${meetingId}, p.id, 'anwesend' from public.profiles p
      where p.org_id = ${user.org.id} and p.status = 'active'
      on conflict do nothing`);
  });
  refresh(meetingId);
}

export async function addAgendaItem(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const user = await requireOrgUser();
  const meetingId = uuid.parse(formData.get("meetingId"));
  const actionId = blank(formData.get("actionId"));
  const title = blank(formData.get("title"));
  const kind = z.enum(agendaKind.enumValues).catch("planung").parse(formData.get("kind"));
  if (!actionId && !title) return { error: "Bitte eine Aktion wählen oder einen Titel eingeben." };
  try {
    await withUser(user.id, async (tx) => {
      await loadMeeting(tx, user, meetingId);
      const [{ pos }] = await tx
        .select({ pos: max(schema.meetingAgenda.position) })
        .from(schema.meetingAgenda)
        .where(eq(schema.meetingAgenda.meetingId, meetingId));
      await tx.insert(schema.meetingAgenda).values({
        orgId: user.org.id,
        meetingId,
        actionId: actionId ? uuid.parse(actionId) : null,
        title: actionId ? null : title!.slice(0, 160),
        kind: actionId ? kind : "sonstiges",
        position: (pos ?? -1) + 1,
      });
    });
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return { error: "Diese Aktion steht schon auf der Agenda." };
    throw e;
  }
  refresh(meetingId);
  return { ok: "Zur Agenda hinzugefügt." };
}

export async function agendaItemAction(formData: FormData) {
  const user = await requireOrgUser();
  const meetingId = uuid.parse(formData.get("meetingId"));
  const itemId = uuid.parse(formData.get("itemId"));
  const op = z.enum(["up", "down", "remove", "done", "undone"]).parse(formData.get("op"));
  await withUser(user.id, async (tx) => {
    await loadMeeting(tx, user, meetingId);
    const items = await tx
      .select({ id: schema.meetingAgenda.id })
      .from(schema.meetingAgenda)
      .where(eq(schema.meetingAgenda.meetingId, meetingId))
      .orderBy(asc(schema.meetingAgenda.position), asc(schema.meetingAgenda.id));
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    if (op === "remove") {
      await tx.delete(schema.meetingAgenda).where(eq(schema.meetingAgenda.id, itemId));
      return;
    }
    if (op === "done" || op === "undone") {
      await tx.update(schema.meetingAgenda).set({ done: op === "done" }).where(eq(schema.meetingAgenda.id, itemId));
      return;
    }
    const target = op === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= items.length) return;
    const order = items.map((i) => i.id);
    [order[idx], order[target]] = [order[target]!, order[idx]!];
    // Positionen neu durchnummerieren
    for (let i = 0; i < order.length; i++) {
      await tx.update(schema.meetingAgenda).set({ position: i }).where(eq(schema.meetingAgenda.id, order[i]!));
    }
  });
  refresh(meetingId);
  const next = formData.get("next");
  if (typeof next === "string" && next.startsWith(`/leiterrunde/${meetingId}`)) redirect(next);
}

/** Protokoll-Autosave (gleiches Verfahren wie Aktionsnotizen) */
export async function saveMeetingNotes(meetingId: string, blocks: unknown, expectedVersion: number): Promise<SaveNotesResult> {
  const user = await requireOrgUser();
  const live = expectedVersion === -1;
  if (!uuid.safeParse(meetingId).success || !Number.isInteger(expectedVersion)) {
    return { ok: false, reason: "invalid", message: "Ungültige Anfrage." };
  }
  let clean;
  try {
    clean = sanitizeBlocks(blocks);
  } catch {
    return { ok: false, reason: "invalid", message: "Das Protokoll konnte nicht gelesen werden." };
  }
  if (Buffer.byteLength(JSON.stringify(clean)) > MAX_NOTES_BYTES) {
    return { ok: false, reason: "too-large", message: "Das Protokoll ist zu groß." };
  }
  const [row] = await withUser(user.id, (tx) =>
    tx
      .update(schema.meetings)
      .set({
        notes: clean,
        notesText: blocksToText(clean),
        notesVersion: live ? sql`${schema.meetings.notesVersion} + 1` : expectedVersion + 1,
        notesUpdatedAt: new Date(),
        notesUpdatedBy: user.id,
      })
      .where(
        and(
          eq(schema.meetings.id, meetingId),
          eq(schema.meetings.orgId, user.org.id),
          live ? undefined : eq(schema.meetings.notesVersion, expectedVersion),
        ),
      )
      .returning({ version: schema.meetings.notesVersion, savedAt: schema.meetings.notesUpdatedAt }),
  );
  if (!row) {
    return { ok: false, reason: "conflict", message: "Jemand anderes hat das Protokoll inzwischen geändert. Lade die Seite neu." };
  }
  return { ok: true, version: row.version, savedAt: row.savedAt!.toISOString() };
}
