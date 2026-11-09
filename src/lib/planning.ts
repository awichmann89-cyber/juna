/** Planungslogik (rein, ohne DB) – Zeitslots, Anwesenheit, Deadlines. Auf Server und Client nutzbar. */
import type { ParticipationStatus } from "@/db/schema";
import { parseIsoDate, toIsoDate } from "@/lib/action-format";

/** Lokale Wandzeit als "YYYY-MM-DD HH:MM:SS" (so liefert Postgres timestamp ohne Zeitzone) */
export type LocalTs = string;

export function localTs(date: string, time: string): LocalTs {
  return `${date} ${time.length === 5 ? `${time}:00` : time}`;
}

export function tsDate(ts: LocalTs) {
  return ts.slice(0, 10);
}

export function tsTime(ts: LocalTs) {
  return ts.slice(11, 16);
}

export function addDays(isoDate: string, days: number) {
  const d = parseIsoDate(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

/** Verschiebt einen lokalen Zeitstempel um ganze Tage */
export function shiftTs(ts: LocalTs, days: number): LocalTs {
  return `${addDays(tsDate(ts), days)}${ts.slice(10)}`;
}

/** Alle Tage einer (ggf. mehrtägigen) Aktion */
export function actionDays(date: string | null, endDate: string | null) {
  if (!date) return [];
  const days = [date];
  const last = endDate && endDate > date ? endDate : date;
  while (days.at(-1)! < last && days.length < 60) days.push(addDays(days.at(-1)!, 1));
  return days;
}

export type SlotLike = { id: string; startsAt: LocalTs; endsAt: LocalTs; minPeople: number | null };
export type ParticipantLike = {
  userId: string;
  status: ParticipationStatus;
  presentFrom: LocalTs | null;
  presentUntil: LocalTs | null;
};
export type OverrideLike = { slotId: string; userId: string; present: boolean };

/** Überschneidet sich das Anwesenheitsfenster mit dem Slot? (offene Grenzen = ganze Aktion) */
export function windowCoversSlot(p: Pick<ParticipantLike, "presentFrom" | "presentUntil">, slot: Pick<SlotLike, "startsAt" | "endsAt">) {
  const from = p.presentFrom ?? "0000-01-01 00:00:00";
  const until = p.presentUntil ?? "9999-12-31 23:59:59";
  return slot.startsAt < until && slot.endsAt > from;
}

export type SlotAttendance = {
  present: string[];
  maybe: string[];
  /** true, wenn eine Mindestbesetzung gesetzt ist und (sicher Anwesende) darunter liegen */
  understaffed: boolean;
};

/**
 * Leitet ab, wer in welchem Slot da ist:
 * - „dabei“ + Fenster überschneidet den Slot → anwesend
 * - „vielleicht“ + Fenster überschneidet → vielleicht
 * - Override pro Slot (raus/rein) hat Vorrang; „nicht dabei“ bleibt immer draußen
 */
export function slotAttendance(slots: SlotLike[], participants: ParticipantLike[], overrides: OverrideLike[]) {
  const ov = new Map(overrides.map((o) => [`${o.slotId}:${o.userId}`, o.present]));
  const result = new Map<string, SlotAttendance>();
  for (const slot of slots) {
    const present: string[] = [];
    const maybe: string[] = [];
    for (const p of participants) {
      if (p.status === "nicht_dabei") continue;
      const override = ov.get(`${slot.id}:${p.userId}`);
      const inSlot = override ?? windowCoversSlot(p, slot);
      if (!inSlot) continue;
      (p.status === "dabei" ? present : maybe).push(p.userId);
    }
    result.set(slot.id, {
      present,
      maybe,
      understaffed: slot.minPeople != null && present.length < slot.minPeople,
    });
  }
  return result;
}

/** Ist der User laut Ableitung (ohne Override) im Slot? */
export function derivedPresence(p: ParticipantLike | undefined, slot: SlotLike) {
  return Boolean(p && p.status !== "nicht_dabei" && windowCoversSlot(p, slot));
}

// --- Aufgaben ------------------------------------------------------------------

export type TaskDueLike = { dueDaysBefore: number | null; dueDate: string | null };

/** Effektive Deadline: relativ zum (Start-)Datum der Aktion oder absolut */
export function taskDueDate(task: TaskDueLike, actionDate: string | null): string | null {
  if (task.dueDate) return task.dueDate;
  if (task.dueDaysBefore != null && actionDate) return addDays(actionDate, -task.dueDaysBefore);
  return null;
}

export type DueBucket = "ueberfaellig" | "heute" | "woche" | "spaeter" | "ohne";

export const dueBucketLabels: Record<DueBucket, string> = {
  ueberfaellig: "Überfällig",
  heute: "Heute fällig",
  woche: "In den nächsten 7 Tagen",
  spaeter: "Später",
  ohne: "Ohne Deadline",
};

export function dueBucket(due: string | null, today: string): DueBucket {
  if (!due) return "ohne";
  if (due < today) return "ueberfaellig";
  if (due === today) return "heute";
  if (due <= addDays(today, 7)) return "woche";
  return "spaeter";
}

export function formatDueRelative(due: string, today: string) {
  const d = daysBetween(today, due);
  if (d === 0) return "heute";
  if (d === 1) return "morgen";
  if (d === -1) return "gestern";
  return d > 0 ? `in ${d} Tagen` : `vor ${-d} Tagen`;
}

export const participationLabels: Record<ParticipationStatus, string> = {
  dabei: "Dabei",
  vielleicht: "Vielleicht",
  nicht_dabei: "Nicht dabei",
};
