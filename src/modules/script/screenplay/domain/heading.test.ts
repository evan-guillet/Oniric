import { describe, expect, it } from "vitest";
import { parseHeading } from "./heading";

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
