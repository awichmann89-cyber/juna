"use client";

import { useActionState } from "react";
import { saveSeries, type SeriesFormState } from "@/app/(app)/aktionen/actions";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { seriesColorClass, seriesColorLabels } from "@/lib/action-format";
import { seriesColors, type SeriesColor } from "@/db/schema";
import { cn } from "@/lib/utils";

export function SeriesForm({
  series,
  submitLabel,
}: {
  series?: { id: string; name: string; description: string | null; color: SeriesColor };
  submitLabel: string;
}) {
  const [state, action] = useActionState<SeriesFormState, FormData>(saveSeries, {});
  const v = state.values;
  const prefix = series?.id ?? "neu";
  return (
    <form action={action} className="flex flex-col gap-4" key={state.ok ?? JSON.stringify(v ?? {})}>
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {series && <input type="hidden" name="id" value={series.id} />}
      <Field label="Name" htmlFor={`${prefix}-name`} error={state.fieldErrors?.name}>
        <Input
          id={`${prefix}-name`}
          name="name"
          required
          maxLength={120}
          defaultValue={v?.name ?? (state.ok && !series ? "" : series?.name)}
          placeholder="z. B. Kuchenverkauf"
        />
      </Field>
      <Field label="Beschreibung (optional)" htmlFor={`${prefix}-description`} error={state.fieldErrors?.description}>
        <Textarea
          id={`${prefix}-description`}
          name="description"
          maxLength={2000}
          className="min-h-20"
          defaultValue={v?.description ?? (state.ok && !series ? "" : (series?.description ?? ""))}
          placeholder="Worum geht's, wie oft findet sie statt …"
        />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Farbe</legend>
        <div className="flex flex-wrap gap-2">
          {seriesColors.map((c) => (
            <label key={c} className="cursor-pointer" title={seriesColorLabels[c]}>
              <input
                type="radio"
                name="color"
                value={c}
                defaultChecked={(v?.color ?? series?.color ?? "orange") === c}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "block size-8 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  seriesColorClass[c],
                )}
              />
              <span className="sr-only">{seriesColorLabels[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton className="self-start" pendingText="Speichern …">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
