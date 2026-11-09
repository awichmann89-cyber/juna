import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { getSessionCookie } from "better-auth/cookies";
import { adminDb, schema } from "@/db";
import type { MemberStatus, OrgRole } from "@/db/schema";
import { auth } from "@/lib/better-auth";

export type { MemberStatus, OrgRole };

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  role: OrgRole;
  status: MemberStatus;
  isSuperadmin: boolean;
  org: { id: string; name: string } | null;
};

/**
 * Data Access Layer: liest Session + Profil einmal pro Request.
 * null, wenn niemand (gültig) eingeloggt ist oder das Konto deaktiviert wurde.
 */
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000; // = session.updateAge in better-auth.ts

/**
 * Data Access Layer: liest Session + Profil einmal pro Request – in EINER Abfrage.
 * Das Session-Token aus dem Cookie wird direkt in auth.session nachgeschlagen (es ist ein zufälliges Geheimnis,
 * die Signatur im Cookie ist dafür nicht nötig). Abgelaufene oder widerrufene Sessions finden nichts.
 * Einmal pro Tag läuft zusätzlich Better Auth, damit die Session-Laufzeit verlängert wird.
 * null, wenn niemand (gültig) eingeloggt ist oder das Konto deaktiviert wurde.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const h = await headers();
  const raw = getSessionCookie(h, { cookiePrefix: "juna" });
  if (!raw) return null;
  const token = decodeURIComponent(raw).split(".")[0];
  if (!token || token.length > 200) return null;

  const [row] = await adminDb()
    .select({
      id: schema.profiles.id,
      email: schema.profiles.email,
      displayName: schema.profiles.displayName,
      role: schema.profiles.role,
      status: schema.profiles.status,
      isSuperadmin: schema.profiles.isSuperadmin,
      orgId: schema.organizations.id,
      orgName: schema.organizations.name,
      orgStatus: schema.organizations.status,
      sessionUpdatedAt: schema.session.updatedAt,
    })
    .from(schema.session)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.session.userId))
    .leftJoin(schema.organizations, eq(schema.organizations.id, schema.profiles.orgId))
    .where(and(eq(schema.session.token, token), gt(schema.session.expiresAt, sql`now()`)));

  if (!row || row.status === "deactivated") return null;
  const orgActive = row.orgId && row.orgStatus === "active";
  if (!orgActive && !row.isSuperadmin) return null;

  // Sliding Expiration wie bisher: höchstens einmal pro Tag über Better Auth verlängern
  if (Date.now() - row.sessionUpdatedAt.getTime() > SESSION_REFRESH_MS) {
    await auth()
      .api.getSession({ headers: h })
      .catch(() => null);
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    isSuperadmin: row.isSuperadmin,
    org: orgActive ? { id: row.orgId!, name: row.orgName! } : null,
  };
});

/** Erzwingt einen eingeloggten User, sonst Weiterleitung zum Login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type OrgUser = CurrentUser & { org: { id: string; name: string } };

/** Erzwingt einen User mit Organisation (alle Org-Bereiche der App). */
export async function requireOrgUser(): Promise<OrgUser> {
  const user = await requireUser();
  if (!user.org) redirect(user.isSuperadmin ? "/admin" : "/login");
  return user as OrgUser;
}

export async function requireOrgAdmin(): Promise<OrgUser> {
  const user = await requireOrgUser();
  if (user.role !== "admin") notFound();
  return user;
}

export async function requireSuperadmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isSuperadmin) notFound();
  return user;
}
