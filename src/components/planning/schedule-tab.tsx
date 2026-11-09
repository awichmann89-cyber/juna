import { CalendarClock, Pencil, Trash2, TriangleAlert, Users } from "lucide-react";
import { deleteSlot } from "@/app/(app)/aktionen/planning-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import type { ActionDetail } from "@/lib/actions-data";
import type { Member, Planning } from "@/lib/planning-data";
import { actionDays, slotAttendance, tsDate, tsTime } from "@/lib/planning";
import { cn } from "@/lib/utils";
import { SlotForm } from "./slot-form";

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function NameChips({ ids, names, tone = "solid" }: { ids: string[]; names: Map<string, string>; tone?: "solid" | "dashed" }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <li
          key={id}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            tone === "solid" ? "bg-primary-soft text-primary" : "border border-dashed border-border text-muted",
          )}
        >
          {names.get(id) ?? "?"}
        </li>
      ))}
    </ul>
  );
}

export function ScheduleTab({ action, planning, members }: { action: ActionDetail; planning: Planning; members: Member[] }) {
  if (!action.date) {
    return (
      <EmptyState icon={<CalendarClock className="size-6" />} title="Noch kein Datum">
        Lege zuerst ein Datum fest, dann kannst du einen Zeitplan erstellen.
      </EmptyState>
    );
  }
  const days = actionDays(action.date, action.endDate);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const attendance = slotAttendance(planning.slots, planning.participants, planning.overrides);
  const byDay = new Map<string, typeof planning.slots>();
  for (const s of planning.slots) byDay.set(tsDate(s.startsAt), [...(byDay.get(tsDate(s.startsAt)) ?? []), s]);

  return (
    <div className="flex flex-col gap-4">
      {planning.slots.length === 0 ? (
        <EmptyState icon={<CalendarClock className="size-6" />} title="Noch kein Zeitplan">
          Teile die Aktion in Programmpunkte wie Aufbau, Durchführung und Abbau. Wer dabei ist, wird automatisch den
          passenden Zeitslots zugeordnet – auch wer später kommt oder früher geht.
        </EmptyState>
      ) : (
        [...byDay.entries()].map(([day, slots]) => (
          <section key={day}>
            {days.length > 1 && <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{dayFmt.format(new Date(`${day}T00:00:00Z`))}</h3>}
            <ol className="flex flex-col gap-3">
              {slots.map((s) => {
                const att = attendance.get(s.id)!;
                return (
                  <li key={s.id}>
                    <Card className={cn(att.understaffed && "border-warning")}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <div className="w-24 shrink-0 text-sm font-bold tabular-nums">
                            {tsTime(s.startsAt)}–{tsTime(s.endsAt)}
                            {tsDate(s.endsAt) !== tsDate(s.startsAt) && <span className="block text-xs font-semibold text-muted">(+1 Tag)</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold">{s.title}</div>
                            {s.description && <p className="text-sm text-muted">{s.description}</p>}
                            <div className="mt-2 flex flex-col gap-1.5">
                              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                                <Users className="size-3.5" aria-hidden />
                                {att.present.length} dabei
                                {s.minPeople != null && ` / mind. ${s.minPeople}`}
                                {att.maybe.length > 0 && ` · ${att.maybe.length} vielleicht`}
                                {att.understaffed && (
                                  <span className="inline-flex items-center gap-1 text-warning">
                                    <TriangleAlert className="size-3.5" aria-hidden /> unterbesetzt
                                  </span>
                                )}
                              </div>
                              {att.present.length > 0 && <NameChips ids={att.present} names={names} />}
                              {att.maybe.length > 0 && <NameChips ids={att.maybe} names={names} tone="dashed" />}
                            </div>
                          </div>
                        </div>
                        <details className="group mt-3 border-t border-border pt-2">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
                            <Pencil className="size-3.5" aria-hidden /> Bearbeiten
                          </summary>
                          <div className="mt-3 flex flex-col gap-3">
                            <SlotForm
                              actionId={action.id}
                              days={days}
                              slot={{
                                id: s.id,
                                title: s.title,
                                day: tsDate(s.startsAt),
                                start: tsTime(s.startsAt),
                                end: tsTime(s.endsAt),
                                minPeople: s.minPeople,
                                description: s.description,
                              }}
                            />
                            <form action={deleteSlot}>
                              <input type="hidden" name="actionId" value={action.id} />
                              <input type="hidden" name="slotId" value={s.id} />
                              <ConfirmSubmit confirm={`„${s.title}“ aus dem Zeitplan löschen?`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger hover:underline">
                                <Trash2 className="size-3.5" aria-hidden /> Löschen
                              </ConfirmSubmit>
                            </form>
                          </div>
                        </details>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Programmpunkt hinzufügen</CardTitle>
        </CardHeader>
        <CardContent>
          <SlotForm actionId={action.id} days={days} />
        </CardContent>
      </Card>
    </div>
  );
}
