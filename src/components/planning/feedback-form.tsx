"use client";

import { useActionState } from "react";
import { addFeedback, type PlanFormState } from "@/app/(app)/aktionen/planning-actions";
import { Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { feedbackKinds } from "./feedback-kinds";

export function FeedbackForm({ actionId }: { actionId: string }) {
  const [state, action] = useActionState<PlanFormState, FormData>(addFeedback, {});
  const kind = state.values?.kind || "gut";
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <input type="hidden" name="actionId" value={actionId} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Art des Feedbacks">
        {feedbackKinds.map((k) => (
          <label key={k.value} className="cursor-pointer">
            <input type="radio" name="kind" value={k.value} defaultChecked={kind === k.value} className="peer sr-only" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm font-semibold text-muted peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              <span aria-hidden>{k.emoji}</span> {k.label}
            </span>
          </label>
        ))}
      </div>
      <Textarea
        name="text"
        required
        maxLength={2000}
        className="min-h-20"
        placeholder="Was lief gut, was sollten wir ändern, woran denken wir beim nächsten Mal?"
        defaultValue={state.ok ? "" : state.values?.text}
        aria-label="Feedback"
      />
      {state.fieldErrors?.text && <p className="text-sm text-danger">{state.fieldErrors.text}</p>}
      <SubmitButton size="sm" className="self-start" pendingText="Speichern …">
        Feedback hinzufügen
      </SubmitButton>
    </form>
  );
}
