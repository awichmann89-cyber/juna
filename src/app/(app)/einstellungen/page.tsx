import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, LogOut, ShieldCheck, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { schema, withUser } from "@/db";
import { logout } from "@/app/(auth)/actions";
import { OrganizationForm, ProfileForm } from "./forms";
import { CalendarCard } from "@/components/calendar/calendar-card";
import type { OrgUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Einstellungen" };

function LinkRow({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl p-4 hover:bg-surface-2"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <div className="flex-1">
        <div className="font-bold">{title}</div>
        <div className="text-sm text-muted">{text}</div>
      </div>
      <ChevronRight className="size-5 text-muted" aria-hidden />
    </Link>
  );
}

async function Settings() {
  const user = await requireUser();
  const [profile] = await withUser(user.id, (tx) =>
    tx
      .select({ reminderTime: schema.profiles.reminderTime })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, user.id)),
  );
  const reminderTime = String(profile?.reminderTime ?? "18:00").slice(0, 5);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mein Profil</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              displayName={user.displayName}
              reminderTime={reminderTime}
            />
          </CardContent>
        </Card>

        {user.org && <CalendarCard user={user as OrgUser} />}
      </div>

      <div className="flex flex-col gap-4">
        {(user.role === "admin" && user.org) || user.isSuperadmin ? (
          <Card>
            <CardContent className="flex flex-col gap-1 p-2">
              {user.org && user.role === "admin" && (
                <LinkRow
                  href="/einstellungen/mitglieder"
                  icon={<Users className="size-5" aria-hidden />}
                  title="Mitglieder"
                  text="Einladen, Rollen vergeben, deaktivieren"
                />
              )}
              {user.isSuperadmin && (
                <LinkRow
                  href="/admin"
                  icon={<ShieldCheck className="size-5" aria-hidden />}
                  title="Plattform"
                  text="Anträge freigeben, Organisationen"
                />
              )}
            </CardContent>
          </Card>
        ) : null}

        {user.org && user.role === "admin" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organisation</CardTitle>
            </CardHeader>
            <CardContent>
              <OrganizationForm name={user.org.name} />
            </CardContent>
          </Card>
        )}

        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-4 font-bold text-danger hover:bg-danger-soft"
          >
            <LogOut className="size-5" aria-hidden /> Abmelden
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Einstellungen" />
      <Suspense fallback={<PageSkeleton />}>
        <Settings />
      </Suspense>
    </>
  );
}
