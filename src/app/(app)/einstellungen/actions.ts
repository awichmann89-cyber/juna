"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema, withUser } from "@/db";
import { requireOrgAdmin, requireUser } from "@/lib/auth";

export type SettingsState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

const quarterHour = /^([01]\d|2[0-3]):(00|15|30|45)$/;

export async function updateProfile(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const parsed = z
    .object({
      displayName: z.string().trim().min(1, "Bitte gib einen Namen an.").max(80),
      reminderTime: z.string().regex(quarterHour, "Bitte eine Uhrzeit in 15-Minuten-Schritten wählen."),
    })
    .safeParse({ displayName: formData.get("displayName"), reminderTime: formData.get("reminderTime") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  try {
    // RLS + Spaltenrechte: nur unkritische Felder des eigenen Profils
    await withUser(user.id, (tx) =>
      tx
        .update(schema.profiles)
        .set({ displayName: parsed.data.displayName, reminderTime: parsed.data.reminderTime })
        .where(eq(schema.profiles.id, user.id)),
    );
  } catch {
    return { error: "Speichern fehlgeschlagen." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateOrganization(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await requireOrgAdmin();
  const parsed = z.string().trim().min(2, "Mindestens 2 Zeichen.").max(120).safeParse(formData.get("name"));
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0]!.message } };
  try {
    await withUser(user.id, (tx) =>
      tx.update(schema.organizations).set({ name: parsed.data }).where(eq(schema.organizations.id, user.org.id)),
    );
  } catch {
    return { error: "Speichern fehlgeschlagen." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
