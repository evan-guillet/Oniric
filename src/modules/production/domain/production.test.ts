import { describe, expect, it } from "vitest";
import { ranges, suggest, type Element } from "./breakdown";
import { changes, normalizeTime, sheetData } from "./callSheet";
import { cardsFromCsv, cardsFromVCard, initials, parseCsv, toVCard } from "./contacts";
import { crc32, toIcs, toXlsx } from "./files";
import { arrange, dayConflicts, dayDates, presence, shootNumbers, type ArrangeScene } from "./schedule";
import { sceneFacts, stripTone } from "./sceneFacts";
import { parseCoordinates, sunTimesUtc } from "./sun";

describe("scene facts", () => {
  it("reads inside or out and the moment, a scene « SUITE » keeping the one before", () => {
    const f = sceneFacts(["INT. CUISINE DE MARIE – NUIT", "EXT. JARDIN – SUITE", "INT./EXT. VOITURE – JOUR", "EXT. PLAGE – AUBE", "SALON"]);
    expect(f.map((x) => [x.side, x.moment, x.place])).toEqual([
      ["int", "night", "CUISINE DE MARIE"],
      ["ext", "night", "JARDIN"],
      ["intext", "day", "VOITURE"],
      ["ext", "dawn", "PLAGE"],
      [null, null, "SALON"],
    ]);
    expect(f.map(stripTone)).toEqual(["int-night", "ext-night", "ext-day", "dawn", "none"]);
  });
});

