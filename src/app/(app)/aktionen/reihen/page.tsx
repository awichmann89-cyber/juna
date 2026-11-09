import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Archive, ArchiveRestore, ChevronLeft, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { SeriesDot } from "@/components/actions/action-bits";
import { SeriesForm } from "@/components/actions/series-form";
import { PageSkeleton } from "@/components/page-skeleton";
import { buttonClass } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { formatActionDate, todayIso } from "@/lib/action-format";
import { listSeries } from "@/lib/actions-data";
import { requireOrgUser } from "@/lib/auth";
import { deleteSeries, setSeriesArchived } from "../actions";

export const metadata: Metadata = { title: "Aktionsreihen" };

async function SeriesList() {
  const user = await requireOrgUser();
  const series = await listSeries(user, todayIso());

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
      <div className="flex flex-col gap-3">
        {series.length === 0 && (
          <EmptyState icon={<Layers className="size-6" />} title="Noch keine Aktionsreihen">
            Reihen verbinden wiederkehrende Aktionen – z. B. den Kuchenverkauf, der mehrmals im Jahr stattfindet. So seht
            ihr bei jeder Durchführung die Notizen vom letzten Mal.
          </EmptyState>
        )}
        {series.map((s) => (
          <Card key={s.id} className={s.archived ? "opacity-70" : undefined}>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <SeriesDot color={s.color} className="mt-1.5 size-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/aktionen?reihe=${s.id}`} className="font-bold hover:underline">
                      {s.name}
                    </Link>
                    {s.archived && <Badge>Archiviert</Badge>}
                  </div>
                  {s.description && <p className="mt-0.5 text-sm text-muted">{s.description}</p>}
                  <p className="mt-1 text-sm text-muted">
                    {s.actionCount} {s.actionCount === 1 ? "Durchführung" : "Durchführungen"}
                    {s.lastDate && ` · zuletzt ${formatActionDate({ date: s.lastDate }, "short")}`}
                    {s.nextDate && ` · nächste ${formatActionDate({ date: s.nextDate }, "short")}`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Link href={`/aktionen/neu?reihe=${s.id}`} className={buttonClass("secondary", "sm")}>
                  <Plus className="size-4" /> Neue Durchführung
                </Link>
                <details className="group open:basis-full">
                  <summary className={buttonClass("ghost", "sm", "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                    <Pencil className="size-4" /> Bearbeiten
                  </summary>
                  <div className="mt-3 w-full">
                    <SeriesForm series={s} submitLabel="Speichern" />
                  </div>
                </details>
                <form action={setSeriesArchived}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="archived" value={s.archived ? "false" : "true"} />
                  <button type="submit" className={buttonClass("ghost", "sm")}>
                    {s.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                    {s.archived ? "Reaktivieren" : "Archivieren"}
                  </button>
                </form>
                {user.role === "admin" && (
                  <form action={deleteSeries} className="ml-auto">
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmSubmit
                      confirm={`Reihe „${s.name}“ löschen? Die ${s.actionCount} Aktion(en) bleiben erhalten, sind dann aber keiner Reihe mehr zugeordnet.`}
                      className={buttonClass("ghost", "sm", "text-danger")}
                    >
                      <Trash2 className="size-4" /> Löschen
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="self-start">
        <CardHeader>
          <CardTitle className="text-base">Neue Reihe</CardTitle>
        </CardHeader>
        <CardContent>
          <SeriesForm submitLabel="Reihe anlegen" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SeriesPage() {
  return (
    <>
      <Link href="/aktionen" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden /> Aktionen
      </Link>
      <PageHeader
        title="Aktionsreihen"
        description="Wiederkehrende Aktionen – jährlich oder mehrmals im Jahr. Jede Durchführung zeigt die Historie der Reihe."
      />
      <Suspense fallback={<PageSkeleton />}>
        <SeriesList />
      </Suspense>
    </>
  );
}
