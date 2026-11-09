import type { Metadata } from "next";
import { Suspense } from "react";
import { Building2, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireSuperadmin } from "@/lib/auth";
import { and, count, desc, isNotNull, ne } from "drizzle-orm";
import { schema, withUser } from "@/db";
import { formatDate } from "@/lib/utils";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Plattform" };

async function Platform({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const result = str(sp.ergebnis);
  const me = await requireSuperadmin();
  // RLS: Superadmin darf Anträge und alle Organisationen lesen
  const { apps, orgs, counts } = await withUser(me.id, async (tx) => ({
    apps: await tx
      .select()
      .from(schema.organizationApplications)
      .orderBy(desc(schema.organizationApplications.createdAt))
      .limit(100),
    orgs: await tx.select().from(schema.organizations).orderBy(schema.organizations.name),
    counts: await tx
      .select({ orgId: schema.profiles.orgId, n: count() })
      .from(schema.profiles)
      .where(and(isNotNull(schema.profiles.orgId), ne(schema.profiles.status, "deactivated")))
      .groupBy(schema.profiles.orgId),
  }));
  const pending = apps.filter((a) => a.status === "pending");
  const decided = apps.filter((a) => a.status !== "pending").slice(0, 20);
  const memberCount = new Map(counts.map((c) => [c.orgId!, c.n]));

  return (
    <div className="flex flex-col gap-8">
      {result === "freigegeben" && (
        <Alert tone="success">
          „{str(sp.org)}“ ist freigeschaltet. {str(sp.kontakt)} wurde als Admin eingeladen.
        </Alert>
      )}
      {result === "abgelehnt" && <Alert tone="info">Antrag „{str(sp.org)}“ wurde abgelehnt.</Alert>}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          Offene Anträge {pending.length > 0 && <Badge tone="primary">{pending.length}</Badge>}
        </h2>
        {pending.length === 0 ? (
          <EmptyState icon={<Inbox className="size-6" />} title="Keine offenen Anträge" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pending.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="text-base">{a.orgName}</CardTitle>
                  <p className="text-sm text-muted">
                    {a.contactName} · <a href={`mailto:${a.contactEmail}`} className="underline">{a.contactEmail}</a> ·{" "}
                    {formatDate(a.createdAt)}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {a.message && <p className="rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-line">{a.message}</p>}
                  <DecisionForm applicationId={a.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Organisationen</h2>
        <Card>
          <CardContent className="px-2 py-2">
            {orgs.length === 0 ? (
              <p className="p-3 text-sm text-muted">Noch keine Organisationen.</p>
            ) : (
              <ul className="divide-y divide-border">
                {orgs.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-3 py-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Building2 className="size-4" aria-hidden />
                    </span>
                    <div className="flex-1">
                      <div className="font-bold">{o.name}</div>
                      <div className="text-sm text-muted">
                        {memberCount.get(o.id) ?? 0} Mitglieder · seit {formatDate(o.createdAt)}
                      </div>
                    </div>
                    {o.status !== "active" && <Badge tone="warning">Gesperrt</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Entschiedene Anträge</h2>
          <Card>
            <CardContent className="px-2 py-2">
              <ul className="divide-y divide-border">
                {decided.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-3 text-sm">
                    <span className="flex-1 font-semibold">{a.orgName}</span>
                    <span className="text-muted">{formatDate(a.reviewedAt)}</span>
                    <Badge tone={a.status === "approved" ? "success" : "danger"}>
                      {a.status === "approved" ? "Freigegeben" : "Abgelehnt"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <>
      <PageHeader title="Plattform" description="Anträge neuer Organisationen freigeben und Organisationen verwalten." />
      <Suspense fallback={<PageSkeleton />}>
        <Platform searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
