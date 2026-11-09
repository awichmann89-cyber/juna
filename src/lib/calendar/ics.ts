/**
 * Minimaler iCalendar-Writer (RFC 5545) für Abo-Feeds.
 * - Zeiten mit Uhrzeit werden als UTC (…Z) ausgegeben → keine VTIMEZONE nötig, iOS/Google rechnen lokal um
 * - Ganztägige Termine als DATE (DTEND exklusiv)
 * - Text-Escaping und Zeilenfaltung nach 75 Oktetten (UTF-8-sicher)
 */

export type IcsDate = { kind: "date"; date: string } | { kind: "utc"; at: Date };

export type IcsEvent = {
  uid: string;
  summary: string;
  start: IcsDate;
  end: IcsDate;
  description?: string;
  location?: string | null;
  url?: string;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  sequence?: number;
  lastModified?: Date;
  categories?: string[];
  /** Ohne Belegt-Status (z. B. Deadlines), damit sie Kalender nicht als „beschäftigt“ blockieren */
  transparent?: boolean;
};

export type IcsCalendar = {
  name: string;
  description?: string;
  timezone?: string;
  events: IcsEvent[];
  now: Date;
};

export function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,");
}

/** Faltet eine Inhaltszeile auf max. 75 Oktette pro Zeile, ohne UTF-8-Zeichen zu zerteilen */
export function foldLine(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // Folgezeilen beginnen mit einem Leerzeichen
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function formatUtc(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function formatDate(iso: string) {
  return iso.replace(/-/g, "");
}

function dateProp(name: string, d: IcsDate) {
  return d.kind === "date" ? `${name};VALUE=DATE:${formatDate(d.date)}` : `${name}:${formatUtc(d.at)}`;
}

function eventLines(e: IcsEvent, now: Date) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${formatUtc(now)}`,
    dateProp("DTSTART", e.start),
    dateProp("DTEND", e.end),
    `SUMMARY:${escapeText(e.summary)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.status) lines.push(`STATUS:${e.status}`);
  if (e.sequence != null) lines.push(`SEQUENCE:${Math.max(0, Math.floor(e.sequence))}`);
  if (e.lastModified) lines.push(`LAST-MODIFIED:${formatUtc(e.lastModified)}`);
  if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(escapeText).join(",")}`);
  lines.push(`TRANSP:${e.transparent ? "TRANSPARENT" : "OPAQUE"}`);
  lines.push("END:VEVENT");
  return lines;
}

export function renderCalendar(cal: IcsCalendar) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//juna//juna.app//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(cal.name)}`,
    `NAME:${escapeText(cal.name)}`,
  ];
  if (cal.description) lines.push(`X-WR-CALDESC:${escapeText(cal.description)}`);
  if (cal.timezone) lines.push(`X-WR-TIMEZONE:${cal.timezone}`);
  // Hinweis an Clients, wie oft sie neu laden sollen (Google ignoriert das, iOS/Outlook beachten es teilweise)
  lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H");
  for (const e of cal.events) lines.push(...eventLines(e, cal.now));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// --- Zeitzonen ----------------------------------------------------------------

/** Offset (ms) der Zeitzone zum Zeitpunkt `at` */
function tzOffset(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at.getTime();
}

/**
 * Lokale Wandzeit ("YYYY-MM-DD HH:MM[:SS]") in einer Zeitzone → UTC-Zeitpunkt.
 * Bei der Zeitumstellung: nicht existierende Zeiten (Frühjahr) werden nach vorn verschoben,
 * doppelte Zeiten (Herbst) eindeutig auf eine der beiden Varianten abgebildet.
 */
export function zonedToUtc(local: string, timeZone: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) throw new Error(`Ungültige lokale Zeit: ${local}`);
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  // Zwei Iterationen genügen für alle realen Zeitzonen
  const first = wall - tzOffset(new Date(wall), timeZone);
  const second = wall - tzOffset(new Date(first), timeZone);
  if (first === second) return new Date(first);
  // Umstellung: die kleinere UTC-Zeit, deren Wandzeit wieder passt, sonst die spätere (Lücke)
  const candidates = [Math.min(first, second), Math.max(first, second)];
  for (const c of candidates) if (c + tzOffset(new Date(c), timeZone) === wall) return new Date(c);
  return new Date(Math.max(first, second));
}
