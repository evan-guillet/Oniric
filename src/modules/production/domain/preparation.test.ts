import { describe, expect, it } from "vitest";
import { budgetSettings, compareChapters, fundingTotals, lineCost, lineData, overruns, parseRate, resolved, rollUp, spentBy, topsheet, type BudgetFacts, type GridLine } from "./budget";
import { fillModel, permitAlerts, dueSoon, toDocx, type DecorRef, type PermitRef } from "./permits";
import { exifPosition, formatDuration, haversine, meanScore, zoneCount, zoneTiles } from "./scouting";
import { goldenHours, sunPosition, sunTimesUtc } from "./sun";

const settings = budgetSettings({ regimes: [{ id: "t", name: "T", rate: 50 }], contingency: 10, overheads: 5, insurance: 0, bond: 0, exchange: [{ currency: "USD", rate: 0.5 }] });
const row = (id: string, parentId: string | null, level: GridLine["level"], data = {}, origin = id): GridLine => ({ id, parentId, level, origin, rank: id, label: id, data: lineData(data) });

describe("budget", () => {
  it("reads a rate written by hand", () => {
    expect(parseRate("1 250,50 € / jour")).toBe(1250.5);
    expect(parseRate("selon accord")).toBeNull();
  });
  it("costs a line with its contributions, tax and currency", () => {
    expect(lineCost(lineData({ quantity: 3, people: 2, rate: 100, social: "t", vat: 20 }), settings)).toEqual({ gross: 600, social: 300, vat: 120 });
    expect(lineCost(lineData({ quantity: 1, rate: 100, currency: "USD" }), settings).gross).toBe(50);
  });
  it("follows what a line is linked to", () => {
    const facts: BudgetFacts = { shootDays: 12, crew: new Map([["m", { days: 5, rate: 200 }]]), element: new Map([["e", 3]]), location: new Map([["l", { days: 2, rental: 500 }]]) };
    expect(resolved(lineData({ link: { kind: "shootDays" } }), facts).quantity).toBe(12);
    expect(lineCost(lineData({ rate: 1, link: { kind: "crew", id: "m" } }), settings, facts).gross).toBe(1000);
    expect(lineCost(lineData({ rate: 7, link: { kind: "element", id: "e" } }), settings, facts).gross).toBe(21);
    expect(lineCost(lineData({ link: { kind: "location", id: "l" } }), settings, facts).gross).toBe(1000);
  });
  const grid = [row("c", null, "chapter"), row("p", "c", "post"), row("l1", "p", "line", { quantity: 2, rate: 100, social: "t" }), row("l2", "p", "line", { rate: 50, vat: 20 })];
  it("adds lines into posts and chapters", () => {
    const c = rollUp(grid, settings);
    expect(c.get("p")?.gross).toBe(250);
    expect(c.get("c")).toEqual({ gross: 250, social: 100, vat: 10 });
  });
  it("reckons the summary", () => {
    const s = topsheet(grid, settings);
    expect(s).toMatchObject({ lines: 250, social: 100, overheads: 12.5, contingency: 25, net: 387.5, vat: 10, total: 397.5 });
  });
  it("compares versions by origin, and finds overruns", () => {
    const b = [row("c2", null, "chapter", {}, "c"), row("p2", "c2", "post", {}, "p"), row("l3", "p2", "line", { rate: 400 }, "l1")];
    const d = compareChapters(topsheet(grid, settings), topsheet(b, settings));
    expect(d).toEqual([{ origin: "c", code: "", label: "c", a: 250, b: 400, delta: 150 }]);
    const spent = spentBy(grid, [{ origin: "l2", amount: 80, currency: "" }, { origin: "l1", amount: 100, currency: "USD" }], settings);
    expect(spent.get("c")).toBe(130);
    expect(overruns(grid, rollUp(grid, settings), spent)).toEqual([{ id: "l2", label: "l2", over: 30 }]);
  });
  it("totals the plan", () => {
    expect(fundingTotals([{ amount: 100, currency: "", status: "paid" }, { amount: 100, currency: "USD", status: "asked" }], settings)).toEqual({ asked: 50, granted: 0, paid: 100, total: 150 });
  });
});

