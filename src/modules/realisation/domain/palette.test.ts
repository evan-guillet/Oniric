import { describe, expect, it } from "vitest";
import { extractPalette, inkOn, mergePalettes } from "./palette";

/** `n` pixels of each colour, in RGBA. */
function pixels(colors: [number, number, number, number][], n: number[]): Uint8ClampedArray {
  const out: number[] = [];
  colors.forEach((c, i) => {
    for (let k = 0; k < n[i]; k++) out.push(...c);
  });
  return new Uint8ClampedArray(out);
}

describe("palette", () => {
  it("gives the main colours, the strongest first, with their share", () => {
    const p = extractPalette(pixels([[200, 30, 30, 255], [20, 40, 160, 255]], [300, 100]));
    expect(p.map((s) => s.hex)).toEqual(["#c81e1e", "#1428a0"]);
    expect(p[0].weight).toBeCloseTo(0.75);
  });

  it("merges shades too close to tell apart on a board", () => {
    const p = extractPalette(pixels([[200, 30, 30, 255], [205, 34, 30, 255], [20, 40, 160, 255]], [100, 100, 50]));
    expect(p).toHaveLength(2);
  });

  it("leaves out transparent pixels", () => {
    expect(extractPalette(pixels([[0, 0, 0, 0]], [50]))).toEqual([]);
  });

  it("joins the palettes of several images, the stronger shade naming the colour", () => {
    const merged = mergePalettes([[{ hex: "#c81e1e", weight: 0.8 }, { hex: "#ffffff", weight: 0.2 }], [{ hex: "#ca1f1f", weight: 1 }]]);
    expect(merged[0].hex).toBe("#ca1f1f");
    expect(merged).toHaveLength(2);
  });

  it("writes in black on light colours and in white on dark ones", () => {
    expect(inkOn("#f5e6c8")).toBe("#111111");
    expect(inkOn("#1428a0")).toBe("#ffffff");
  });
});
