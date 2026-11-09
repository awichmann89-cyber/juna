"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { adminDb, schema } from "@/db";
import { requireOrgAdmin } from "@/lib/auth";
import { auth } from "@/lib/better-auth";
import { InviteError, inviteUser, resendInvite } from "@/lib/invitations";
import { mailEnabled } from "@/lib/mail";

export type MemberState = {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** Nur ohne Mailversand: Link zum manuellen Weitergeben */
  link?: string;
};

const inviteSchema = z.object({
  displayName: z.string().trim().min(2, "Bitte einen Namen angeben.").max(80),
  email: z.email("Bitte eine gültige E-Mail-Adresse angeben."),
  role: z.enum(["admin", "member"]),
});

export async function inviteMember(_prev: MemberState, formData: FormData): Promise<MemberState> {
  const admin = await requireOrgAdmin();
  const values = Object.fromEntries(
    ["displayName", "email", "role"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = inviteSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  let url: string;
  try {
    ({ url } = await inviteUser({ ...parsed.data, orgId: admin.org.id }));
  } catch (e) {
    if (!(e instanceof InviteError)) console.error("[mitglieder:invite]", e);
    return { error: e instanceof InviteError ? e.message : "Die Einladung ist fehlgeschlagen.", values };
  }
  revalidatePath("/einstellungen/mitglieder");
  return { ok: `${parsed.data.displayName} wurde eingeladen.`, link: mailEnabled() ? undefined : url };
}

/** Lädt das Ziel-Mitglied – ausschließlich aus der eigenen Organisation. */
async function loadTarget(orgId: string, memberId: string) {
  const [target] = await adminDb()
    .select({
      id: schema.profiles.id,
      role: schema.profiles.role,
      status: schema.profiles.status,
      displayName: schema.profiles.displayName,
      activatedAt: schema.profiles.activatedAt,
    })
    .from(schema.profiles)
    .where(and(eq(schema.profiles.id, memberId), eq(schema.profiles.orgId, orgId)));
  return target;
}

async function activeAdminCount(orgId: string) {
  const [row] = await adminDb()
    .select({ n: count() })
    .from(schema.profiles)
    .where(
      and(eq(schema.profiles.orgId, orgId), eq(schema.profiles.role, "admin"), ne(schema.profiles.status, "deactivated")),
    );
  return row?.n ?? 0;
}

export async function memberAction(_prev: MemberState, formData: FormData): Promise<MemberState> {
  const admin = await requireOrgAdmin();
  const memberId = z.string().min(1).max(64).safeParse(formData.get("memberId"));
  const op = z.enum(["make-admin", "make-member", "deactivate", "reactivate", "resend"]).safeParse(formData.get("op"));
  if (!memberId.success || !op.success) return { error: "Ungültige Anfrage." };

  const target = await loadTarget(admin.org.id, memberId.data);
  if (!target) return { error: "Mitglied nicht gefunden." };

  const db = adminDb();
  const byId = eq(schema.profiles.id, target.id);
  const isLastAdmin =
    target.role === "admin" && target.status !== "deactivated" && (await activeAdminCount(admin.org.id)) <= 1;

  switch (op.data) {
    case "make-admin":
      await db.update(schema.profiles).set({ role: "admin" }).where(byId);
      break;
    case "make-member":
      if (isLastAdmin) return { error: "Es muss mindestens ein Admin in der Organisation bleiben." };
      await db.update(schema.profiles).set({ role: "member" }).where(byId);
      break;
    case "deactivate": {
      if (target.id === admin.id) return { error: "Du kannst dich nicht selbst deaktivieren." };
      if (isLastAdmin) return { error: "Es muss mindestens ein Admin in der Organisation bleiben." };
      await db.update(schema.profiles).set({ status: "deactivated" }).where(byId);
      // Alle Sitzungen beenden; neue Anmeldungen blockiert der Session-Hook
      const ctx = await auth().$context;
      await ctx.internalAdapter.deleteUserSessions(target.id);
      break;
    }
    case "reactivate":
      await db
        .update(schema.profiles)
        .set({ status: target.activatedAt ? "active" : "invited" })
        .where(byId);
      break;
    case "resend":
      let url: string;
      try {
        ({ url } = await resendInvite(target.id));
      } catch (e) {
        return { error: e instanceof InviteError ? e.message : "Erneutes Einladen fehlgeschlagen." };
      }
      revalidatePath("/einstellungen/mitglieder");
      return { ok: `Neue Einladung an ${target.displayName} verschickt.`, link: mailEnabled() ? undefined : url };
  }
  revalidatePath("/einstellungen/mitglieder");
  return { ok: "Gespeichert." };
}
