import { describe, expect, it } from "vitest";
import { formIssues, longAbsences, longScenes, mainCharacters, scenesWithout, speech, type ReviewScene } from "./review";

const scene = (id: string, heading: string, eighths: number, lines: [string, string][]): ReviewScene => ({
  id,
  number: id,
  heading,
  eighths,
  characters: [...new Set(lines.filter(([t]) => t === "character").map(([, x]) => x.replace(/\s*\(.*\)/, "")))],
  blocks: [{ type: "scene_heading", text: heading }, ...lines.map(([type, text]) => ({ type, text }))],
});

describe("rereading aids", () => {
  const film = [
    scene("1", "INT. CUISINE – NUIT", 30, [["character", "MARIE"], ["dialogue", "Bonjour toi."], ["character", "PAUL (OFF)"], ["dialogue", "Salut."]]),
    scene("2", "EXT. RUE – JOUR", 8, [["action", "Une voiture passe."]]),
    scene("3", "EXT. RUE – JOUR", 96, [["character", "PAUL"], ["dialogue", "Encore moi."]]),
    scene("4", "INT. CUISINE – NUIT", 8, [["character", "MARIE"], ["parenthetical", "(bas)"], ["dialogue", "Enfin."]]),
    scene("5", "INT. CUISINE – NUIT", 8, [["character", "MARIE"], ["dialogue", "Fin."]]),
  ];

  it("finds the long scenes and the share of the dialogue", () => {
    expect(longScenes(film).map((s) => s.id)).toEqual(["3", "1"]);
    expect(speech(film)).toEqual([
      { name: "MARIE", words: 4, share: 4 / 7 },
      { name: "PAUL", words: 3, share: 3 / 7 },
    ]);
  });

  it("finds the scenes without the main characters and a long absence", () => {
    expect(mainCharacters(film)).toEqual(["MARIE", "PAUL"]);
    expect(scenesWithout(film, ["MARIE", "PAUL"]).map((s) => s.id)).toEqual(["2"]);
    expect(longAbsences(film)).toEqual([{ name: "MARIE", after: "1", back: "4", eighths: 104 }]);
  });

  it("checks the form", () => {
    const issues = formIssues([
      scene("1", "", 8, [["action", "x"]]),
      scene("2", "CUISINE – NUIT", 8, [["character", "JOHANNA"], ["dialogue", "x"]]),
      scene("3", "INT. CUISINE", 8, [["character", "JOHANA"], ["dialogue", "x"]]),
      scene("4", "INT. SALON – JOUR", 8, []),
      scene("5", "INT. SALON – JOUR", 8, [["character", "LUKE"], ["character", "LUKE SKYWALKER"]]),
    ]);
    expect(issues).toEqual([
      { kind: "noHeading", sceneId: "1" },
      { kind: "badHeading", sceneId: "2", heading: "CUISINE – NUIT", missing: "side" },
      { kind: "badHeading", sceneId: "3", heading: "INT. CUISINE", missing: "time" },
      { kind: "empty", sceneId: "4" },
      { kind: "spelling", sceneId: "3", names: ["JOHANNA", "JOHANA"] },
    ]);
  });
});
