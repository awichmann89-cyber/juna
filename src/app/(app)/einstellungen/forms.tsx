"use client";

import { useActionState } from "react";
import { updateOrganization, updateProfile, type SettingsState } from "./actions";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";

const times = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

export function ProfileForm({ displayName, reminderTime }: { displayName: string; reminderTime: string }) {
  const [state, action] = useActionState<SettingsState, FormData>(updateProfile, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok && <Alert tone="success">Gespeichert.</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="Anzeigename" htmlFor="displayName" error={state.fieldErrors?.displayName}>
        <Input id="displayName" name="displayName" defaultValue={displayName} required maxLength={80} />
      </Field>
      <Field
        label="Erinnerungszeit"
        htmlFor="reminderTime"
        hint="Zu dieser Uhrzeit bekommst du standardmäßig deine Erinnerungen (z. B. „3 Tage vor Deadline“)."
        error={state.fieldErrors?.reminderTime}
      >
        <Select id="reminderTime" name="reminderTime" defaultValue={reminderTime}>
          {times.map((t) => (
            <option key={t} value={t}>
              {t} Uhr
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton className="self-start" pendingText="Speichern …">
        Speichern
      </SubmitButton>
    </form>
  );
}

export function OrganizationForm({ name }: { name: string }) {
  const [state, action] = useActionState<SettingsState, FormData>(updateOrganization, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.ok && <Alert tone="success">Gespeichert.</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Field label="Name der Organisation" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={name} required maxLength={120} />
      </Field>
      <SubmitButton className="self-start" variant="secondary" pendingText="Speichern …">
        Speichern
      </SubmitButton>
    </form>
  );
}
