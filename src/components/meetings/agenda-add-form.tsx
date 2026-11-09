"use client";

import { useActionState, useState } from "react";
import { addAgendaItem, type MeetingFormState } from "@/app/(app)/leiterrunde/actions";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export function AgendaAddForm({
  meetingId,
  candidates,
}: {
  meetingId: string;
  candidates: { id: string; label: string }[];
}) {
  const [state, action] = useActionState<MeetingFormState, FormData>(addAgendaItem, {});
  const [mode, setMode] = useState<"aktion" | "frei">(candidates.length ? "aktion" : "frei");
  return (
    <form action={action} className="flex flex-col gap-3" key={state.ok ?? state.error ?? ""}>
      <input type="hidden" name="meetingId" value={meetingId} />
      <div className="flex gap-2">
        {(
          [
            ["aktion", "Aktion"],
            ["frei", "Freier Punkt"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold",
              mode === key ? "border-primary bg-primary-soft text-primary" : "border-border text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "aktion" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Aktion" htmlFor={`agenda-action-${meetingId}`}>
            <Select id={`agenda-action-${meetingId}`} name="actionId" required>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bereich" htmlFor={`agenda-kind-${meetingId}`}>
            <Select id={`agenda-kind-${meetingId}`} name="kind" defaultValue="planung">
              <option value="planung">Planung</option>
              <option value="feedback">Feedback</option>
            </Select>
          </Field>
        </div>
      ) : (
        <Field label="Titel" htmlFor={`agenda-title-${meetingId}`}>
          <Input id={`agenda-title-${meetingId}`} name="title" required maxLength={160} placeholder="z. B. Kassenstand, Termine, Sonstiges" />
        </Field>
      )}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm font-semibold text-success">{state.ok}</p>}
      <div>
        <SubmitButton size="sm" pendingText="Fügt hinzu …">
          Hinzufügen
        </SubmitButton>
      </div>
    </form>
  );
}
