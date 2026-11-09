import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { adminDb, schema } from "@/db";
import { env } from "@/lib/env";
import { sendPasswordMail } from "@/lib/invitations";

let _auth: ReturnType<typeof createAuth> | undefined;

function createAuth() {
  return betterAuth({
    appName: "juna",
    baseURL: env.siteUrl,
    basePath: "/api/auth",
    secret: env.betterAuthSecret,
    database: drizzleAdapter(adminDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Konten entstehen ausschließlich über Einladungen bzw. Freigaben
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // Gilt für Einladungs- und Reset-Links
      resetPasswordTokenExpiresIn: 60 * 60 * 24,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        await sendPasswordMail({ userId: user.id, email: user.email, token });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 Tage
      updateAge: 60 * 60 * 24,
      // Kein Cookie-Cache: Abmeldungen/Passwort-Resets wirken sofort auf allen Geräten
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      // Pro IP: großzügig genug für eine Leiterrunde im selben WLAN, eng genug gegen Brute Force
      customRules: {
        "/sign-in/email": { window: 60, max: 20 },
        "/reset-password": { window: 60, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: "juna",
      database: { generateId: () => crypto.randomUUID() },
    },
    databaseHooks: {
      session: {
        create: {
          // Deaktivierte Mitglieder können sich nicht mehr anmelden
          before: async (session) => {
            const [profile] = await adminDb()
              .select({ status: schema.profiles.status })
              .from(schema.profiles)
              .where(eq(schema.profiles.id, session.userId));
            if (!profile || profile.status === "deactivated") return false;
            return { data: session };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export function auth() {
  return (_auth ??= createAuth());
}
