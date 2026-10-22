import { describe, expect, it } from "vitest";
import { rankBetween, ranksBetween } from "./ordering";

describe("rankBetween", () => {
  it("places a rank between its neighbours", () => {
    const a = rankBetween(null, null);
    const b = rankBetween(a, null);
    const c = rankBetween(a, b);
    const z = rankBetween(null, a);
    expect([z, a, c, b]).toEqual([z, a, c, b].slice().sort());
    expect(new Set([z, a, c, b]).size).toBe(4);
  });

  it("keeps working after many insertions at the same place", () => {
    let low = rankBetween(null, null);
    const high = rankBetween(low, null);
    for (let i = 0; i < 500; i++) {
      const mid = rankBetween(low, high);
      expect(low < mid && mid < high).toBe(true);
      low = mid;
    }
  });

  it("refuses bounds in the wrong order", () => {
    expect(() => rankBetween("b", "a")).toThrow();
    expect(() => rankBetween("a", "a")).toThrow();
  });
});

describe("ranksBetween", () => {
  it("returns sorted, distinct and short ranks", () => {
    const ranks = ranksBetween(null, null, 1000);
    expect(ranks).toHaveLength(1000);
    expect([...ranks].sort()).toEqual(ranks);
    expect(new Set(ranks).size).toBe(1000);
    expect(Math.max(...ranks.map((r) => r.length))).toBeLessThanOrEqual(4);
  });

  it("fits between existing ranks", () => {
    const ranks = ranksBetween("a", "b", 50);
    expect(ranks.every((r) => r > "a" && r < "b")).toBe(true);
  });
});
