"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type FormState } from "../actions";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";

export function LoginForm({ weiter, notice }: { weiter?: string; notice?: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {notice && !state.error && <Alert tone="error">{notice}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="weiter" value={weiter ?? ""} />
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
          key={state.values?.email}
        />
      </Field>
      <Field label="Passwort" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton pendingText="Anmelden …">Anmelden</SubmitButton>
      <Link href="/passwort-vergessen" className="text-center text-sm font-semibold text-primary hover:underline">
        Passwort vergessen?
      </Link>
    </form>
  );
}
