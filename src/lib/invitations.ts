import "server-only";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { adminDb, schema } from "@/db";
import type { OrgRole } from "@/db/schema";
import { auth } from "@/lib/better-auth";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";

export class InviteError extends Error {}

const TOKEN_TTL_SECONDS = 60 * 60 * 24;

/**
 * Erzeugt einen Einmal-Token im Format von Better Auths Passwort-Reset
 * (identifier "reset-password:<token>"), einlösbar über auth.api.resetPassword.
 * Funktioniert auch für Konten ohne Passwort – Better Auth legt den Credential-Account dann an.
 */
async function createPasswordToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const ctx = await auth().$context;
  await ctx.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
  });
  return token;
}

function passwordUrl(token: string) {
  const u = new URL("/passwort-setzen", env.siteUrl);
  u.searchParams.set("token", token);
  return u.toString();
}

/** Verschickt je nach Status eine Einladungs- oder eine Reset-Mail mit Link zu /passwort-setzen. */
export async function sendPasswordMail({ userId, email, token }: { userId: string; email: string; token: string }) {
  const [profile] = await adminDb()
    .select({
      displayName: schema.profiles.displayName,
      status: schema.profiles.status,
      orgName: schema.organizations.name,
    })
    .from(schema.profiles)
    .leftJoin(schema.organizations, eq(schema.organizations.id, schema.profiles.orgId))
    .where(eq(schema.profiles.id, userId));
  if (!profile || profile.status === "deactivated") return;

  const url = passwordUrl(token);
  if (profile.status === "invited") {
    const where = profile.orgName ? ` für „${profile.orgName}“` : "";
    await sendMail({
      to: email,
      subject: `Einladung zu juna${where}`,
      text: `Hallo ${profile.displayName},\n\ndu wurdest zu juna${where} eingeladen – dem Planungstool für eure Aktionen.\n\nKlicke auf den Link, um dein Passwort festzulegen:\n\n${url}\n\nDer Link ist 24 Stunden gültig. Falls er abgelaufen ist, kann dein Admin dir eine neue Einladung schicken.`,
    });
  } else {
    await sendMail({
      to: email,
      subject: "Passwort für juna zurücksetzen",
      text: `Hallo ${profile.displayName},\n\nüber den folgenden Link kannst du ein neues Passwort für juna festlegen:\n\n${url}\n\nDer Link ist 24 Stunden gültig. Wenn du das nicht angefordert hast, kannst du diese Mail ignorieren.`,
    });
  }
}

/**
 * Legt einen neuen User an (Better Auth + Profil) und verschickt die Einladung.
 * Nur nach Berechtigungsprüfung aufrufen (Org-Admin bzw. Superadmin).
 */
export async function inviteUser(input: {
  email: string;
  displayName: string;
  orgId: string | null;
  role: OrgRole;
  isSuperadmin?: boolean;
}) {
  const db = adminDb();
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();

  const [existing] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(sql`lower(${schema.user.email}) = ${email}`);
  if (existing) {
    throw new InviteError(
      "Diese E-Mail-Adresse ist bereits bei juna registriert. Ein Konto kann nur zu einer Organisation gehören.",
    );
  }

  const ctx = await auth().$context;
  const created = await ctx.internalAdapter.createUser(
    { email, name: displayName, emailVerified: true },
    { method: "admin" },
  );
  if (!created) throw new InviteError("Das Konto konnte nicht angelegt werden.");

  try {
    await db.insert(schema.profiles).values({
      id: created.id,
      orgId: input.orgId,
      role: input.role,
      status: "invited",
      isSuperadmin: input.isSuperadmin ?? false,
      displayName,
      email,
      invitedAt: new Date(),
    });
  } catch (e) {
    await db.delete(schema.user).where(eq(schema.user.id, created.id));
    throw new InviteError("Das Profil konnte nicht angelegt werden.", { cause: e });
  }

  const token = await createPasswordToken(created.id);
  await sendPasswordMail({ userId: created.id, email, token });
  return { userId: created.id, url: passwordUrl(token) };
}

/** Neue Einladung für ein noch nicht aktiviertes Mitglied. */
export async function resendInvite(userId: string) {
  const [profile] = await adminDb()
    .select({ email: schema.profiles.email, status: schema.profiles.status })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId));
  if (!profile || profile.status !== "invited") throw new InviteError("Dieses Mitglied ist bereits aktiv.");
  const token = await createPasswordToken(userId);
  await sendPasswordMail({ userId, email: profile.email, token });
  await adminDb().update(schema.profiles).set({ invitedAt: new Date() }).where(eq(schema.profiles.id, userId));
  return { url: passwordUrl(token) };
}

/** Passwort vergessen. Antwortet bewusst nie unterschiedlich, um keine Konten preiszugeben. */
export async function sendPasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const [profile] = await adminDb()
    .select({ id: schema.profiles.id, status: schema.profiles.status })
    .from(schema.profiles)
    .where(sql`lower(${schema.profiles.email}) = ${email}`);
  if (!profile || profile.status === "deactivated") return;
  const token = await createPasswordToken(profile.id);
  await sendPasswordMail({ userId: profile.id, email, token });
}
