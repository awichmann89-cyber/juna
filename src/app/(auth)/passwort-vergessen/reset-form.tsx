"use client";

import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";

export function ResetForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});
  if (state.success) return <Alert tone="success">{state.success}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="E-Mail" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          defaultValue={state.values?.email}
        />
      </Field>
      <SubmitButton pendingText="Senden …">Link anfordern</SubmitButton>
    </form>
  );
}
