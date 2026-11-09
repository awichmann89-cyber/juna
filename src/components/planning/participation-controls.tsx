"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, CircleHelp, Clock, LoaderCircle, X } from "lucide-react";
import {
  setParticipation,
  setPlanners,
  setPresenceWindow,
  setSlotOverride,
  type PlanFormState,
} from "@/app/(app)/aktionen/planning-actions";
import type { ParticipationStatus } from "@/db/schema";
import { Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

const options: { value: ParticipationStatus; label: string; icon: typeof Check; active: string }[] = [
  { value: "dabei", label: "Dabei", icon: Check, active: "bg-success text-white" },
  { value: "vielleicht", label: "Vielleicht", icon: CircleHelp, active: "bg-warning text-white" },
  { value: "nicht_dabei", label: "Nicht dabei", icon: X, active: "bg-danger text-white" },
];

function StatusButtons({ current, size }: { current: ParticipationStatus | null; size: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <div className={cn("inline-flex rounded-xl bg-surface-2 p-1", pending && "opacity-60")} role="group" aria-label="Teilnahme">
      {options.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="submit"
            name="status"
            // Erneutes Tippen auf den aktiven Status setzt zurück auf „offen“
            value={active ? "" : o.value}
            disabled={pending}
            aria-pressed={active}
            title={active ? `${o.label} – erneut tippen zum Zurücksetzen` : o.label}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg font-semibold transition-colors",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? o.active : "text-muted hover:bg-surface hover:text-fg",
            )}
          >
            <o.icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
            <span className={size === "sm" ? "sr-only sm:not-sr-only" : undefined}>{o.label}</span>
          </button>
        );
      })}
      {pending && <LoaderCircle className="ml-1 size-4 animate-spin self-center text-muted" aria-hidden />}
    </div>
  );
}

export function ParticipationButtons({
  actionId,
  userId,
  current,
  size = "md",
}: {
  actionId: string;
  userId: string;
  current: ParticipationStatus | null;
  size?: "sm" | "md";
}) {
  return (
    <form action={setParticipation}>
      <input type="hidden" name="actionId" value={actionId} />
      <input type="hidden" name="userId" value={userId} />
      <StatusButtons current={current} size={size} />
    </form>
  );
}

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function WindowForm({
  actionId,
  userId,
  days,
  from,
  until,
}: {
  actionId: string;
  userId: string;
  days: string[];
  from: { day: string; time: string } | null;
  until: { day: string; time: string } | null;
}) {
  const [state, action] = useActionState<PlanFormState, FormData>(setPresenceWindow, {});
  const multi = days.length > 1;
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="actionId" value={actionId} />
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Komme ab
          <span className="flex gap-1.5">
            {multi && (
              <Select name="fromDay" defaultValue={from?.day ?? days[0]} className="h-9 w-32 text-sm">
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayFmt.format(new Date(`${d}T00:00:00Z`))}
                  </option>
                ))}
              </Select>
            )}
            <Input name="fromTime" type="time" step={300} defaultValue={from?.time ?? ""} className="h-9 w-32 text-sm" />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Gehe um
          <span className="flex gap-1.5">
            {multi && (
              <Select name="untilDay" defaultValue={until?.day ?? days.at(-1)} className="h-9 w-32 text-sm">
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayFmt.format(new Date(`${d}T00:00:00Z`))}
                  </option>
                ))}
              </Select>
            )}
            <Input name="untilTime" type="time" step={300} defaultValue={until?.time ?? ""} className="h-9 w-32 text-sm" />
          </span>
        </label>
        <SubmitButton size="sm" variant="secondary" pendingText="…">
          <Clock className="size-4" aria-hidden /> Speichern
        </SubmitButton>
      </div>
      <p className="text-xs text-muted">Leer lassen = die ganze Aktion. {state.ok && <span className="font-semibold text-success">{state.ok}</span>}</p>
    </form>
  );
}

export function SlotOverrideButtons({
  actionId,
  userId,
  slotId,
  derived,
  override,
}: {
  actionId: string;
  userId: string;
  slotId: string;
  derived: boolean;
  override: boolean | undefined;
}) {
  const effective = override ?? derived;
  return (
    <form action={setSlotOverride} className="inline-flex items-center gap-1">
      <input type="hidden" name="actionId" value={actionId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="slotId" value={slotId} />
      <button
        type="submit"
        name="present"
        // Klick schaltet um; landet man wieder bei der Ableitung, wird der Override entfernt
        value={!effective === derived ? "" : String(!effective)}
        className={cn(
          "rounded-full px-2.5 py-0.5 text-xs font-semibold",
          effective ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted line-through",
        )}
        title={override === undefined ? "automatisch aus dem Anwesenheitsfenster" : "manuell festgelegt – klicken zum Umschalten"}
      >
        {effective ? "dabei" : "nicht dabei"}
        {override !== undefined && " ✎"}
      </button>
    </form>
  );
}

export function PlannersForm({
  actionId,
  members,
  selected,
}: {
  actionId: string;
  members: { id: string; name: string }[];
  selected: string[];
}) {
  const [state, action] = useActionState<PlanFormState, FormData>(setPlanners, {});
  const [open, setOpen] = useState(selected.length === 0);
  const names = members.filter((m) => selected.includes(m.id)).map((m) => m.name);
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {names.map((n) => (
          <span key={n} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-sm font-semibold text-primary">
            {n}
          </span>
        ))}
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-primary hover:underline">
          Ändern
        </button>
        {state.ok && <span className="text-xs font-semibold text-success">{state.ok}</span>}
      </div>
    );
  }
  return (
    <form
      action={async (fd) => {
        await action(fd);
        setOpen(false);
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="actionId" value={actionId} />
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <label key={m.id} className="cursor-pointer">
            <input type="checkbox" name="planner" value={m.id} defaultChecked={selected.includes(m.id)} className="peer sr-only" />
            <span className="block rounded-full border border-border px-3 py-1 text-sm font-semibold text-muted peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {m.name}
            </span>
          </label>
        ))}
      </div>
      <SubmitButton size="sm" className="self-start" pendingText="Speichern …">
        Planungsteam speichern
      </SubmitButton>
    </form>
  );
}
