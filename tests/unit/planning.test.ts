import { describe, expect, it } from "vitest";
import {
  actionDays,
  dueBucket,
  formatDueRelative,
  shiftTs,
  slotAttendance,
  taskDueDate,
  type ParticipantLike,
  type SlotLike,
} from "@/lib/planning";

const slots: SlotLike[] = [
  { id: "aufbau", startsAt: "2027-04-04 08:00:00", endsAt: "2027-04-04 10:00:00", minPeople: 3 },
  { id: "verkauf", startsAt: "2027-04-04 10:00:00", endsAt: "2027-04-04 13:00:00", minPeople: null },
  { id: "abbau", startsAt: "2027-04-04 13:00:00", endsAt: "2027-04-04 14:00:00", minPeople: 2 },
];
const p = (userId: string, status: ParticipantLike["status"], from?: string, until?: string): ParticipantLike => ({
  userId,
  status,
  presentFrom: from ? `2027-04-04 ${from}:00` : null,
  presentUntil: until ? `2027-04-04 ${until}:00` : null,
});

describe("slotAttendance", () => {
  it("leitet Slots aus Status und Anwesenheitsfenster ab", () => {
    const res = slotAttendance(
      slots,
      [
        p("lena", "dabei"), // ganze Aktion
        p("max", "dabei", "10:00"), // kommt später → kein Aufbau
        p("tim", "dabei", undefined, "13:00"), // geht früher → kein Abbau
        p("ina", "vielleicht"),
        p("ole", "nicht_dabei"),
      ],
      [],
    );
    expect(res.get("aufbau")).toEqual({ present: ["lena", "tim"], maybe: ["ina"], understaffed: true });
    expect(res.get("verkauf")).toEqual({ present: ["lena", "max", "tim"], maybe: ["ina"], understaffed: false });
    expect(res.get("abbau")).toEqual({ present: ["lena", "max"], maybe: ["ina"], understaffed: false });
  });

  it("Overrides haben Vorrang, „nicht dabei“ bleibt draußen", () => {
    const res = slotAttendance(
      slots,
      [p("lena", "dabei"), p("max", "dabei", "10:00"), p("ole", "nicht_dabei")],
      [
        { slotId: "verkauf", userId: "lena", present: false },
        { slotId: "aufbau", userId: "max", present: true },
        { slotId: "aufbau", userId: "ole", present: true },
      ],
    );
    expect(res.get("verkauf")!.present).toEqual(["max"]);
    expect(res.get("aufbau")!.present).toEqual(["lena", "max"]);
  });
});

describe("Deadlines", () => {
  it("rechnet relative und absolute Deadlines", () => {
    expect(taskDueDate({ dueDaysBefore: 14, dueDate: null }, "2027-04-04")).toBe("2027-03-21");
    expect(taskDueDate({ dueDaysBefore: 0, dueDate: null }, "2027-04-04")).toBe("2027-04-04");
    expect(taskDueDate({ dueDaysBefore: null, dueDate: "2027-02-01" }, "2027-04-04")).toBe("2027-02-01");
    expect(taskDueDate({ dueDaysBefore: 7, dueDate: null }, null)).toBeNull();
  });

  it("ordnet Deadlines Gruppen zu", () => {
    const today = "2027-03-10";
    expect(dueBucket("2027-03-09", today)).toBe("ueberfaellig");
    expect(dueBucket("2027-03-10", today)).toBe("heute");
    expect(dueBucket("2027-03-17", today)).toBe("woche");
    expect(dueBucket("2027-03-18", today)).toBe("spaeter");
    expect(dueBucket(null, today)).toBe("ohne");
    expect(formatDueRelative("2027-03-12", today)).toBe("in 2 Tagen");
    expect(formatDueRelative("2027-03-08", today)).toBe("vor 2 Tagen");
  });
});

describe("Datumshilfen", () => {
  it("verschiebt Zeitstempel über Monatsgrenzen und listet Aktionstage", () => {
    expect(shiftTs("2027-03-30 09:00:00", 3)).toBe("2027-04-02 09:00:00");
    expect(actionDays("2027-07-30", "2027-08-02")).toEqual(["2027-07-30", "2027-07-31", "2027-08-01", "2027-08-02"]);
    expect(actionDays(null, null)).toEqual([]);
  });
});
