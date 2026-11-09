"use server";

import { z } from "zod";
import { sql } from "drizzle-orm";
import { adminDb, schema } from "@/db";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { clientIp, consumeRateLimit, formatRetryAfter } from "@/lib/rate-limit";

export type ApplicationState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const applicationSchema = z.object({
  orgName: z.string().trim().min(2, "Bitte gib den Namen eurer Leiterrunde/Organisation an.").max(120),
  contactName: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(120),
  contactEmail: z.email("Bitte gib eine gültige E-Mail-Adresse an."),
  message: z.string().trim().max(2000).optional(),
});

export async function submitApplication(_prev: ApplicationState, formData: FormData): Promise<ApplicationState> {
  // Honeypot gegen Bots: echtes Formular lässt das Feld leer
  if (String(formData.get("website") ?? "").length > 0) return { ok: true };

  const values = Object.fromEntries(
    ["orgName", "contactName", "contactEmail", "message"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = applicationSchema.safeParse({
    orgName: formData.get("orgName"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    message: formData.get("message") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }
  const data = { ...parsed.data, contactEmail: parsed.data.contactEmail.trim().toLowerCase() };
  const limit = await consumeRateLimit(`apply:ip:${await clientIp()}`, 60 * 60, 5);
  if (!limit.allowed) {
    return {
      error: `Zu viele Anträge von deinem Netzwerk. Bitte versuche es ${formatRetryAfter(limit.retryAfterSeconds)} erneut.`,
      values,
    };
  }

  const db = adminDb();
  const [existingUser] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(sql`lower(${schema.user.email}) = ${data.contactEmail}`);
  if (existingUser) {
    return { error: "Mit dieser E-Mail-Adresse existiert bereits ein juna-Konto. Melde dich bitte an.", values };
  }

  try {
    await db.insert(schema.organizationApplications).values({
      orgName: data.orgName,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      message: data.message ?? null,
    });
  } catch (e) {
    if ((e as { cause?: { code?: string }; code?: string }).cause?.code === "23505" || (e as { code?: string }).code === "23505") {
      return { error: "Für diese E-Mail-Adresse liegt bereits ein offener Antrag vor. Wir melden uns bald.", values };
    }
    console.error("[registrieren]", e);
    return { error: "Der Antrag konnte nicht gespeichert werden. Bitte versuche es später erneut.", values };
  }

  await Promise.all([
    sendMail({
      to: env.platformAdminEmail,
      replyTo: data.contactEmail,
      subject: `Neuer Antrag: ${data.orgName}`,
      text: `Neuer Antrag auf eine Organisation bei juna:\n\nOrganisation: ${data.orgName}\nKontakt: ${data.contactName} <${data.contactEmail}>\n${data.message ? `\nNachricht:\n${data.message}\n` : ""}\nZur Freigabe:\n\n${env.siteUrl}/admin`,
    }),
    sendMail({
      to: data.contactEmail,
      subject: "Dein Antrag bei juna ist eingegangen",
      text: `Hallo ${data.contactName},\n\ndanke für euer Interesse an juna! Wir prüfen den Antrag für „${data.orgName}“ und melden uns. Sobald er freigegeben ist, bekommst du eine Einladung, mit der du dein Passwort festlegst und als Admin eure Mitglieder anlegen kannst.`,
    }),
  ]);

  return { ok: true };
}
