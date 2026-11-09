/**
 * Legt den Plattform-Superadmin an (einmalig) und gibt den Link zum Passwort-Setzen aus.
 *
 *   npm run bootstrap:superadmin -- apps@alw-mediaworks.de "ALW Mediaworks"
 */
import { sql } from "drizzle-orm";
import { adminDb, schema } from "@/db";
import { inviteUser, resendInvite } from "@/lib/invitations";

const [emailArg, nameArg] = process.argv.slice(2);
const email = (emailArg ?? process.env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase();
if (!email) {
  console.error("Aufruf: npm run bootstrap:superadmin -- <email> [Name]");
  process.exit(1);
}

const db = adminDb();
const [existing] = await db
  .select({ id: schema.profiles.id, isSuperadmin: schema.profiles.isSuperadmin, status: schema.profiles.status })
  .from(schema.profiles)
  .where(sql`lower(${schema.profiles.email}) = ${email}`);

let url: string | undefined;
if (existing) {
  if (!existing.isSuperadmin) {
    await db.update(schema.profiles).set({ isSuperadmin: true }).where(sql`${schema.profiles.id} = ${existing.id}`);
    console.log(`✔ ${email} ist jetzt Superadmin.`);
  } else {
    console.log(`✔ ${email} ist bereits Superadmin.`);
  }
  if (existing.status === "invited") url = (await resendInvite(existing.id)).url;
} else {
  const res = await inviteUser({
    email,
    displayName: nameArg ?? "Plattform-Admin",
    orgId: null,
    role: "member",
    isSuperadmin: true,
  });
  url = res.url;
  console.log(`✔ Superadmin ${email} angelegt.`);
}

if (url) console.log(`\nPasswort festlegen (24 h gültig):\n\n${url}\n`);
process.exit(0);
