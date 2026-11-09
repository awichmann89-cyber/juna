import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Badge, PageHeader } from "@/components/ui/feedback";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireOrgAdmin } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { schema, withUser } from "@/db";
import { InviteForm, MemberMenu } from "./member-forms";

export const metadata: Metadata = { title: "Mitglieder" };


const statusOrder = { active: 0, invited: 1, deactivated: 2 } as const;

async function Members() {
  const admin = await requireOrgAdmin();
  const rows = await withUser(admin.id, (tx) =>
    tx
      .select({
        id: schema.profiles.id,
        displayName: schema.profiles.displayName,
        email: schema.profiles.email,
        role: schema.profiles.role,
        status: schema.profiles.status,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.orgId, admin.org.id))
      .orderBy(schema.profiles.displayName),
  );
  const members = rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{members.filter((m) => m.status !== "deactivated").length}{" "}
            {members.filter((m) => m.status !== "deactivated").length === 1 ? "Mitglied" : "Mitglieder"}</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className={`flex items-center gap-3 px-3 py-3 ${m.status === "deactivated" ? "opacity-60" : ""}`}>
                <Avatar name={m.displayName} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold">{m.displayName}</span>
                    {m.id === admin.id && <span className="text-xs text-muted">(du)</span>}
                    {m.role === "admin" && <Badge tone="primary">Admin</Badge>}
                    {m.status === "invited" && <Badge tone="warning">Eingeladen</Badge>}
                    {m.status === "deactivated" && <Badge>Deaktiviert</Badge>}
                  </div>
                  <div className="truncate text-sm text-muted">{m.email}</div>
                </div>
                <MemberMenu member={m} isSelf={m.id === admin.id} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="self-start">
        <CardHeader>
          <CardTitle className="text-base">Mitglied einladen</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>
    </div>
  );
}

export default function MembersPage() {
  return (
    <>
      <Link href="/einstellungen" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden /> Einstellungen
      </Link>
      <PageHeader title="Mitglieder" description="Neue Mitglieder bekommen eine E-Mail und legen ihr Passwort selbst fest." />
      <Suspense fallback={<PageSkeleton />}>
        <Members />
      </Suspense>
    </>
  );
}
