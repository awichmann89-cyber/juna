"use client";

import { useActionState } from "react";
import { setPassword, type FormState } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState<FormState, FormData>(setPassword, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="token" value={token} />
      {/* Für Passwort-Manager */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <Field label="Neues Passwort" htmlFor="password" hint="Mindestens 10 Zeichen." error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />
      </Field>
      <Field label="Passwort wiederholen" htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton pendingText="Speichern …">Passwort speichern</SubmitButton>
    </form>
  );
}
