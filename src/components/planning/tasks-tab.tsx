import { ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { ActionDetail } from "@/lib/actions-data";
import type { Member, TaskItem } from "@/lib/planning-data";
import { TaskForm } from "./task-form";
import { TaskRow } from "./task-list";

export function TasksTab({ action, tasks, members, today }: { action: ActionDetail; tasks: TaskItem[]; members: Member[]; today: string }) {
  const active = members.filter((m) => m.status !== "deactivated").map((m) => ({ id: m.id, name: m.name }));
  const edit = { actionId: action.id, hasDate: Boolean(action.date), members: active };
  const open = tasks.filter((t) => t.status === "offen");
  const done = tasks.filter((t) => t.status === "erledigt");
  return (
    <div className="flex flex-col gap-4">
      {tasks.length === 0 ? (
        <EmptyState icon={<ListChecks className="size-6" />} title="Noch keine Aufgaben">
          Lege fest, wer bis wann was erledigt. Deadlines „X Tage vor der Aktion“ verschieben sich automatisch mit.
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="px-1 py-1">
            <ul className="divide-y divide-border">
              {open.map((t) => (
                <TaskRow key={t.id} task={t} today={today} edit={edit} />
              ))}
            </ul>
            {done.length > 0 && (
              <details className="border-t border-border px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-muted">{done.length} erledigt</summary>
                <ul className="divide-y divide-border">
                  {done.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} edit={edit} />
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aufgabe hinzufügen</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskForm actionId={action.id} hasDate={Boolean(action.date)} members={active} />
        </CardContent>
      </Card>
    </div>
  );
}
