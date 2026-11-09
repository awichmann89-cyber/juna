import "server-only";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt (siehe .env.example).`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL", process.env.DATABASE_URL);
  },
  get betterAuthSecret() {
    return required("BETTER_AUTH_SECRET", process.env.BETTER_AUTH_SECRET);
  },
  get siteUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get platformAdminEmail() {
    return process.env.PLATFORM_ADMIN_EMAIL ?? "apps@alw-mediaworks.de";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY;
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? "juna <noreply@juna.app>";
  },
};
