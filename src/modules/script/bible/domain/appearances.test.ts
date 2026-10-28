import { describe, expect, it } from "vitest";
import { appearances, detect, headingPlace, isGenericRole, prettyName, probableDuplicate, triage, type SceneText } from "./appearances";
import { fieldKey, firstSentence, fold, pluralize } from "./types";

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

  it("flags probable duplicates, sub-locations and generic roles", () => {
    const nyra = { id: "n", type: "character", name: "Nyra Solenne", aliases: [] };
    const puits = { id: "p", type: "location", name: "Le Puits sec", aliases: [] };
    expect(probableDuplicate("NYRA", [nyra])).toBe(nyra);
    expect(probableDuplicate("NYRAH SOLENNE", [nyra])).toBe(nyra);
    expect(probableDuplicate("PAUL", [nyra])).toBeNull();
    expect(probableDuplicate("PUITS SEC", [puits])).toBe(puits);
    expect(isGenericRole("GARDE 2")).toBe(true);
    expect(isGenericRole("LA SERVEUSE")).toBe(true);
    expect(isGenericRole("HOMME EN NOIR")).toBe(true);
    expect(isGenericRole("PETITE FILLE")).toBe(true);
    expect(isGenericRole("HÉLÈNE")).toBe(false);
    expect(fold("Ermitage d’Oren")).toBe(fold("Ermitage d'Oren"));

    const found = { characters: ["NYRA", "GARDE 1", "PAUL"], locations: ["MAISON – CUISINE", "PUITS SEC", "TOIT"] };
    const out = triage(found, [nyra, puits]);
    expect(out.map((c) => [c.name, c.doubt?.kind ?? null])).toEqual([
      ["Nyra", "duplicate"],
      ["Garde 1", "generic"],
      ["Paul", null],
      ["Maison – Cuisine", "sublocation"],
      ["Puits Sec", "duplicate"],
      ["Toit", null],
    ]);
    expect(out[3].doubt).toEqual({ kind: "sublocation", of: "Maison" });
  });
});

describe("bible wording", () => {
  it("puts a custom type's name in the plural, up to its first preposition", () => {
    expect(pluralize("Planète")).toBe("Planètes");
    expect(pluralize("Vaisseau spatial")).toBe("Vaisseaux spatiaux");
    expect(pluralize("Arme à feu")).toBe("Armes à feu");
    expect(pluralize("Pièce d'or")).toBe("Pièces d'or");
    expect(pluralize("Gaz")).toBe("Gaz");
    expect(pluralize("Festival")).toBe("Festivals");
  });

  it("follows the interface's language: English on the last word, Spanish on every word", () => {
    expect(pluralize("Space ship", "en")).toBe("Space ships");
    expect(pluralize("Weapon of choice", "en")).toBe("Weapons of choice");
    expect(pluralize("Box", "en")).toBe("Boxes");
    expect(pluralize("City", "en")).toBe("Cities");
    expect(pluralize("Nave espacial", "es")).toBe("Naves espaciales");
    expect(pluralize("Arma de fuego", "es")).toBe("Armas de fuego");
    expect(pluralize("Luz", "es")).toBe("Luces");
  });

  it("keeps the first sentence of a summary for the card", () => {
    expect(firstSentence("Reine du crime. Patronne de la Halte.")).toBe("Reine du crime.");
    expect(firstSentence("Sans point final")).toBe("Sans point final");
    expect(firstSentence("Un vaisseau… Ou pas.")).toBe("Un vaisseau…");
  });
});
