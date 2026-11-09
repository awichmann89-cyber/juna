import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm } from "@/components/actions/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { FormSkeleton } from "@/components/ui/skeleton";
import { lastInSeries, seriesOptions } from "@/lib/actions-data";
import { requireOrgUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Neue Aktion" };

async function NewActionForm({ searchParams }: { searchParams: PageProps<"/aktionen/neu">["searchParams"] }) {
  const user = await requireOrgUser();
  const sp = await searchParams;
  const series = await seriesOptions(user);
  const reihe = series.find((s) => s.id === sp.reihe);
  const idee = sp.idee === "1";
  // Neue Durchführung einer Reihe: Titel, Ort und Uhrzeiten vom letzten Mal vorschlagen
  const last = reihe ? await lastInSeries(user, reihe.id) : null;
  return (
    <ActionForm
      series={series}
      cancelHref={reihe ? `/aktionen?reihe=${reihe.id}` : "/aktionen"}
      defaults={{
        seriesId: reihe?.id ?? "",
        title: last?.title ?? reihe?.name ?? "",
        location: last?.location ?? "",
        startTime: last?.startTime ?? "",
        endTime: last?.endTime ?? "",
        status: idee ? "idee" : "geplant",
      }}
    />
  );
}

export default function NewActionPage(props: PageProps<"/aktionen/neu">) {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Neue Aktion" />
      <Card>
        <CardContent className="pt-5">
          <Suspense fallback={<FormSkeleton fields={5} />}>
            <NewActionForm searchParams={props.searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
