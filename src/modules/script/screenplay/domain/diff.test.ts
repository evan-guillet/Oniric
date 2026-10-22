import { describe, expect, it } from "vitest";
import { diffLines, diffScenes, diffWords, foldLines, lineStats } from "./diff";

describe("diffWords", () => {
  it("marks the changed words only", () => {
    expect(diffWords("Marie boit du lait.", "Marie boit du café froid.")).toEqual([
      { kind: "same", text: "Marie boit du " },
      { kind: "removed", text: "lait" },
      { kind: "added", text: "café froid" },
      { kind: "same", text: "." },
    ]);
  });

  it("rebuilds both texts", () => {
    const a = "Il pleut.\nPaul attend sous l'abri, seul.";
    const b = "Il neige.\nPaul attend, seul, sous l'abri de bus.";
    const parts = diffWords(a, b);
    expect(parts.filter((p) => p.kind !== "added").map((p) => p.text).join("")).toBe(a);
    expect(parts.filter((p) => p.kind !== "removed").map((p) => p.text).join("")).toBe(b);
  });
});

describe("diffScenes", () => {
  it("matches scenes by id and reports additions, removals, changes and moves", () => {
    const left = [
      { id: "1", heading: "A", text: "un" },
      { id: "2", heading: "B", text: "deux" },
      { id: "3", heading: "C", text: "trois" },
    ];
    const right = [
      { id: "3", heading: "C", text: "trois" },
      { id: "1", heading: "A", text: "un !" },
      { id: "4", heading: "D", text: "quatre" },
    ];
    expect(diffScenes(left, right).map((d) => [d.kind, d.left?.id ?? null, d.right?.id ?? null])).toEqual([
      ["removed", "2", null],
      ["same", "3", "3"],
      ["changed", "1", "1"],
      ["added", null, "4"],
    ]);
  });
});

describe("diffLines", () => {
  it("pairs a removed line with the added one facing it", () => {
    const lines = diffLines("INT. CUISINE - NUIT\nMarie boit du lait.\nElle sort.", "INT. CUISINE - NUIT\nMarie boit du café.\nElle sort.\nLe noir.");
    expect(lines.map((l) => [l.kind, l.left?.n ?? null, l.right?.n ?? null])).toEqual([
      ["same", 1, 1],
      ["changed", 2, 2],
      ["same", 3, 3],
      ["added", null, 4],
    ]);
    expect(lines[1].left!.parts).toContainEqual({ kind: "removed", text: "lait" });
    expect(lines[1].right!.parts).toContainEqual({ kind: "added", text: "café" });
    expect(lineStats(lines)).toEqual({ added: 2, removed: 1 });
  });

  it("treats an empty side as a whole scene added", () => {
    expect(diffLines("", "un\ndeux").map((l) => l.kind)).toEqual(["added", "added"]);
  });
});

describe("foldLines", () => {
  it("folds the identical lines far from any change", () => {
    const a = Array.from({ length: 12 }, (_, i) => `ligne ${i}`).join("\n");
    const hunks = foldLines(diffLines(a, a.replace("ligne 10", "ligne dix")), 2);
    expect(hunks.map((h) => [h.kind, h.lines.length])).toEqual([
      ["fold", 8],
      ["lines", 4],
    ]);
  });
});
