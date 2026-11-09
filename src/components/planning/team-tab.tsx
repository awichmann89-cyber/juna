import { History, UserRoundCheck, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Badge, EmptyState } from "@/components/ui/feedback";
import type { ActionDetail } from "@/lib/actions-data";
import type { OrgUser } from "@/lib/auth";
import type { Member, Planning } from "@/lib/planning-data";
import { actionDays, derivedPresence, participationLabels, tsDate, tsTime } from "@/lib/planning";
import { ParticipationButtons, PlannersForm, SlotOverrideButtons, WindowForm } from "./participation-controls";

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const changedFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

function formatWindow(from: string | null, until: string | null, multiDay: boolean) {
  const fmt = (ts: string) => (multiDay ? `${dayFmt.format(new Date(`${tsDate(ts)}T00:00:00Z`))} ${tsTime(ts)}` : tsTime(ts));
  if (from && until) return `${fmt(from)}–${fmt(until)} Uhr`;
  if (from) return `kommt ab ${fmt(from)} Uhr`;
  if (until) return `geht um ${fmt(until)} Uhr`;
  return null;
}

export function TeamTab({
  user,
  action,
  planning,
  members,
}: {
  user: OrgUser;
  action: ActionDetail;
  planning: Planning;
  members: Member[];
}) {
  const days = actionDays(action.date, action.endDate);
  const multiDay = days.length > 1;
  const byUser = new Map(planning.participants.map((p) => [p.userId, p]));
  const overrides = new Map(planning.overrides.map((o) => [`${o.slotId}:${o.userId}`, o.present]));
  // Deaktivierte nur zeigen, wenn sie schon eingetragen sind
  const visible = members.filter((m) => m.status !== "deactivated" || byUser.has(m.id));
  const counts = { dabei: 0, vielleicht: 0, nicht_dabei: 0 };
  for (const p of planning.participants) counts[p.status]++;
  const open = visible.filter((m) => !byUser.has(m.id) && m.status !== "deactivated").length;
  const me = byUser.get(user.id);
  const names = new Map(members.map((m) => [m.id, m.name]));

  const split = (ts: string | null) => (ts ? { day: tsDate(ts), time: tsTime(ts) } : null);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRoundCheck className="size-5 text-primary" aria-hidden /> Meine Teilnahme
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ParticipationButtons actionId={action.id} userId={user.id} current={me?.status ?? null} />
          {action.date && me && me.status !== "nicht_dabei" && (
            <WindowForm actionId={action.id} userId={user.id} days={days} from={split(me.presentFrom)} until={split(me.presentUntil)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planungsteam</CardTitle>
          <CardDescription>Verantwortlich für die Aktion – wird bei kurzfristigen Absagen benachrichtigt (ab Phase 6).</CardDescription>
        </CardHeader>
        <CardContent>
          <PlannersForm
            actionId={action.id}
            members={visible.filter((m) => m.status !== "deactivated").map((m) => ({ id: m.id, name: m.name }))}
            selected={planning.planners}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-5 text-primary" aria-hidden /> Wer ist dabei?
          </CardTitle>
          <CardDescription>
            {counts.dabei} dabei · {counts.vielleicht} vielleicht · {counts.nicht_dabei} nicht dabei · {open} offen. Jede*r kann
            hier eintragen – z. B. der Protokollführer im Treffen.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          {visible.length === 0 ? (
            <EmptyState title="Noch keine Mitglieder" />
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((m) => {
                const p = byUser.get(m.id);
                const window = p ? formatWindow(p.presentFrom, p.presentUntil, multiDay) : null;
                return (
                  <li key={m.id} className="flex flex-col gap-2 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Avatar name={m.name} className="size-8 text-xs" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{m.name}</span>
                          {m.id === user.id && <span className="text-xs text-muted">(du)</span>}
                          {planning.planners.includes(m.id) && <Badge tone="primary">Planungsteam</Badge>}
                          {window && <Badge tone="warning">{window}</Badge>}
                        </div>
                        {p?.updatedByName && (
                          <div className="text-xs text-muted">
                            {p.updatedBy === m.id ? "selbst eingetragen" : `eingetragen von ${p.updatedByName}`} · {changedFmt.format(p.updatedAt)}
                          </div>
                        )}
                      </div>
                      <ParticipationButtons actionId={action.id} userId={m.id} current={p?.status ?? null} size="sm" />
                    </div>
                    {p && p.status !== "nicht_dabei" && action.date && (
                      <details className="ml-11">
                        <summary className="cursor-pointer list-none text-xs font-semibold text-primary hover:underline [&::-webkit-details-marker]:hidden">
                          Zeiten{planning.slots.length > 0 ? " & Zeitslots" : ""} anpassen
                        </summary>
                        <div className="mt-2 flex flex-col gap-3">
                          <WindowForm actionId={action.id} userId={m.id} days={days} from={split(p.presentFrom)} until={split(p.presentUntil)} />
                          {planning.slots.length > 0 && (
                            <ul className="flex flex-col gap-1.5">
                              {planning.slots.map((s) => (
                                <li key={s.id} className="flex items-center gap-2 text-sm">
                                  <span className="w-24 shrink-0 tabular-nums text-muted">
                                    {tsTime(s.startsAt)}–{tsTime(s.endsAt)}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                                  <SlotOverrideButtons
                                    actionId={action.id}
                                    userId={m.id}
                                    slotId={s.id}
                                    derived={derivedPresence(p, s)}
                                    override={overrides.get(`${s.id}:${m.id}`)}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {planning.history.length > 0 && (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold [&::-webkit-details-marker]:hidden">
            <History className="size-4" aria-hidden /> Änderungsverlauf ({planning.history.length})
          </summary>
          <ol className="mt-3 flex flex-col gap-1.5 text-sm">
            {planning.history.map((h) => (
              <li key={h.id} className="flex flex-wrap gap-x-2 text-muted">
                <span className="tabular-nums">{changedFmt.format(h.changedAt)}</span>
                <span className="text-fg">
                  <b>{h.userName ?? names.get(h.userId) ?? "?"}</b>:{" "}
                  {h.oldStatus ? participationLabels[h.oldStatus] : "offen"} → {h.newStatus ? participationLabels[h.newStatus] : "offen"}
                  {h.newStatus && h.newStatus === h.oldStatus && " (Zeiten geändert)"}
                </span>
                <span>{h.changedBy === h.userId ? "selbst" : `von ${h.changedByName ?? "?"}`}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
