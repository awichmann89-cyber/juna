/** Darstellung von Aktionen – reine Funktionen, nutzbar auf Server und Client. */
import type { ActionStatus, SeriesColor } from "@/db/schema";

export const statusLabels: Record<ActionStatus, string> = {
  idee: "Idee",
  geplant: "Geplant",
  in_planung: "In Planung",
  durchgefuehrt: "Durchgeführt",
  abgeschlossen: "Abgeschlossen",
};

export const statusOrder: ActionStatus[] = ["idee", "geplant", "in_planung", "durchgefuehrt", "abgeschlossen"];

export const statusTone: Record<ActionStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  idee: "neutral",
  geplant: "primary",
  in_planung: "warning",
  durchgefuehrt: "success",
  abgeschlossen: "neutral",
};

export const seriesColorClass: Record<SeriesColor, string> = {
  orange: "bg-orange-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
  purple: "bg-violet-500",
  blue: "bg-sky-500",
  teal: "bg-teal-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  gray: "bg-stone-400",
};

export const seriesColorLabels: Record<SeriesColor, string> = {
  orange: "Orange",
  red: "Rot",
  pink: "Pink",
  purple: "Lila",
  blue: "Blau",
  teal: "Türkis",
  green: "Grün",
  yellow: "Gelb",
  gray: "Grau",
};

/** "YYYY-MM-DD" → Date (UTC-Mitternacht, damit keine Zeitzonenverschiebung entsteht) */
export function parseIsoDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Heutiges Datum in Europe/Berlin als "YYYY-MM-DD" */
export function todayIso(timeZone = "Europe/Berlin") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

const fmtLong = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const fmtDayMonth = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtMonthYear = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export function formatMonthYear(isoMonth: string) {
  return fmtMonthYear.format(parseIsoDate(`${isoMonth}-01`));
}

export function formatTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : null;
}

type DateLike = { date: string | null; endDate?: string | null; startTime?: string | null; endTime?: string | null };

export function formatActionDate(a: DateLike, style: "long" | "short" = "long") {
  if (!a.date) return "Noch kein Termin";
  const fmt = style === "long" ? fmtLong : fmtDayMonth;
  const start = fmt.format(parseIsoDate(a.date));
  if (a.endDate && a.endDate !== a.date) return `${start} – ${fmt.format(parseIsoDate(a.endDate))}`;
  return start;
}

export function formatActionTime(a: DateLike) {
  const s = formatTime(a.startTime);
  const e = formatTime(a.endTime);
  if (!s) return "ganztägig";
  return e ? `${s}–${e} Uhr` : `ab ${s} Uhr`;
}

/** Monat ("YYYY-MM") verschieben */
export function shiftMonth(isoMonth: string, delta: number) {
  const d = parseIsoDate(`${isoMonth}-01`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return toIsoDate(d).slice(0, 7);
}

/** Wochen (Mo–So) eines Monats als Raster von ISO-Daten */
export function monthGrid(isoMonth: string) {
  const first = parseIsoDate(`${isoMonth}-01`);
  const offset = (first.getUTCDay() + 6) % 7; // Montag = 0
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - offset);
  const weeks: string[][] = [];
  const cursor = new Date(start);
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toIsoDate(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (toIsoDate(cursor).slice(0, 7) === isoMonth);
  return weeks;
}
