import Link from "next/link";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import { deleteTask, toggleTask } from "@/app/(app)/aktionen/planning-actions";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { formatActionDate } from "@/lib/action-format";
import type { MyTask, TaskItem } from "@/lib/planning-data";
import { formatDueRelative } from "@/lib/planning";
import { cn } from "@/lib/utils";
import { TaskForm } from "./task-form";

const dueFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function DueLabel({ task, today }: { task: Pick<TaskItem, "due" | "dueDaysBefore" | "status">; today: string }) {
  if (!task.due) return <span className="text-muted">ohne Deadline</span>;
  const overdue = task.status === "offen" && task.due < today;
  return (
    <span className={cn("inline-flex items-center gap-1", overdue ? "font-bold text-danger" : "text-muted")}>
      <CalendarClock className="size-3.5" aria-hidden />
      {dueFmt.format(new Date(`${task.due}T00:00:00Z`))}
      {task.status === "offen" && ` (${formatDueRelative(task.due, today)})`}
      {task.dueDaysBefore != null && <span className="text-muted"> · {task.dueDaysBefore} T. vorher</span>}
    </span>
  );
}

export function TaskCheckbox({ task }: { task: Pick<TaskItem, "id" | "status" | "title"> }) {
  const done = task.status === "erledigt";
  return (
    <form action={toggleTask}>
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="done" value={done ? "false" : "true"} />
      <button
        type="submit"
        aria-label={done ? `„${task.title}“ wieder öffnen` : `„${task.title}“ erledigt`}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
          done ? "border-success bg-success text-white" : "border-border hover:border-primary",
        )}
      >
        {done && (
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </form>
  );
}

export function TaskRow({
  task,
  today,
  showAction,
  edit,
}: {
  task: TaskItem | MyTask;
  today: string;
  showAction?: boolean;
  edit?: { actionId: string; hasDate: boolean; members: { id: string; name: string }[] };
}) {
  const done = task.status === "erledigt";
  return (
    <li className="flex gap-3 px-3 py-3">
      <TaskCheckbox task={task} />
      <div className="min-w-0 flex-1">
        <div className={cn("font-semibold", done && "text-muted line-through")}>{task.title}</div>
        {task.description && <p className="whitespace-pre-line text-sm text-muted">{task.description}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {done ? (
            <span className="text-muted">erledigt{task.doneByName ? ` von ${task.doneByName}` : ""}</span>
          ) : (
            <DueLabel task={task} today={today} />
          )}
          {task.assignees.length > 0 ? (
            <span className="text-muted">{task.assignees.map((a) => a.name).join(", ")}</span>
          ) : (
            <span className="text-warning">niemand zuständig</span>
          )}
          {showAction && "actionTitle" in task && (
            <Link href={`/aktionen/${task.actionId}?tab=aufgaben`} className="font-semibold text-primary hover:underline">
              {task.actionTitle}
              {task.actionDate && ` · ${formatActionDate({ date: task.actionDate }, "short")}`}
            </Link>
          )}
        </div>
        {edit && (
          <details className="mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
              <Pencil className="size-3" aria-hidden /> Bearbeiten
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <TaskForm
                actionId={edit.actionId}
                hasDate={edit.hasDate}
                members={edit.members}
                task={{ ...task, assignees: task.assignees.map((a) => a.id) }}
              />
              <form action={deleteTask}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="actionId" value={edit.actionId} />
                <ConfirmSubmit confirm={`Aufgabe „${task.title}“ löschen?`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger hover:underline">
                  <Trash2 className="size-3.5" aria-hidden /> Löschen
                </ConfirmSubmit>
              </form>
            </div>
          </details>
        )}
      </div>
    </li>
  );
}
