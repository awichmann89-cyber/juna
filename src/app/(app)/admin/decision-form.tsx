"use client";

import { useActionState } from "react";
import { decideApplication, type AdminState } from "./actions";
import { Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";

export function DecisionForm({ applicationId }: { applicationId: string }) {
  const [state, action] = useActionState<AdminState, FormData>(decideApplication, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="applicationId" value={applicationId} />
      <Input name="note" placeholder="Notiz (optional, bei Ablehnung an Antragsteller*in)" maxLength={1000} aria-label="Notiz" />
      <div className="flex gap-2">
        <SubmitButton name="decision" value="approve" size="sm">
          Freigeben
        </SubmitButton>
        <SubmitButton name="decision" value="reject" size="sm" variant="danger">
          Ablehnen
        </SubmitButton>
      </div>
    </form>
  );
}
