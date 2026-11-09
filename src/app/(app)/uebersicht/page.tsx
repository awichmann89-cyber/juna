import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, ChevronRight, ListChecks, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireOrgUser } from "@/lib/auth";
import { and, count, eq, ne } from "drizzle-orm";
import { schema, withUser } from "@/db";

export const metadata: Metadata = { title: "Übersicht" };

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" }).format(new Date()),
  );
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Hallo";
  return "Guten Abend";
}

async function Dashboard() {
  const user = await requireOrgUser();
  const [{ members }] = await withUser(user.id, (tx) =>
    tx
      .select({ members: count() })
      .from(schema.profiles)
      .where(and(eq(schema.profiles.orgId, user.org.id), ne(schema.profiles.status, "deactivated"))),
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
          {greeting()}, {user.displayName.split(" ")[0]}!
        </h1>
        <p className="mt-1 text-muted">Das steht bei „{user.org.name}“ an.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-5 text-primary" aria-hidden /> Nächste Aktionen
            </CardTitle>
            <CardDescription>Sobald ihr Aktionen anlegt, erscheinen sie hier.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="size-5 text-primary" aria-hidden /> Meine Aufgaben
            </CardTitle>
            <CardDescription>Dir sind noch keine Aufgaben zugewiesen.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="p-0">
            <Link
              href={user.role === "admin" ? "/einstellungen/mitglieder" : "/einstellungen"}
              className="flex items-center gap-4 rounded-2xl p-5 hover:bg-surface-2"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
                <Users className="size-5" aria-hidden />
              </span>
              <div className="flex-1">
                <div className="font-bold">
                  {members} {members === 1 ? "Mitglied" : "Mitglieder"}
                </div>
                <div className="text-sm text-muted">
                  {user.role === "admin" ? "Mitglieder einladen und verwalten" : "Deine Einstellungen"}
                </div>
              </div>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
