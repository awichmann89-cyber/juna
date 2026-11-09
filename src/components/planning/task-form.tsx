"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveTask, type PlanFormState } from "@/app/(app)/aktionen/planning-actions";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

type TaskDefaults = {
  id: string;
  title: string;
  description: string | null;
  dueDaysBefore: number | null;
  dueDate: string | null;
  assignees: string[];
};

export function TaskForm({
  actionId,
  hasDate,
  members,
  task,
  onSaved,
  autoFocus,
}: {
  actionId: string;
  hasDate: boolean;
  members: { id: string; name: string }[];
  task?: TaskDefaults;
  /** Wird nach erfolgreichem Speichern mit der Aufgaben-ID aufgerufen */
  onSaved?: (taskId: string) => void;
  autoFocus?: boolean;
}) {
  const [state, action] = useActionState<PlanFormState, FormData>(saveTask, {});
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });
  useEffect(() => {
    if (state.ok && state.taskId) onSavedRef.current?.(state.taskId);
  }, [state]);
  const v = state.values;
  const initialMode = v?.dueMode ?? (task ? (task.dueDate ? "datum" : task.dueDaysBefore != null ? "relativ" : "ohne") : hasDate ? "relativ" : "ohne");
  const [mode, setMode] = useState(initialMode);
  const p = task?.id ?? "neu";
  const fe = state.fieldErrors ?? {};
  const assignees = v?.assignees !== undefined ? v.assignees.split(",").filter(Boolean) : (task?.assignees ?? []);

  return (
    <form action={action} className="flex flex-col gap-3" key={state.ok ?? JSON.stringify(v ?? {})}>
      {state.ok && !task && <Alert tone="success">{state.ok}</Alert>}
      {state.ok && task && <p className="text-sm font-semibold text-success">{state.ok}</p>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="actionId" value={actionId} />
      {task && <input type="hidden" name="taskId" value={task.id} />}
      <Field label="Aufgabe" htmlFor={`${p}-title`} error={fe.title}>
        <Input id={`${p}-title`} name="title" required maxLength={200} placeholder="z. B. Plakat drucken" defaultValue={v?.title ?? task?.title} autoFocus={autoFocus} />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Deadline</legend>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["relativ", "Tage vor der Aktion"],
              ["datum", "Festes Datum"],
              ["ohne", "Keine"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={cn("cursor-pointer", value === "relativ" && !hasDate && "pointer-events-none opacity-50")}>
              <input
                type="radio"
                name="dueMode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                disabled={value === "relativ" && !hasDate}
                className="peer sr-only"
              />
              <span className="block rounded-full border border-border px-3 py-1 text-sm font-semibold text-muted peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                {label}
              </span>
            </label>
          ))}
        </div>
        {mode === "relativ" && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Input
              name="dueDaysBefore"
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              required
              className="h-9 w-20"
              defaultValue={v?.dueDaysBefore ?? task?.dueDaysBefore ?? 7}
              aria-label="Tage vor der Aktion"
            />
            Tage vor der Aktion – verschiebt sich automatisch mit dem Aktionsdatum.
          </div>
        )}
        {mode === "datum" && (
          <Input name="dueDate" type="date" required className="mt-2 h-9 w-44" defaultValue={v?.dueDate ?? task?.dueDate ?? ""} aria-label="Deadline" />
        )}
        {(fe.dueDaysBefore || fe.dueDate) && <p className="mt-1 text-sm text-danger">{fe.dueDaysBefore ?? fe.dueDate}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Zuständig</legend>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <label key={m.id} className="cursor-pointer">
              <input type="checkbox" name="assignee" value={m.id} defaultChecked={assignees.includes(m.id)} className="peer sr-only" />
              <span className="block rounded-full border border-border px-3 py-1 text-sm font-semibold text-muted peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                {m.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Details (optional)" htmlFor={`${p}-desc`}>
        <Textarea id={`${p}-desc`} name="description" maxLength={2000} className="min-h-16" defaultValue={v?.description ?? task?.description ?? ""} />
      </Field>
      <SubmitButton size="sm" className="self-start" pendingText="Speichern …">
        {task ? "Speichern" : "Aufgabe anlegen"}
      </SubmitButton>
    </form>
  );
}
