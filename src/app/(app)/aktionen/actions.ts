"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, withUser } from "@/db";
import { actionStatus, seriesColors } from "@/db/schema";
import { requireOrgAdmin, requireOrgUser } from "@/lib/auth";
import { blocksToText, MAX_NOTES_BYTES, sanitizeBlocks } from "@/lib/notes-text";
import { shiftPlanning } from "@/lib/planning-shift";

export type ActionFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

/** Leere Formularfelder als „nicht gesetzt“ behandeln */
const optional = <T extends z.ZodType>(schemaPart: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schemaPart.optional());

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ungültige Uhrzeit.");

const actionSchema = z
  .object({
    title: z.string().trim().min(2, "Bitte einen Titel angeben (mind. 2 Zeichen).").max(160),
    status: z.enum(actionStatus.enumValues),
    date: optional(isoDate),
    endDate: optional(isoDate),
    startTime: optional(hhmm),
    endTime: optional(hhmm),
    location: optional(z.string().trim().max(200)),
    seriesId: optional(z.string()),
    newSeriesName: optional(z.string().trim().min(2, "Name der Reihe: mind. 2 Zeichen.").max(120)),
  })
  .superRefine((v, ctx) => {
    if (!v.date && v.status !== "idee") {
      ctx.addIssue({ code: "custom", path: ["date"], message: "Ohne Datum ist die Aktion eine Idee – bitte Datum angeben oder Status „Idee“ wählen." });
    }
    if (v.endDate && (!v.date || v.endDate < v.date)) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Das Enddatum muss nach dem Startdatum liegen." });
    }
    if (v.endTime && !v.startTime) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Bitte auch eine Startzeit angeben." });
    }
    if (v.startTime && v.endTime && !v.endDate && v.endTime <= v.startTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Die Endzeit muss nach der Startzeit liegen." });
    }
    if (v.seriesId === "__neu" && !v.newSeriesName) {
      ctx.addIssue({ code: "custom", path: ["newSeriesName"], message: "Bitte einen Namen für die neue Reihe angeben." });
    }
  });

const fields = ["title", "status", "date", "endDate", "startTime", "endTime", "location", "seriesId", "newSeriesName"];

export async function saveAction(_prev: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const user = await requireOrgUser();
  const values = Object.fromEntries(fields.map((k) => [k, String(formData.get(k) ?? "")]));
  const id = String(formData.get("id") ?? "") || null;
  const parsed = actionSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  const v = parsed.data;

  let savedId: string;
  try {
    savedId = await withUser(user.id, async (tx) => {
      let seriesId: string | null = null;
      if (v.seriesId === "__neu" && v.newSeriesName) {
        const [existing] = await tx
          .select({ id: schema.actionSeries.id })
          .from(schema.actionSeries)
          .where(
            and(
              eq(schema.actionSeries.orgId, user.org.id),
              sql`lower(btrim(${schema.actionSeries.name})) = lower(btrim(${v.newSeriesName}))`,
            ),
          );
        seriesId =
          existing?.id ??
          (
            await tx
              .insert(schema.actionSeries)
              .values({ orgId: user.org.id, name: v.newSeriesName })
              .returning({ id: schema.actionSeries.id })
          )[0]!.id;
      } else if (v.seriesId) {
        seriesId = v.seriesId;
      }

      const data = {
        title: v.title,
        status: v.status,
        date: v.date ?? null,
        endDate: v.endDate ?? null,
        startTime: v.startTime ?? null,
        endTime: v.endTime ?? null,
        location: v.location ?? null,
        seriesId,
      };

      if (id) {
        const [before] = await tx
          .select({ date: schema.actions.date })
          .from(schema.actions)
          .where(and(eq(schema.actions.id, id), eq(schema.actions.orgId, user.org.id)));
        if (!before) throw new Error("not-found");
        // Datum verschoben → Zeitplan und Anwesenheitsfenster wandern mit
        if (before.date && data.date && before.date !== data.date) await shiftPlanning(tx, id, before.date, data.date);
        const [row] = await tx
          .update(schema.actions)
          .set(data)
          .where(and(eq(schema.actions.id, id), eq(schema.actions.orgId, user.org.id)))
          .returning({ id: schema.actions.id });
        if (!row) throw new Error("not-found");
        return row.id;
      }
      const [row] = await tx
        .insert(schema.actions)
        .values({ ...data, orgId: user.org.id })
        .returning({ id: schema.actions.id });
      return row!.id;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "not-found") return { error: "Aktion nicht gefunden.", values };
    console.error("[aktionen:save]", e);
    return { error: "Speichern fehlgeschlagen.", values };
  }

  revalidatePath("/aktionen", "layout");
  revalidatePath("/uebersicht");
  redirect(`/aktionen/${savedId}`);
}

export async function deleteAction(formData: FormData) {
  const user = await requireOrgAdmin();
  const id = z.uuid().parse(formData.get("id"));
  await withUser(user.id, (tx) =>
    tx.delete(schema.actions).where(and(eq(schema.actions.id, id), eq(schema.actions.orgId, user.org.id))),
  );
  revalidatePath("/aktionen", "layout");
  revalidatePath("/uebersicht");
  redirect("/aktionen");
}

export type SaveNotesResult =
  | { ok: true; version: number; savedAt: string }
  | { ok: false; reason: "conflict" | "invalid" | "too-large" | "error"; message: string };

/** Autosave des Notiz-Editors mit optimistischer Sperre (Version). */
export async function saveNotes(actionId: string, blocks: unknown, expectedVersion: number): Promise<SaveNotesResult> {
  const user = await requireOrgUser();
  if (!z.uuid().safeParse(actionId).success || !Number.isInteger(expectedVersion)) {
    return { ok: false, reason: "invalid", message: "Ungültige Anfrage." };
  }
  let clean;
  try {
    clean = sanitizeBlocks(blocks);
  } catch {
    return { ok: false, reason: "invalid", message: "Die Notizen konnten nicht gelesen werden." };
  }
  const json = JSON.stringify(clean);
  if (Buffer.byteLength(json) > MAX_NOTES_BYTES) {
    return { ok: false, reason: "too-large", message: "Die Notizen sind zu groß. Bitte Inhalte kürzen oder auslagern." };
  }
  try {
    const [row] = await withUser(user.id, (tx) =>
      tx
        .update(schema.actions)
        .set({
          notes: clean,
          notesText: blocksToText(clean),
          notesVersion: expectedVersion + 1,
          notesUpdatedAt: new Date(),
          notesUpdatedBy: user.id,
        })
        .where(
          and(
            eq(schema.actions.id, actionId),
            eq(schema.actions.orgId, user.org.id),
            eq(schema.actions.notesVersion, expectedVersion),
          ),
        )
        .returning({ version: schema.actions.notesVersion, savedAt: schema.actions.notesUpdatedAt }),
    );
    if (!row) {
      return {
        ok: false,
        reason: "conflict",
        message: "Jemand anderes hat die Notizen inzwischen geändert. Lade die Seite neu, um die aktuelle Fassung zu sehen.",
      };
    }
    return { ok: true, version: row.version, savedAt: row.savedAt!.toISOString() };
  } catch (e) {
    console.error("[aktionen:notes]", e);
    return { ok: false, reason: "error", message: "Speichern fehlgeschlagen. Wir versuchen es gleich noch einmal." };
  }
}

// --- Aktionsreihen ----------------------------------------------------------

export type SeriesFormState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> };

