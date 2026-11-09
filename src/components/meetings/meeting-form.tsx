"use client";

import { useActionState } from "react";
import { createMeeting, updateMeeting, type MeetingFormState } from "@/app/(app)/leiterrunde/actions";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

type MeetingDefaults = {
  id: string;
  type: string;
  title: string;
  date: string;
  startTime: string | null;
  location: string | null;
  protocolOwner: string | null;
};

export function MeetingForm({
  members,
  meeting,
  defaultDate,
}: {
  members: { id: string; name: string }[];
  meeting?: MeetingDefaults;
  defaultDate?: string;
}) {
  const [state, action] = useActionState<MeetingFormState, FormData>(meeting ? updateMeeting : createMeeting, {});
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  const p = meeting ? `m-${meeting.id}` : "m-neu";
  return (
    <form action={action} className="flex flex-col gap-3" key={state.ok ?? JSON.stringify(v ?? {})}>
      {state.ok && <p className="text-sm font-semibold text-success">{state.ok}</p>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {meeting && <input type="hidden" name="meetingId" value={meeting.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Art" htmlFor={`${p}-type`}>
          <Select id={`${p}-type`} name="type" defaultValue={v?.type ?? meeting?.type ?? "monatstreffen"}>
            <option value="monatstreffen">Monatstreffen</option>
            <option value="jahresplanung">Jahresplanung</option>
            <option value="sonstiges">Sonstiges Treffen</option>
          </Select>
        </Field>
        <Field label="Titel" htmlFor={`${p}-title`} hint={meeting ? undefined : "Leer lassen für „Monatstreffen November 2026“"} error={fe.title}>
          <Input id={`${p}-title`} name="title" maxLength={160} defaultValue={v?.title ?? meeting?.title} />
        </Field>
        <Field label="Datum" htmlFor={`${p}-date`} error={fe.date}>
          <Input id={`${p}-date`} name="date" type="date" required defaultValue={v?.date ?? meeting?.date ?? defaultDate} />
        </Field>
        <Field label="Beginn" htmlFor={`${p}-start`} error={fe.startTime}>
          <Input id={`${p}-start`} name="startTime" type="time" defaultValue={v?.startTime ?? meeting?.startTime?.slice(0, 5) ?? ""} />
        </Field>
        <Field label="Ort" htmlFor={`${p}-location`} error={fe.location}>
          <Input id={`${p}-location`} name="location" maxLength={200} placeholder="z. B. Jugendraum" defaultValue={v?.location ?? meeting?.location ?? ""} />
        </Field>
        <Field label="Protokoll" htmlFor={`${p}-owner`} hint="Wer schreibt mit und erfasst die Anwesenheit?">
          <Select id={`${p}-owner`} name="protocolOwner" defaultValue={v?.protocolOwner ?? meeting?.protocolOwner ?? ""}>
            <option value="">– noch offen –</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!meeting && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="autoAgenda" defaultChecked className="mt-0.5 size-4 accent-[var(--color-primary)]" />
          <span>
            <span className="font-semibold">Agenda automatisch vorschlagen</span>
            <span className="block text-muted">Feedback zu vergangenen Aktionen ohne Rückmeldung und die anstehenden Aktionen.</span>
          </span>
        </label>
      )}
      <div>
        <SubmitButton pendingText="Speichert …">{meeting ? "Speichern" : "Treffen anlegen"}</SubmitButton>
      </div>
    </form>
  );
}
