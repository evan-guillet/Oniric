import { describe, expect, it } from "vitest";
import type { ScriptBlock } from "../../modules/script/screenplay/domain/blocks";
import { parseFountain } from "./parse";
import { writeFountain } from "./write";

describe("parseFountain", () => {
  it("reads headings, action, dialogue and transitions", () => {
    const src = [
      "Title: Essai",
      "Author: Moi",
      "",
      "INT. CUISINE - NUIT #1#",
      "",
      "Marie boit du *lait*.",
      "Elle s'arrête.",
      "",
      "MARIE",
      "(bas)",
      "Paul ?",
      "Tu es là ?",
      "",
      "COUPE FRANCHE À:",
      "",
      ".FLASHBACK",
      "",
      "@McQueen",
      "Bonjour.",
    ].join("\n");
    expect(parseFountain(src).blocks).toEqual([
      { type: "scene_heading", text: "INT. CUISINE - NUIT" },
      { type: "action", text: "Marie boit du lait. Elle s'arrête." },
      { type: "character", text: "MARIE" },
      { type: "parenthetical", text: "(bas)" },
      { type: "dialogue", text: "Paul ? Tu es là ?" },
      { type: "transition", text: "COUPE FRANCHE À:" },
      { type: "scene_heading", text: "FLASHBACK" },
      { type: "character", text: "McQueen" },
      { type: "dialogue", text: "Bonjour." },
    ]);
  });
});

describe("writeFountain", () => {
  const script: ScriptBlock[] = [
    { type: "scene_heading", text: "INT. CUISINE DE MARIE – NUIT" },
    { type: "action", text: "Marie ouvre le frigo. La lumière découpe son visage." },
    { type: "action", text: "SILENCE." },
    { type: "character", text: "MARIE" },
    { type: "parenthetical", text: "(sans se retourner)" },
    { type: "dialogue", text: "Paul\u00a0? Si c'est toi, dis quelque chose de gentil." },
    { type: "character", text: "MCQUEEN" },
    { type: "dialogue", text: "Bonjour." },
    { type: "transition", text: "COUPE FRANCHE :" },
    { type: "scene_heading", text: "FLASHBACK" },
    { type: "action", text: "INT. n'est pas un en-tête ici." },
  ];

  it("reads back what it writes", () => {
    const text = writeFountain(script, "Les Heures Bleues");
    const back = parseFountain(text);
    expect(back.title).toBe("Les Heures Bleues");
    expect(back.blocks).toEqual(script);
  });

  it("writes scene numbers after the heading, and reads them away", () => {
    const text = writeFountain([{ type: "scene_heading", text: "INT. CUISINE – NUIT", sceneNumber: 4 }]);
    expect(text).toBe("INT. CUISINE – NUIT #4#\n");
    expect(parseFountain(text).blocks).toEqual([{ type: "scene_heading", text: "INT. CUISINE – NUIT" }]);
  });

  it("writes character names in capitals", () => {
    const text = writeFountain([
      { type: "character", text: "Marie (o.s.)" },
      { type: "dialogue", text: "Oui." },
    ]);
    expect(text).toBe("MARIE (O.S.)\nOui.\n");
  });

  it("writes shots and on-screen text as forced action", () => {
    const text = writeFountain([
      { type: "shot", text: "gros plan sur la lettre" },
      { type: "on_screen_text", text: "Lisbonne, un an plus tard" },
    ]);
    expect(parseFountain(text).blocks).toEqual([
      { type: "action", text: "GROS PLAN SUR LA LETTRE" },
      { type: "action", text: "Lisbonne, un an plus tard" },
    ]);
  });
});

describe("Fountain title page", () => {
  it("reads and writes the keys of the title page", () => {
    const src = writeFountain([{ type: "action", text: "Rien." }], "X", {
      title: "Les Heures Bleues",
      subtitle: "",
      mention: "custom",
      authors: "Evan\nCamille",
      basedOn: "D'après une nouvelle",
      version: "V2",
      date: "21/10/2026",
      contactFields: {},
      contact: "evan@example.org\n06 00 00 00 00",
      notes: "",
      include: true,
    });
    const back = parseFountain(src);
    expect(back.title).toBe("Les Heures Bleues");
    expect(back.meta.author).toBe("Evan\nCamille");
    expect(back.meta.contact).toBe("evan@example.org\n06 00 00 00 00");
    expect(back.meta["draft date"]).toBe("V2 – 21/10/2026");
    expect(back.blocks).toEqual([{ type: "action", text: "Rien." }]);
  });
});
