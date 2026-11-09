"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { copyFromPrevious, type PlanFormState } from "@/app/(app)/aktionen/planning-actions";
import { Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";

type Source = { id: string; title: string; dateLabel: string; slots: number; tasks: number; planners: number; hasNotes: boolean };

/** Aufklappbarer Rahmen; Zustand bleibt beim Neurendern nach dem Übernehmen erhalten */
export function CopyPanelBox(props: { actionId: string; sources: Source[]; targetHasNotes: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(props.defaultOpen);
  if (props.sources.length === 0) return null;
  return (
    <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 text-left font-bold">
        <Copy className="size-4 text-primary" aria-hidden /> Von früherer Durchführung übernehmen
        <span className="ml-auto text-sm font-semibold text-muted">{open ? "Schließen" : "Öffnen"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <CopyPanel actionId={props.actionId} sources={props.sources} targetHasNotes={props.targetHasNotes} />
        </div>
      )}
    </div>
  );
}

/** „Von früherer Durchführung übernehmen“ – Quelle wählen, Bereiche ankreuzen */
export function CopyPanel({ actionId, sources, targetHasNotes }: { actionId: string; sources: Source[]; targetHasNotes: boolean }) {
  const [state, action] = useActionState<PlanFormState, FormData>(copyFromPrevious, {});
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const src = sources.find((s) => s.id === sourceId);
  if (sources.length === 0) return null;
  const parts = [
    { key: "zeitplan", label: "Zeitplan", count: src?.slots ?? 0, hint: "auf das neue Datum verschoben" },
    { key: "aufgaben", label: "Aufgaben", count: src?.tasks ?? 0, hint: "offen, Deadlines relativ, ohne Zuständige" },
    { key: "planungsteam", label: "Planungsteam", count: src?.planners ?? 0, hint: "" },
    { key: "notizen", label: "Planung", count: src?.hasNotes && !targetHasNotes ? 1 : 0, hint: targetHasNotes ? "nur wenn hier noch nichts geplant ist" : "Text und Aufgaben-Blöcke als Ausgangsbasis" },
  ];
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="actionId" value={actionId} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Quelle
        <Select name="sourceId" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          {sources.map((s, i) => (
            <option key={s.id} value={s.id}>
              {s.title} · {s.dateLabel}
              {i === 0 ? " (zuletzt)" : ""}
            </option>
          ))}
        </Select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Übernehmen</legend>
        {parts.map((p) => (
          <label key={p.key} className={`flex items-start gap-2 text-sm ${p.count === 0 ? "opacity-50" : ""}`}>
            <input type="checkbox" name="part" value={p.key} defaultChecked={p.count > 0} disabled={p.count === 0} className="mt-1 size-4 accent-[var(--primary)]" />
            <span>
              <b>{p.label}</b>
              {p.key !== "notizen" && p.key !== "planungsteam" ? ` (${p.count})` : ""}
              {p.hint && <span className="block text-xs text-muted">{p.hint}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton size="sm" variant="secondary" className="self-start" pendingText="Übernehmen …">
        <Copy className="size-4" aria-hidden /> Übernehmen
      </SubmitButton>
    </form>
  );
}
