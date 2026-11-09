"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { adminDb, schema } from "@/db";
import { auth } from "@/lib/better-auth";
import { sendPasswordReset } from "@/lib/invitations";
import { lookupPasswordToken } from "@/lib/password-token";
import { clientIp, consumeRateLimit, formatRetryAfter } from "@/lib/rate-limit";

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  /** Eingaben, die nach einem Fehler erhalten bleiben (React setzt Formulare nach Actions zurück) */
  values?: Record<string, string>;
};

function safeNext(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/uebersicht";
}

function fieldErrorsOf(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return fieldErrors;
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email: z.email(), password: z.string().min(1).max(256) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { error: "Bitte E-Mail und Passwort eingeben.", values };
  const email = parsed.data.email.trim().toLowerCase();

  const [profile] = await adminDb()
    .select({ status: schema.profiles.status, orgId: schema.profiles.orgId })
    .from(schema.profiles)
    .where(sql`lower(${schema.profiles.email}) = ${email}`);

  try {
    await auth().api.signInEmail({ body: { email, password: parsed.data.password }, headers: await headers() });
  } catch {
    if (profile?.status === "deactivated") {
      return { error: "Dein Zugang ist deaktiviert. Wende dich an den Admin deiner Organisation.", values };
    }
    if (profile?.status === "invited") {
      return {
        error: "Du hast dein Passwort noch nicht festgelegt. Nutze den Link aus deiner Einladung oder „Passwort vergessen?“.",
        values,
      };
    }
    return { error: "E-Mail oder Passwort ist falsch.", values };
  }

  redirect(profile?.orgId ? safeNext(formData.get("weiter")) : "/admin");
}

export async function logout() {
  await auth().api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.email().safeParse(formData.get("email"));
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { error: "Bitte eine gültige E-Mail-Adresse eingeben.", values };
  const ip = await clientIp();
  for (const limit of [
    await consumeRateLimit(`reset:ip:${ip}`, 15 * 60, 10),
    await consumeRateLimit(`reset:mail:${parsed.data.toLowerCase()}`, 60 * 60, 3),
  ]) {
    if (!limit.allowed) {
      return {
        error: `Zu viele Anfragen. Bitte versuche es ${formatRetryAfter(limit.retryAfterSeconds)} erneut.`,
        values,
      };
    }
  }
  await sendPasswordReset(parsed.data);
  return { success: "Falls ein Konto mit dieser Adresse existiert, haben wir dir eine E-Mail mit einem Link geschickt." };
}

const passwordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(10, "Mindestens 10 Zeichen.").max(128, "Maximal 128 Zeichen."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Die Passwörter stimmen nicht überein." });

/** Einladung annehmen bzw. Passwort zurücksetzen – danach direkt eingeloggt. */
export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const target = await lookupPasswordToken(parsed.data.token);
  if (!target) return { error: "Der Link ist ungültig oder abgelaufen. Fordere über „Passwort vergessen?“ einen neuen an." };

  try {
    await auth().api.resetPassword({ body: { token: parsed.data.token, newPassword: parsed.data.password } });
  } catch {
    return { error: "Der Link ist ungültig oder abgelaufen. Fordere über „Passwort vergessen?“ einen neuen an." };
  }

  const db = adminDb();
  // Einladung abgeschlossen → Profil aktivieren (nur invited → active)
  await db
    .update(schema.profiles)
    .set({ status: "active", activatedAt: new Date() })
    .where(and(eq(schema.profiles.id, target.userId), eq(schema.profiles.status, "invited")));

  await auth().api.signInEmail({
    body: { email: target.email, password: parsed.data.password },
    headers: await headers(),
  });

  const [profile] = await db
    .select({ orgId: schema.profiles.orgId })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, target.userId));
  redirect(profile?.orgId ? "/uebersicht" : "/admin");
}
