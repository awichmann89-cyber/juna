import type { Metadata } from "next";
import { Suspense } from "react";
import { PartyPopper } from "lucide-react";
import { TaskRow } from "@/components/planning/task-list";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { todayIso } from "@/lib/action-format";
import { requireOrgUser } from "@/lib/auth";
import { dueBucket, dueBucketLabels, type DueBucket } from "@/lib/planning";
import { myTasks } from "@/lib/planning-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Meine Aufgaben" };

const order: DueBucket[] = ["ueberfaellig", "heute", "woche", "spaeter", "ohne"];

async function Tasks() {
  const user = await requireOrgUser();
  const today = todayIso();
  const tasks = await myTasks(user, { includeDone: true });
  const open = tasks.filter((t) => t.status === "offen");
  const done = tasks
    .filter((t) => t.status === "erledigt")
    .sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0))
    .slice(0, 20);

  if (open.length === 0 && done.length === 0) {
    return (
      <EmptyState icon={<PartyPopper className="size-6" />} title="Keine Aufgaben">
        Sobald dir in einer Aktion eine Aufgabe zugewiesen wird, erscheint sie hier – sortiert nach Deadline.
      </EmptyState>
    );
  }

  const groups = order
    .map((b) => ({ bucket: b, items: open.filter((t) => dueBucket(t.due, today) === b) }))
    .filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-6">
      {open.length === 0 && (
        <EmptyState icon={<PartyPopper className="size-6" />} title="Alles erledigt!">
          Du hast keine offenen Aufgaben.
        </EmptyState>
      )}
      {groups.map((g) => (
        <section key={g.bucket}>
          <h2
            className={cn(
              "mb-2 px-1 text-sm font-bold uppercase tracking-wide",
              g.bucket === "ueberfaellig" ? "text-danger" : "text-muted",
            )}
          >
            {dueBucketLabels[g.bucket]} ({g.items.length})
          </h2>
          <Card>
            <CardContent className="px-1 py-1">
              <ul className="divide-y divide-border">
                {g.items.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} showAction />
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ))}
      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer px-1 text-sm font-bold uppercase tracking-wide text-muted">
            Zuletzt erledigt ({done.length})
          </summary>
          <Card className="mt-2">
            <CardContent className="px-1 py-1">
              <ul className="divide-y divide-border">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} showAction />
                ))}
              </ul>
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Meine Aufgaben" description="Alles, was dir zugewiesen ist – sortiert nach Deadline." />
      <Suspense fallback={<PageSkeleton />}>
        <Tasks />
      </Suspense>
    </>
  );
}
