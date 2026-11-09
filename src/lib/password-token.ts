import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { adminDb, schema } from "@/db";

/** Liefert das Profil zu einem gültigen (nicht abgelaufenen) Einladungs-/Reset-Token. */
export async function lookupPasswordToken(token: string) {
  if (!token || token.length > 200) return null;
  const [row] = await adminDb()
    .select({
      userId: schema.profiles.id,
      email: schema.profiles.email,
      displayName: schema.profiles.displayName,
      status: schema.profiles.status,
      orgName: schema.organizations.name,
    })
    .from(schema.verification)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.verification.value))
    .leftJoin(schema.organizations, eq(schema.organizations.id, schema.profiles.orgId))
    .where(
      and(
        eq(schema.verification.identifier, `reset-password:${token}`),
        gt(schema.verification.expiresAt, sql`now()`),
      ),
    );
  if (!row || row.status === "deactivated") return null;
  return row;
}