describe("permits", () => {
  const decors: DecorRef[] = [
    { id: "a", name: "Mairie", noPermit: false, plays: ["CUISINE DE MARIE"] },
    { id: "b", name: "Chez Paul", noPermit: true, plays: ["SALON"] },
  ];
  const day = { id: "d", number: 1, date: "2027-03-10", places: ["Cuisine de Marie", "SALON"] };
  const permit = (o: Partial<PermitRef>): PermitRef => ({ id: "p", locationId: "a", status: "granted", start: null, end: null, deadline: null, ...o });
  it("signals a day in a set without a granted permit, not one that needs none", () => {
    expect(permitAlerts([day], decors, [])).toMatchObject([{ locationId: "a", waiting: null }]);
    expect(permitAlerts([day], decors, [permit({ status: "sent" })])).toMatchObject([{ waiting: "sent" }]);
    expect(permitAlerts([day], decors, [permit({})])).toEqual([]);
  });
  it("looks at the dates of the permit", () => {
    expect(permitAlerts([day], decors, [permit({ start: "2027-04-01", end: "2027-04-02" })])).toHaveLength(1);
    expect(permitAlerts([day], decors, [permit({ start: "2027-03-01", end: "2027-03-20" })])).toEqual([]);
  });
  it("finds the deadlines near", () => {
    const list = [permit({ id: "x", status: "todo", deadline: "2027-03-05" }), permit({ id: "y", status: "todo", deadline: "2027-09-05" }), permit({ id: "z", status: "sent", deadline: "2027-03-02" })];
    expect(dueSoon(list, "2027-03-01").map((p) => p.id)).toEqual(["x"]);
  });
  it("fills a model and leaves dots for the rest", () => {
    expect(fillModel("{a} et {b}", { a: "Oui", b: "" })).toBe("Oui et ……………");
  });
  it("writes a Word file", () => {
    const bytes = toDocx("Titre", "Ligne & <1>\nLigne 2");
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect(new TextDecoder().decode(bytes)).toContain("Ligne &amp; &lt;1&gt;");
  });
});

describe("scouting", () => {
  it("measures and tells", () => {
    expect(Math.round(haversine({ lat: 48.8566, lon: 2.3522 }, { lat: 45.764, lon: 4.8357 }) / 1000)).toBe(391);
    expect(formatDuration(65 * 60)).toBe("1 h 05");
    expect(meanScore({ a: 4, b: 2 }, ["a", "b", "c"])).toBe(3);
  });
  it("counts a zone as it lists it", () => {
    const b = { west: 2.3, south: 48.8, east: 2.4, north: 48.9 };
    expect(zoneCount(b)).toBe(zoneTiles(b).length);
    expect(zoneCount({ west: -5, south: 42, east: 8, north: 51 })).toBeGreaterThan(4000);
  });
  it("reads the position of a JPEG", () => {
    // An EXIF block by hand, big-endian: 48°30'0" N, 2°15'0" W.
    const tiff: number[] = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8];
    const u16 = (n: number) => [n >> 8, n & 255];
    const u32 = (n: number) => [0, 0, n >> 8, n & 255];
    tiff.push(...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
    const data = 26 + 2 + 48 + 4;
    tiff.push(...u16(4));
    tiff.push(...u16(1), ...u16(2), ...u32(2), 78, 0, 0, 0);
    tiff.push(...u16(2), ...u16(5), ...u32(3), ...u32(data));
    tiff.push(...u16(3), ...u16(2), ...u32(2), 87, 0, 0, 0);
    tiff.push(...u16(4), ...u16(5), ...u32(3), ...u32(data + 24));
    tiff.push(...u32(0));
    for (const n of [48, 30, 0, 2, 15, 0]) tiff.push(...u32(n), ...u32(1));
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body, 0xff, 0xd9]);
    expect(exifPosition(jpeg)).toEqual({ lat: 48.5, lon: -2.25 });
    expect(exifPosition(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("sun", () => {
  it("places the sun south at noon in the north, and low at sunset", () => {
    const lat = 48.85;
    const lon = 2.35;
    const t = sunTimesUtc("2027-06-21", lat, lon)!;
    const noon = sunPosition("2027-06-21", (t.rise + t.set) / 2, lat, lon);
    expect(Math.abs(noon.azimuth - 180)).toBeLessThan(2);
    expect(noon.elevation).toBeGreaterThan(60);
    const set = sunPosition("2027-06-21", t.set, lat, lon);
    expect(Math.abs(set.elevation)).toBeLessThan(1.5);
    expect(set.azimuth).toBeGreaterThan(290);
  });
  it("gives golden hours between sunrise and sunset", () => {
    const t = sunTimesUtc("2027-03-10", 48.85, 2.35)!;
    const g = goldenHours("2027-03-10", 48.85, 2.35)!;
    expect(g.morningEnd).toBeGreaterThan(t.rise);
    expect(g.eveningStart).toBeLessThan(t.set);
  });
});