const seriesSchema = z.object({
  name: z.string().trim().min(2, "Mindestens 2 Zeichen.").max(120),
  description: optional(z.string().trim().max(2000)),
  color: z.enum(seriesColors),
});

export async function saveSeries(_prev: SeriesFormState, formData: FormData): Promise<SeriesFormState> {
  const user = await requireOrgUser();
  const values = Object.fromEntries(["name", "description", "color"].map((k) => [k, String(formData.get(k) ?? "")]));
  const id = String(formData.get("id") ?? "") || null;
  const parsed = seriesSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  try {
    await withUser(user.id, async (tx) => {
      const data = { name: parsed.data.name, description: parsed.data.description ?? null, color: parsed.data.color };
      if (id) {
        await tx
          .update(schema.actionSeries)
          .set(data)
          .where(and(eq(schema.actionSeries.id, id), eq(schema.actionSeries.orgId, user.org.id)));
      } else {
        await tx.insert(schema.actionSeries).values({ ...data, orgId: user.org.id });
      }
    });
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return { fieldErrors: { name: "Eine Reihe mit diesem Namen gibt es schon." }, values };
    console.error("[reihen:save]", e);
    return { error: "Speichern fehlgeschlagen.", values };
  }
  revalidatePath("/aktionen", "layout");
  return { ok: id ? "Reihe gespeichert." : `Reihe „${parsed.data.name}“ angelegt.` };
}

export async function setSeriesArchived(formData: FormData) {
  const user = await requireOrgUser();
  const id = z.uuid().parse(formData.get("id"));
  const archived = formData.get("archived") === "true";
  await withUser(user.id, (tx) =>
    tx
      .update(schema.actionSeries)
      .set({ archived })
      .where(and(eq(schema.actionSeries.id, id), eq(schema.actionSeries.orgId, user.org.id))),
  );
  revalidatePath("/aktionen", "layout");
}

export async function deleteSeries(formData: FormData) {
  const user = await requireOrgAdmin();
  const id = z.uuid().parse(formData.get("id"));
  await withUser(user.id, (tx) =>
    tx
      .delete(schema.actionSeries)
      .where(and(eq(schema.actionSeries.id, id), eq(schema.actionSeries.orgId, user.org.id))),
  );
  revalidatePath("/aktionen", "layout");
}
