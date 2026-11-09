"use client";

import { useActionState } from "react";
import { submitApplication, type ApplicationState } from "./actions";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";

export function ApplicationForm() {
  const [state, action] = useActionState<ApplicationState, FormData>(submitApplication, {});
  if (state.ok) {
    return (
      <Alert tone="success">
        Danke! Euer Antrag ist eingegangen. Nach der Freigabe bekommst du per E-Mail eine Einladung als Admin eurer
        Organisation.
      </Alert>
    );
  }
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" key={JSON.stringify(state.values ?? {})}>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="Name der Organisation" htmlFor="orgName" hint="z. B. Leiterrunde St. Marien" error={fe.orgName}>
        <Input id="orgName" name="orgName" defaultValue={state.values?.orgName} required maxLength={120} autoComplete="organization" />
      </Field>
      <Field label="Dein Name" htmlFor="contactName" error={fe.contactName}>
        <Input id="contactName" name="contactName" defaultValue={state.values?.contactName} required maxLength={120} autoComplete="name" />
      </Field>
      <Field label="Deine E-Mail" htmlFor="contactEmail" hint="Du wirst Admin eurer Organisation." error={fe.contactEmail}>
        <Input id="contactEmail" name="contactEmail" defaultValue={state.values?.contactEmail} type="email" required autoComplete="email" inputMode="email" />
      </Field>
      <Field label="Nachricht (optional)" htmlFor="message" error={fe.message}>
        <Textarea id="message" name="message" defaultValue={state.values?.message} maxLength={2000} placeholder="Wer seid ihr, wie viele Leiter*innen …" />
      </Field>
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pendingText="Senden …">Antrag senden</SubmitButton>
    </form>
  );
}
