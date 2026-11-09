"use client";

import { useActionState, useState } from "react";
import { saveAction, type ActionFormState } from "@/app/(app)/aktionen/actions";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { LinkButton } from "@/components/ui/button";
import { statusLabels, statusOrder } from "@/lib/action-format";

export type ActionFormDefaults = {
  title?: string;
  status?: string;
  date?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  seriesId?: string | null;
};

type SeriesOption = { id: string; name: string; archived: boolean };

export function ActionForm({
  id,
  defaults,
  series,
  cancelHref,
}: {
  id?: string;
  defaults: ActionFormDefaults;
  series: SeriesOption[];
  cancelHref: string;
}) {
  const [state, action] = useActionState<ActionFormState, FormData>(saveAction, {});
  const v = state.values;
  const initial = {
    title: v?.title ?? defaults.title ?? "",
    status: v?.status ?? defaults.status ?? "geplant",
    date: v?.date ?? defaults.date ?? "",
    endDate: v?.endDate ?? defaults.endDate ?? "",
    startTime: v?.startTime ?? defaults.startTime?.slice(0, 5) ?? "",
    endTime: v?.endTime ?? defaults.endTime?.slice(0, 5) ?? "",
    location: v?.location ?? defaults.location ?? "",
    seriesId: v?.seriesId ?? defaults.seriesId ?? "",
    newSeriesName: v?.newSeriesName ?? "",
  };
  const [seriesId, setSeriesId] = useState(initial.seriesId);
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState(initial.status);
  const [multiDay, setMultiDay] = useState(Boolean(initial.endDate));
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5" key={JSON.stringify(state.values ?? {})}>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {id && <input type="hidden" name="id" value={id} />}

      <Field label="Titel" htmlFor="title" error={fe.title}>
        <Input
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={160}
          placeholder="z. B. Ausflug zum Kettlerhof"
          autoFocus={!id}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Aktionsreihe"
          htmlFor="seriesId"
          hint="Wiederkehrende Aktionen verbinden – so seht ihr Notizen und Feedback vom letzten Mal."
        >
          <Select
            id="seriesId"
            name="seriesId"
            value={seriesId}
            onChange={(e) => {
              setSeriesId(e.target.value);
              const s = series.find((x) => x.id === e.target.value);
              if (s && !title.trim()) setTitle(s.name);
            }}
          >
            <option value="">Keine Reihe</option>
            {series
              .filter((s) => !s.archived || s.id === seriesId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            <option value="__neu">＋ Neue Reihe …</option>
          </Select>
        </Field>
        {seriesId === "__neu" ? (
          <Field label="Name der neuen Reihe" htmlFor="newSeriesName" error={fe.newSeriesName}>
            <Input id="newSeriesName" name="newSeriesName" defaultValue={initial.newSeriesName || title} maxLength={120} required />
          </Field>
        ) : (
          <Field label="Status" htmlFor="status" error={fe.status}>
            <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOrder.map((s) => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {seriesId === "__neu" && (
        <Field label="Status" htmlFor="status" error={fe.status}>
          <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {statusOrder.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <fieldset className="flex flex-col gap-4 rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-bold">Termin</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={multiDay ? "Von" : "Datum"}
            htmlFor="date"
            error={fe.date}
            hint={status === "idee" ? "Für Ideen optional." : undefined}
          >
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={initial.date}
              onChange={(e) => {
                if (!e.target.value && status === "geplant") setStatus("idee");
                if (e.target.value && status === "idee") setStatus("geplant");
              }}
            />
          </Field>
          {multiDay ? (
            <Field label="Bis" htmlFor="endDate" error={fe.endDate}>
              <Input id="endDate" name="endDate" type="date" defaultValue={initial.endDate} />
            </Field>
          ) : (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setMultiDay(true)}
                className="h-11 text-sm font-semibold text-primary hover:underline"
              >
                ＋ mehrtägig
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Beginn" htmlFor="startTime" error={fe.startTime} hint="leer = ganztägig">
            <Input id="startTime" name="startTime" type="time" step={300} defaultValue={initial.startTime} />
          </Field>
          <Field label="Ende" htmlFor="endTime" error={fe.endTime}>
            <Input id="endTime" name="endTime" type="time" step={300} defaultValue={initial.endTime} />
          </Field>
        </div>
      </fieldset>

      <Field label="Ort" htmlFor="location" error={fe.location}>
        <Input id="location" name="location" defaultValue={initial.location} maxLength={200} placeholder="z. B. Pfarrheim" />
      </Field>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <LinkButton href={cancelHref} variant="secondary">
          Abbrechen
        </LinkButton>
        <SubmitButton pendingText="Speichern …">{id ? "Speichern" : "Aktion anlegen"}</SubmitButton>
      </div>
    </form>
  );
}
