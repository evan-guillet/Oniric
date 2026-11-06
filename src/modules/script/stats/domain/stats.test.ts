import { describe, expect, it } from "vitest";
import { countWords, dayKey, periodDays, wordCounts } from "./stats";

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

describe("days", () => {
  it("lists the days of a period, oldest first", () => {
    const days = periodDays(new Date(2026, 9, 25), 7, 1).map(dayKey);
    expect(days[0]).toBe("2026-10-12");
    expect(days.at(-1)).toBe("2026-10-18");
  });
});
