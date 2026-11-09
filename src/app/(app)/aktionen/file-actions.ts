"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, withUser } from "@/db";
import { requireOrgUser, type OrgUser } from "@/lib/auth";
import { ALLOWED_CONTENT_TYPES, MAX_FILE_BYTES, safeFilename } from "@/lib/files";
import { keyBelongsTo, storageKeyFor } from "@/lib/files-data";
import { deleteFiles, headFile, putFile, storageMode } from "@/lib/storage";

export type FileFormState = { ok?: string; error?: string };

const uuid = z.uuid();
const groupSchema = z.string().trim().max(60).optional();

async function assertAction(user: OrgUser, actionId: string) {
  const [a] = await withUser(user.id, (tx) =>
    tx
      .select({ id: schema.actions.id })
      .from(schema.actions)
      .where(and(eq(schema.actions.id, actionId), eq(schema.actions.orgId, user.org.id))),
  );
  if (!a) throw new Error("Aktion nicht gefunden.");
}

async function insertFileRow(
  user: OrgUser,
  data: { actionId: string; key: string; filename: string; contentType: string; size: number; groupLabel?: string },
) {
  await withUser(user.id, (tx) =>
    tx.insert(schema.actionFiles).values({
      orgId: user.org.id,
      actionId: data.actionId,
      storageKey: data.key,
      filename: data.filename.slice(0, 255),
      contentType: data.contentType,
      sizeBytes: data.size,
      groupLabel: data.groupLabel || null,
    }),
  );
}

function checkFile(contentType: string, size: number) {
  if (!(ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return "Dieser Dateityp wird nicht unterstützt (erlaubt: PDF, Bilder, Office-Dokumente, Text, ZIP).";
  }
  if (size <= 0) return "Die Datei ist leer.";
  if (size > MAX_FILE_BYTES) return "Die Datei ist größer als 50 MB.";
  return null;
}

/** Upload über den Server (lokale Entwicklung bzw. ohne Client-Upload; auf Vercel max. ~4 MB) */
export async function uploadFileServer(_prev: FileFormState, formData: FormData): Promise<FileFormState> {
  const user = await requireOrgUser();
  const actionId = uuid.safeParse(formData.get("actionId"));
  const group = groupSchema.safeParse(formData.get("groupLabel") ?? undefined);
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!actionId.success || !group.success) return { error: "Ungültige Anfrage." };
  if (files.length === 0) return { error: "Bitte eine Datei auswählen." };
  if (storageMode() === "none") return { error: "Der Dateispeicher ist noch nicht eingerichtet." };
  await assertAction(user, actionId.data);

  const done: string[] = [];
  for (const file of files.slice(0, 10)) {
    const problem = checkFile(file.type, file.size);
    if (problem) return { error: `${file.name}: ${problem}`, ok: done.length ? `Hochgeladen: ${done.join(", ")}` : undefined };
    const key = storageKeyFor(user.org.id, actionId.data, safeFilename(file.name));
    await putFile(key, Buffer.from(await file.arrayBuffer()), file.type);
    try {
      await insertFileRow(user, { actionId: actionId.data, key, filename: file.name, contentType: file.type, size: file.size, groupLabel: group.data });
    } catch (e) {
      await deleteFiles([key]);
      throw e;
    }
    done.push(file.name);
  }
  revalidatePath(`/aktionen/${actionId.data}`);
  return { ok: `Hochgeladen: ${done.join(", ")}` };
}

/** Nach einem Client-Upload direkt in den Blob-Store: Datei prüfen und registrieren */
export async function registerUploadedFile(input: { actionId: string; key: string; filename: string; groupLabel?: string }): Promise<FileFormState> {
  const user = await requireOrgUser();
  const actionId = uuid.safeParse(input.actionId);
  const group = groupSchema.safeParse(input.groupLabel || undefined);
  if (!actionId.success || !group.success || typeof input.key !== "string" || typeof input.filename !== "string") {
    return { error: "Ungültige Anfrage." };
  }
  if (!keyBelongsTo(input.key, user.org.id, actionId.data)) return { error: "Ungültiger Speicherpfad." };
  await assertAction(user, actionId.data);
  const meta = await headFile(input.key);
  if (!meta) return { error: "Die hochgeladene Datei wurde nicht gefunden." };
  const problem = checkFile(meta.contentType, meta.size);
  if (problem) {
    await deleteFiles([input.key]);
    return { error: problem };
  }
  await insertFileRow(user, {
    actionId: actionId.data,
    key: input.key,
    filename: input.filename,
    contentType: meta.contentType,
    size: meta.size,
    groupLabel: group.data,
  });
  revalidatePath(`/aktionen/${actionId.data}`);
  return { ok: `Hochgeladen: ${input.filename}` };
}

export async function deleteFile(formData: FormData) {
  const user = await requireOrgUser();
  const fileId = uuid.parse(formData.get("fileId"));
  const actionId = uuid.parse(formData.get("actionId"));
  // RLS: nur wer hochgeladen hat oder Admin
  const [row] = await withUser(user.id, (tx) =>
    tx
      .delete(schema.actionFiles)
      .where(and(eq(schema.actionFiles.id, fileId), eq(schema.actionFiles.actionId, actionId)))
      .returning({ key: schema.actionFiles.storageKey }),
  );
  if (row) await deleteFiles([row.key]);
  revalidatePath(`/aktionen/${actionId}`);
}

export async function setFileGroup(formData: FormData) {
  const user = await requireOrgUser();
  const fileId = uuid.parse(formData.get("fileId"));
  const actionId = uuid.parse(formData.get("actionId"));
  const group = groupSchema.parse(String(formData.get("groupLabel") ?? ""));
  await withUser(user.id, (tx) =>
    tx
      .update(schema.actionFiles)
      .set({ groupLabel: group || null })
      .where(and(eq(schema.actionFiles.id, fileId), eq(schema.actionFiles.actionId, actionId))),
  );
  revalidatePath(`/aktionen/${actionId}`);
}