describe("contacts", () => {
  it("reads a CSV in semicolons or commas, with quotes and line breaks", () => {
    expect(parseCsv('a;b\r\n"x;1";"deux\nlignes"\r\n')).toEqual([["a", "b"], ["x;1", "deux\nlignes"]]);
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("takes the columns by their names, in any language, and joins first and last names", () => {
    const cards = cardsFromCsv("Prénom;Nom de famille;E-mail;Métiers\nCamille;Durand;c@d.fr;Cadreuse, Photographe\n;;;\n");
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe("Camille Durand");
    expect(cards[0].data.email).toBe("c@d.fr");
    expect(cards[0].data.trades).toEqual(["Cadreuse", "Photographe"]);
  });

  it("writes and reads back a vCard", () => {
    const text = toVCard([{ name: "Jean-Pierre Martin", data: { ...cardsFromCsv("Nom\nX")[0].data, phone: "06 12", email: "jp@m.fr", notes: "Allergique; chats" } }]);
    expect(text).toContain("FN:Jean-Pierre Martin");
    expect(text).toContain("N:Martin;Jean-Pierre;;;");
    const back = cardsFromVCard(text);
    expect(back[0].name).toBe("Jean-Pierre Martin");
    expect(back[0].data.phone).toBe("06 12");
    expect(back[0].data.notes).toBe("Allergique; chats");
  });

  it("reads a folded vCard with only a structured name", () => {
    const back = cardsFromVCard("BEGIN:VCARD\r\nVERSION:2.1\r\nN:Durand;Ca\r\n mille;;;\r\nTEL;CELL:0600\r\nEND:VCARD\r\n");
    expect(back).toEqual([expect.objectContaining({ name: "Camille Durand" })]);
  });

  it("gives initials", () => {
    expect(initials("Camille Durand")).toBe("CD");
    expect(initials("Zoé")).toBe("ZO");
  });
});

describe("breakdown", () => {
  const scene = { id: "s1", heading: "INT. CUISINE DE MARIE – NUIT", characters: ["MARIE", "PAUL"], text: "Marie allume la Lampe. Le Taxi attend.", links: [] };
  const entries = [
    { id: "e1", type: "character", name: "Marie", aliases: [] },
    { id: "e2", type: "object", name: "Lampe", aliases: [] },
    { id: "e3", type: "vehicle", name: "Taxi", aliases: [] },
  ];

  it("suggests the characters, the set and the bible entries the text names", () => {
    const s = suggest(scene, entries, [], []);
    expect(s.map((x) => [x.category, x.name, x.entryId])).toEqual([
      ["cast", "Marie", "e1"],
      ["cast", "Paul", null],
      ["set", "Cuisine de Marie", null],
      ["props", "Lampe", "e2"],
      ["vehicles", "Taxi", "e3"],
    ]);
  });

  it("leaves out what the scene has and what was turned down", () => {
    const have: Element[] = [{ id: "x", category: "cast", name: "MARIE", entryId: null, notes: "" }];
    const s = suggest(scene, entries, have, ["props:lampe"]);
    expect(s.map((x) => x.name)).toEqual(["Paul", "Cuisine de Marie", "Taxi"]);
  });

  it("finds the names in the text as whole words, the longest first", () => {
    const r = ranges("La lampe torche et la lampe.", [
      { name: "lampe", category: "props" },
      { name: "Lampe torche", category: "handprops" },
    ]);
    expect(r).toEqual([
      { from: 3, to: 15, category: "handprops" },
      { from: 22, to: 27, category: "props" },
    ]);
    expect(ranges("Lampadaire", [{ name: "lampe", category: "props" }])).toEqual([]);
  });
});

describe("schedule", () => {
  const settings = { startDate: "2026-03-13", week: [1, 2, 3, 4, 5], dayMinutes: 600, pageMinutes: 90 };

  it("dates the days on the days worked, a date set by hand moving the next ones", () => {
    const days = [
      { id: "a", kind: "shoot" as const, date: null },
      { id: "b", kind: "shoot" as const, date: null },
      { id: "c", kind: "off" as const, date: null },
      { id: "d", kind: "shoot" as const, date: "2026-03-20" },
      { id: "e", kind: "shoot" as const, date: null },
    ];
    // Friday 13, then Monday 16, Tuesday 17, then the date set, then Monday 23.
    expect(dayDates(settings, days)).toEqual(["2026-03-13", "2026-03-16", "2026-03-17", "2026-03-20", "2026-03-23"]);
    expect(shootNumbers(days)).toEqual([1, 2, null, 3, 4]);
    expect(dayDates({ ...settings, startDate: null }, days.slice(0, 2))).toEqual([null, null]);
  });

  it("marks the presence of an actor", () => {
    const days = ["shoot", "shoot", "travel", "shoot", "off", "shoot"].map((kind, i) => ({ id: String(i), kind: kind as "shoot", date: null }));
    expect(presence(days, [false, true, false, false, false, true])).toEqual(["", "SW", "T", "H", "", "WF"]);
    expect(presence(days, [true, false, false, false, false, false])).toEqual(["SWF", "", "", "", "", ""]);
  });

  it("finds an actor away and a day too long", () => {
    const c = dayConflicts("2026-03-16", ["MARIE", "PAUL"], 700, settings, (ch) => (ch === "MARIE" ? "c1" : null), [
      { contactId: "c1", start: "2026-03-15", end: "2026-03-16" },
    ]);
    expect(c).toEqual([
      { kind: "unavailable", character: "MARIE" },
      { kind: "overload", minutes: 700 },
    ]);
  });

  it("arranges by set and cuts into days", () => {
    const facts = (place: string, moment: "day" | "night") => ({ side: "int" as const, moment, place });
    const scenes: ArrangeScene[] = [
      { id: "1", minutes: 200, facts: facts("B", "day"), cast: [1] },
      { id: "2", minutes: 300, facts: facts("A", "night"), cast: [2] },
      { id: "3", minutes: 250, facts: facts("A", "day"), cast: [1] },
      { id: "4", minutes: 400, facts: facts("C", "day"), cast: [3] },
    ];
    expect(arrange(scenes, "set", 600)).toEqual([["3", "2"], ["1", "4"]]);
    expect(arrange(scenes, "moment", 600)).toEqual([["3", "1"], ["4"], ["2"]]);
  });
});

describe("call sheet", () => {
  it("lists what changed, with the levels above", () => {
    const a = sheetData({ generalCall: "07:00", cast: { MARIE: { pickup: "06:00", hmc: "", onSet: "", notes: "" } } });
    const b = sheetData({ generalCall: "07:30", cast: { MARIE: { pickup: "06:15", hmc: "", onSet: "", notes: "" } } });
    expect([...changes(a, b)].sort()).toEqual(["cast", "cast.MARIE", "cast.MARIE.pickup", "generalCall"]);
    expect(changes(a, a).size).toBe(0);
  });

  it("writes the times the same way", () => {
    expect(["7h30", "7:30", "730", "7", "19h", "midi"].map(normalizeTime)).toEqual(["07:30", "07:30", "07:30", "07:00", "19:00", "midi"]);
  });
});

describe("sun", () => {
  it("reads coordinates", () => {
    expect(parseCoordinates("48,8566 ; 2,3522")).toEqual({ lat: 48.8566, lon: 2.3522 });
    expect(parseCoordinates("rue de Paris")).toBeNull();
  });

  it("gives the sunrise and sunset in Paris on the summer solstice", () => {
    const s = sunTimesUtc("2026-06-21", 48.8566, 2.3522)!;
    // 05:47 and 21:58 in Paris, 03:47 and 19:58 UTC.
    expect(Math.abs(s.rise - (3 * 60 + 47))).toBeLessThan(3);
    expect(Math.abs(s.set - (19 * 60 + 58))).toBeLessThan(3);
    expect(sunTimesUtc("2026-06-21", 80, 0)).toBeNull();
  });
});

describe("files", () => {
  it("writes whole-day events", () => {
    const ics = toIcs("Tournage", [{ uid: "j1", title: "J1, Cuisine", start: "2026-03-16", end: "2026-03-16" }], new Date("2026-01-01T00:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20260316\r\nDTEND;VALUE=DATE:20260317");
    expect(ics).toContain("SUMMARY:J1\\, Cuisine");
  });

  it("computes the CRC of a ZIP and writes a workbook", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const x = toXlsx([{ name: "Plan", rows: [["Jour", "Pages"], ["J1", 4.5]] }]);
    expect([...x.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(x)).toContain('<c r="B2"><v>4.5</v></c>');
  });
});
