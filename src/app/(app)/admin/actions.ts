"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { adminDb, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { InviteError, inviteUser } from "@/lib/invitations";
import { sendMail } from "@/lib/mail";

export type AdminState = { ok?: string; error?: string };

export async function decideApplication(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const superadmin = await requireSuperadmin();
  const id = z.uuid().safeParse(formData.get("applicationId"));
  const decision = z.enum(["approve", "reject"]).safeParse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  if (!id.success || !decision.success) return { error: "Ungültige Anfrage." };

  const db = adminDb();
  const apps = schema.organizationApplications;
  const [app] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, id.data), eq(apps.status, "pending")));
  if (!app) return { error: "Antrag nicht gefunden oder bereits entschieden." };

  if (decision.data === "reject") {
    await db
      .update(apps)
      .set({ status: "rejected", reviewedBy: superadmin.id, reviewedAt: new Date(), reviewNote: note })
      .where(eq(apps.id, app.id));
    await sendMail({
      to: app.contactEmail,
      subject: "Dein Antrag bei juna",
      text: `Hallo ${app.contactName},\n\nleider können wir den Antrag für „${app.orgName}“ aktuell nicht freigeben.${note ? `\n\nHinweis: ${note}` : ""}\n\nBei Fragen antworte gerne auf diese Mail.`,
    });
    revalidatePath("/admin");
    redirect(`/admin?${new URLSearchParams({ ergebnis: "abgelehnt", org: app.orgName })}`);
  }

  // Freigabe: Organisation anlegen → Kontaktperson als Admin einladen → Antrag abschließen
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: app.orgName })
    .returning({ id: schema.organizations.id, name: schema.organizations.name });

  try {
    await inviteUser({ email: app.contactEmail, displayName: app.contactName, orgId: org.id, role: "admin" });
  } catch (e) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, org.id));
    if (!(e instanceof InviteError)) console.error("[admin:approve]", e);
    return { error: e instanceof InviteError ? e.message : "Einladung fehlgeschlagen – Organisation wurde nicht angelegt." };
  }

  await db
    .update(apps)
    .set({ status: "approved", organizationId: org.id, reviewedBy: superadmin.id, reviewedAt: new Date(), reviewNote: note })
    .where(eq(apps.id, app.id));

  revalidatePath("/admin");
  redirect(`/admin?${new URLSearchParams({ ergebnis: "freigegeben", org: org.name, kontakt: app.contactName })}`);
}
