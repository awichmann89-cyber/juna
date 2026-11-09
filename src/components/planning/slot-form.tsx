"use client";

import { useActionState } from "react";
import { saveSlot, type PlanFormState } from "@/app/(app)/aktionen/planning-actions";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function SlotForm({
  actionId,
  days,
  slot,
  onDone,
}: {
  actionId: string;
  days: string[];
  slot?: { id: string; title: string; day: string; start: string; end: string; minPeople: number | null; description: string | null };
  onDone?: () => void;
}) {
  const [state, action] = useActionState<PlanFormState, FormData>(async (prev, fd) => {
    const res = await saveSlot(prev, fd);
    if (res.ok) onDone?.();
    return res;
  }, {});
  const v = state.values;
  const p = slot?.id ?? "neu";
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3" key={state.ok ?? JSON.stringify(v ?? {})}>
      {state.ok && !slot && <Alert tone="success">{state.ok}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="actionId" value={actionId} />
      {slot && <input type="hidden" name="slotId" value={slot.id} />}
      <Field label="Programmpunkt" htmlFor={`${p}-title`} error={fe.title}>
        <Input id={`${p}-title`} name="title" required maxLength={120} placeholder="z. B. Aufbau" defaultValue={v?.title ?? slot?.title} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {days.length > 1 ? (
          <Field label="Tag" htmlFor={`${p}-day`} className="col-span-2 sm:col-span-1">
            <Select id={`${p}-day`} name="day" defaultValue={v?.day ?? slot?.day ?? days[0]}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {dayFmt.format(new Date(`${d}T00:00:00Z`))}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="day" value={days[0]} />
        )}
        <Field label="Von" htmlFor={`${p}-start`} error={fe.start}>
          <Input id={`${p}-start`} name="start" type="time" step={300} required defaultValue={v?.start ?? slot?.start} />
        </Field>
        <Field label="Bis" htmlFor={`${p}-end`} error={fe.end}>
          <Input id={`${p}-end`} name="end" type="time" step={300} required defaultValue={v?.end ?? slot?.end} />
        </Field>
        <Field label="Min. Personen" htmlFor={`${p}-min`} error={fe.minPeople}>
          <Input
            id={`${p}-min`}
            name="minPeople"
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            placeholder="–"
            defaultValue={v?.minPeople ?? slot?.minPeople ?? ""}
          />
        </Field>
      </div>
      <Field label="Beschreibung (optional)" htmlFor={`${p}-desc`}>
        <Input id={`${p}-desc`} name="description" maxLength={1000} defaultValue={v?.description ?? slot?.description ?? ""} />
      </Field>
      <SubmitButton size="sm" className="self-start" pendingText="Speichern …">
        {slot ? "Speichern" : "Zum Zeitplan hinzufügen"}
      </SubmitButton>
    </form>
  );
}
