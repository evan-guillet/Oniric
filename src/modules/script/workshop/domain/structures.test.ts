import { describe, expect, it } from "vitest";
import { MODELS, modelById, partGaps } from "./structures";

describe("structure models", () => {
  it("every model's parts cover the whole film and its beats are in order", () => {
    for (const m of MODELS.filter((x) => x.parts.length)) {
      expect(m.parts.reduce((n, p) => n + p.share, 0)).toBeCloseTo(1);
      const at = m.beats.map((b) => b.at);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(new Set(m.beats.map((b) => b.key)).size).toBe(m.beats.length);
    }
    expect(modelById("save-the-cat").beats).toHaveLength(15);
    expect(modelById("heros-journey").beats).toHaveLength(12);
    expect(modelById("nope").id).toBe("three-acts");
  });

  it("flags acts more than ten points away from the model", () => {
    const gaps = partGaps(modelById("three-acts"), [0.4, 0.45, 0.15]);
    expect(gaps.map((g) => g.off)).toEqual([true, false, false]);
    expect(partGaps(modelById("three-acts"), [1]).map((g) => g.actual)).toEqual([1, null, null]);
  });
});
