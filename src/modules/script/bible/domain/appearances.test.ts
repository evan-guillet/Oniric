import { describe, expect, it } from "vitest";
import { appearances, detect, headingPlace, prettyName, type SceneText } from "./appearances";
import { fieldKey, fold } from "./types";

const scenes: SceneText[] = [
  { id: "s1", heading: "INT. CUISINE DE MARIE – NUIT", characters: ["MARIE"], text: "La lumière du frigo découpe Marie.", links: [] },
  { id: "s2", heading: "EXT. TOIT – AUBE", characters: ["PAUL"], text: "Paul fume. Il pense à Hélène.", links: [] },
  { id: "s3", heading: "INT. CUISINE DE MARIE – JOUR", characters: [], text: "La bouteille de lait est vide.", links: ["e-lait"] },
];

describe("bible appearances", () => {
  it("finds a character by cue or by name, ignoring accents", () => {
    expect(appearances({ id: "m", type: "character", name: "Marie", aliases: [] }, scenes)).toEqual(["s1"]);
    expect(appearances({ id: "h", type: "character", name: "Helene", aliases: [] }, scenes)).toEqual(["s2"]);
  });

  it("finds a location by the headings, and anything by a wiki link", () => {
    expect(appearances({ id: "c", type: "location", name: "Cuisine de Marie", aliases: [] }, scenes)).toEqual(["s1", "s3"]);
    expect(appearances({ id: "e-lait", type: "object", name: "Bouteille", aliases: [] }, scenes)).toEqual(["s3"]);
  });

  it("does not match inside a word", () => {
    expect(appearances({ id: "x", type: "object", name: "lai", aliases: [] }, scenes)).toEqual([]);
  });

  it("detects characters and locations without an entry", () => {
    const found = detect(scenes, [{ id: "m", type: "character", name: "Marie", aliases: [] }]);
    expect(found.characters).toEqual(["PAUL"]);
    expect(found.locations).toEqual(["CUISINE DE MARIE", "TOIT"]);
  });

  it("splits headings and builds field keys", () => {
    expect(headingPlace("INT. CUISINE – NUIT")).toBe("cuisine");
    expect(fold(" Éloïse ")).toBe("eloise");
    expect(fieldKey("Couleur préférée", [])).toBe("couleur_preferee");
    expect(fieldKey("Âge", ["age"])).toBe("age_2");
    expect(prettyName("JEAN-PIERRE")).toBe("Jean-Pierre");
    expect(prettyName("CUISINE DE MARIE")).toBe("Cuisine de Marie");
    expect(prettyName("L'ÉCOLE")).toBe("L'École");
  });
});
