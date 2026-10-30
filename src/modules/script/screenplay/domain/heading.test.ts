import { describe, expect, it } from "vitest";
import { isTimeOfDay, parseHeading } from "./heading";

describe("parseHeading", () => {
  it.each([
    ["INT. CUISINE DE MARIE – NUIT", "INT", "CUISINE DE MARIE", "NUIT"],
    ["ext. toit de l'immeuble - aube", "EXT", "TOIT DE L'IMMEUBLE", "AUBE"],
    ["INT./EXT. VOITURE DE PAUL — JOUR", "INT/EXT", "VOITURE DE PAUL", "JOUR"],
    ["I/E GARE - QUAI 3 - SOIR", "INT/EXT", "GARE – QUAI 3", "SOIR"],
    ["FLASHBACK", null, "FLASHBACK", null],
    ["INT. COULOIR", "INT", "COULOIR", null],
    ["INTÉRIEUR NUIT", null, "INTÉRIEUR NUIT", null],
  ])("%s", (text, intExt, location, time) => {
    expect(parseHeading(text)).toEqual({ intExt, location, time });
  });

  it("returns nothing for an empty heading", () => {
    expect(parseHeading("  ")).toEqual({ intExt: null, location: null, time: null });
  });
});

describe("isTimeOfDay", () => {
  it("tells a time of day from a place", () => {
    expect(isTimeOfDay("NUIT")).toBe(true);
    expect(isTimeOfDay("crépuscule")).toBe(true);
    expect(isTimeOfDay("PLUS TARD")).toBe(true);
    expect(isTimeOfDay("COURSIVE PRINCIPALE")).toBe(false);
    expect(isTimeOfDay("AU-DESSUS DE TATOOINE")).toBe(false);
  });
});
