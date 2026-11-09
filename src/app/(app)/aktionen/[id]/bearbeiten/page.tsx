import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/actions/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { FormSkeleton } from "@/components/ui/skeleton";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { getAction, seriesOptions } from "@/lib/actions-data";
import { requireOrgUser } from "@/lib/auth";
import { deleteAction } from "../../actions";

export const metadata: Metadata = { title: "Aktion bearbeiten" };

async function EditForm({ params }: { params: PageProps<"/aktionen/[id]/bearbeiten">["params"] }) {
  const user = await requireOrgUser();
  const { id } = await params;
  const [action, series] = await Promise.all([getAction(user, id), seriesOptions(user)]);
  if (!action) notFound();
  return (
    <>
      <ActionForm id={action.id} defaults={action} series={series} cancelHref={`/aktionen/${action.id}`} />
      {user.role === "admin" && (
        <form action={deleteAction} className="mt-8 border-t border-border pt-5">
          <input type="hidden" name="id" value={action.id} />
          <ConfirmSubmit
            confirm={`„${action.title}“ inklusive Notizen endgültig löschen?`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-danger hover:underline"
          >
            <Trash2 className="size-4" aria-hidden /> Aktion löschen
          </ConfirmSubmit>
        </form>
      )}
    </>
  );
}

export default function EditActionPage(props: PageProps<"/aktionen/[id]/bearbeiten">) {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Aktion bearbeiten" />
      <Card>
        <CardContent className="pt-5">
          <Suspense fallback={<FormSkeleton fields={5} />}>
            <EditForm params={props.params} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
