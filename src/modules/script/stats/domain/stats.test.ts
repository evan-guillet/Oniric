import { describe, expect, it } from "vitest";
import { characterStats, countWords, dayKey, headingShares, percents, periodDays, placeStats, wordCounts, type StatScene } from "./stats";

const scene = (id: string, heading: string, eighths: number, blocks: StatScene["blocks"]): StatScene => ({
  id,
  index: 0,
  heading,
  eighths,
  blocks,
});

describe("countWords", () => {
  it("keeps inner apostrophes and hyphens in one word", () => {
    expect(countWords("L'homme-orchestre arrive… 3 fois !")).toBe(4);
    expect(countWords("  ")).toBe(0);
  });
});

describe("wordCounts", () => {
  it("puts parentheticals with the dialogue", () => {
    expect(
      wordCounts([
        { type: "action", text: "Il entre." },
        { type: "parenthetical", text: "(bas)" },
        { type: "dialogue", text: "Bonjour à tous" },
        { type: "scene_heading", text: "INT. CUISINE - JOUR" },
      ]),
    ).toEqual({ action: 2, dialogue: 4, other: 3 });
  });
});

describe("characterStats", () => {
  const scenes = [
    scene("a", "INT. CUISINE - JOUR", 8, [
      { type: "character", text: "MARIE" },
      { type: "dialogue", text: "Un deux trois" },
      { type: "character", text: "PAUL (V.O.)" },
      { type: "dialogue", text: "Quatre" },
      { type: "action", text: "Silence." },
      { type: "dialogue", text: "Orphelin" },
    ]),
    scene("b", "EXT. JARDIN - NUIT", 4, [
      { type: "character", text: "PAUL" },
      { type: "dialogue", text: "Cinq six" },
    ]),
  ];
  const stats = characterStats(scenes, (cue) => cue.replace(/\s*\(.*\)$/, ""));

  it("counts cues, words and scenes per character, the most words first, then the most cues", () => {
    expect(stats).toEqual([
      { name: "PAUL", lines: 2, words: 3, scenes: ["a", "b"] },
      { name: "MARIE", lines: 1, words: 3, scenes: ["a"] },
    ]);
  });
});

describe("places and headings", () => {
  const scenes = [
    scene("a", "INT. CUISINE - JOUR", 8, []),
    scene("b", "EXT. JARDIN - NUIT", 4, []),
    scene("c", "INT. CUISINE - NUIT", 2, []),
  ];

  it("adds up the length of each place", () => {
    expect(placeStats(scenes)).toEqual([
      { name: "CUISINE", eighths: 10, scenes: ["a", "c"] },
      { name: "JARDIN", eighths: 4, scenes: ["b"] },
    ]);
  });

  it("splits the scenes by time of day", () => {
    expect(headingShares(scenes, "time").map((s) => [s.label, s.scenes])).toEqual([
      ["JOUR", 1],
      ["NUIT", 2],
    ]);
  });
});

describe("days", () => {
  it("lists the days of a period, oldest first", () => {
    const days = periodDays(new Date(2026, 9, 25), 7, 1).map(dayKey);
    expect(days[0]).toBe("2026-10-12");
    expect(days.at(-1)).toBe("2026-10-18");
  });

  it("rounds percents to one decimal", () => {
    expect(percents([1, 2])).toEqual([33.3, 66.7]);
    expect(percents([0, 0])).toEqual([0, 0]);
  });
});
