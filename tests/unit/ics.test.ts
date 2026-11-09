import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { escapeText, foldLine, renderCalendar, zonedToUtc } from "@/lib/calendar/ics";

describe("zonedToUtc (Europe/Berlin)", () => {
  const tz = "Europe/Berlin";
  it("Winter- und Sommerzeit", () => {
    expect(zonedToUtc("2027-01-15 10:00", tz).toISOString()).toBe("2027-01-15T09:00:00.000Z");
    expect(zonedToUtc("2027-07-15 10:00:00", tz).toISOString()).toBe("2027-07-15T08:00:00.000Z");
  });
  it("Zeitumstellung: Lücke im Frühjahr wird nach vorn verschoben", () => {
    // 28.03.2027: 02:00 → 03:00
    expect(zonedToUtc("2027-03-28 01:30", tz).toISOString()).toBe("2027-03-28T00:30:00.000Z");
    expect(zonedToUtc("2027-03-28 02:30", tz).toISOString()).toBe("2027-03-28T01:30:00.000Z");
    expect(zonedToUtc("2027-03-28 03:30", tz).toISOString()).toBe("2027-03-28T01:30:00.000Z");
  });
  it("Zeitumstellung im Herbst bleibt eindeutig", () => {
    // 31.10.2027: 03:00 → 02:00
    const d = zonedToUtc("2027-10-31 02:30", tz).toISOString();
    expect(["2027-10-31T00:30:00.000Z", "2027-10-31T01:30:00.000Z"]).toContain(d);
    expect(zonedToUtc("2027-10-31 12:00", tz).toISOString()).toBe("2027-10-31T11:00:00.000Z");
  });
});

describe("ICS-Writer", () => {
  it("escaped Sonderzeichen", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\;b\\,c\\\\d\\ne");
  });

  it("faltet lange Zeilen UTF-8-sicher auf ≤ 75 Oktette", () => {
    const line = "DESCRIPTION:" + "Grüße 🎉 ".repeat(30);
    const folded = foldLine(line);
    for (const l of folded.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(line);
  });

  it("erzeugt einen gültigen Kalender (ical.js)", () => {
    const text = renderCalendar({
      name: "juna · Test, Org",
      timezone: "Europe/Berlin",
      now: new Date("2026-11-09T12:00:00Z"),
      events: [
        {
          uid: "aktion-1@juna.app",
          summary: "Kuchenverkauf; Ostern",
          start: { kind: "date", date: "2027-04-04" },
          end: { kind: "date", date: "2027-04-05" },
          description: "ZEITPLAN\n• 10:00–12:00 Aufbau\n☐ Kuchen backen\n" + "lang ".repeat(60),
          location: "Pfarrheim, Saal",
          url: "https://juna.app/aktionen/1",
          sequence: 3,
        },
        {
          uid: "slot-1@juna.app",
          summary: "Aufbau · Kuchenverkauf",
          start: { kind: "utc", at: zonedToUtc("2027-04-04 08:00", "Europe/Berlin") },
          end: { kind: "utc", at: zonedToUtc("2027-04-04 10:00", "Europe/Berlin") },
          status: "TENTATIVE",
        },
      ],
    });
    expect(text.endsWith("\r\n")).toBe(true);
    const comp = new ICAL.Component(ICAL.parse(text));
    // X-Properties kennt ical.js nicht als TEXT, daher roh (escaped)
    expect(String(comp.getFirstPropertyValue("x-wr-calname"))).toMatch(/^juna · Test\\?, Org$/);
    const events = comp.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
    expect(events).toHaveLength(2);
    expect(events[0]!.summary).toBe("Kuchenverkauf; Ostern");
    expect(events[0]!.startDate.isDate).toBe(true);
    expect(events[0]!.startDate.toString()).toBe("2027-04-04");
    expect(events[0]!.location).toBe("Pfarrheim, Saal");
    expect(events[0]!.description).toContain("☐ Kuchen backen\n");
    expect(events[1]!.startDate.toJSDate().toISOString()).toBe("2027-04-04T06:00:00.000Z");
  });
});
