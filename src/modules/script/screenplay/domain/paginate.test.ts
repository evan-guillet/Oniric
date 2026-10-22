import { describe, expect, it } from "vitest";
import { US_FORMAT, linesPerPage, type ElementType } from "./formats";
import { paginate } from "./paginate";
import type { LaidBlock } from "./types";

const L = linesPerPage(US_FORMAT);

/** A block of `n` lines; each line is a short sentence so that any split point is a sentence end unless `run` is set. */
function block(type: ElementType, n: number, sceneIndex = 0, run = false): LaidBlock {
  const parts = Array.from({ length: n }, (_, i) => (run ? `mot${i} ` : `Ligne ${i}. `));
  const lineStarts: number[] = [];
  let offset = 0;
  for (const p of parts) {
    lineStarts.push(offset);
    offset += p.length;
  }
  return { type, text: parts.join(""), lineStarts, sceneIndex };
}

describe("paginate", () => {
  it("uses 54 lines per US page", () => {
    expect(L).toBe(54);
  });

  it("drops the space before the first element of a page", () => {
    const p = paginate([block("scene_heading", 1), block("action", 2)], US_FORMAT);
    expect(p.pages[0].lines.map((l) => l.row)).toEqual([0, 2, 3]);
  });

  it("keeps a scene heading with the first lines that follow it", () => {
    const blocks = [block("action", L - 3), block("scene_heading", 1), block("action", 5)];
    const p = paginate(blocks, US_FORMAT);
    expect(p.pages).toHaveLength(2);
    expect(p.starts[1]).toMatchObject({ blockIndex: 1, offset: 0, more: false });
    expect(p.pages[1].lines[0]).toMatchObject({ row: 0, type: "scene_heading" });
  });

  it("splits a long action with at least two lines on each side", () => {
    const blocks = [block("action", L - 4), block("action", 6)];
    const p = paginate(blocks, US_FORMAT);
    const onFirst = p.pages[0].lines.filter((l) => l.blockIndex === 1).length;
    expect(onFirst).toBe(3);
    expect(p.starts[1]).toMatchObject({ blockIndex: 1, offset: blocks[1].lineStarts[3] });
  });

  it("moves an action whole when fewer than two lines would stay behind", () => {
    const blocks = [block("action", L - 2), block("action", 6)];
    const p = paginate(blocks, US_FORMAT);
    expect(p.starts[1]).toMatchObject({ blockIndex: 1, offset: 0 });
  });

  it("splits a dialogue with MORE and CONT'D", () => {
    const blocks = [block("action", L - 8), block("character", 1), block("dialogue", 10)];
    blocks[1].text = "MARIE";
    blocks[1].lineStarts = [0];
    const p = paginate(blocks, US_FORMAT);
    const first = p.pages[0].lines;
    expect(first[first.length - 1]).toMatchObject({ kind: "more", text: "(MORE)", row: L - 1 });
    expect(p.pages[1].lines[0]).toMatchObject({ kind: "contd", text: "MARIE (CONT'D)", row: 0 });
    expect(p.starts[1]).toMatchObject({ blockIndex: 2, more: true, contd: "MARIE" });
    const dialogueLines = p.pages.flatMap((pg) => pg.lines).filter((l) => l.blockIndex === 2 && l.kind === "text");
    expect(dialogueLines).toHaveLength(10);
  });

  it("prefers to split a dialogue at the end of a sentence", () => {
    const blocks = [block("action", L - 9), block("character", 1), block("dialogue", 10, 0, true)];
    blocks[2].text = blocks[2].text.replace("mot3 ", "mot3. ");
    blocks[2].lineStarts = blocks[2].lineStarts.map((s, i) => (i > 3 ? s + 1 : s));
    const p = paginate(blocks, US_FORMAT);
    const kept = p.pages[0].lines.filter((l) => l.blockIndex === 2).length;
    expect(kept).toBe(4);
  });

  it("never leaves a parenthetical alone at the bottom of a page", () => {
    const blocks = [block("action", L - 6), block("character", 1), block("dialogue", 2), block("parenthetical", 1), block("dialogue", 4)];
    const p = paginate(blocks, US_FORMAT);
    const lastText = p.pages[0].lines.filter((l) => l.kind === "text").at(-1)!;
    expect(lastText.type).not.toBe("parenthetical");
  });

  it("counts scene length in eighths of a page", () => {
    const p = paginate([block("scene_heading", 1, 0), block("action", 26, 0), block("scene_heading", 1, 1), block("action", 2, 1)], US_FORMAT);
    expect(p.sceneEighths).toEqual([5, 1]);
  });

  it("paginates 120 pages quickly", () => {
    const blocks: LaidBlock[] = [];
    for (let s = 0; s < 120; s++) {
      blocks.push(block("scene_heading", 1, s));
      for (let k = 0; k < 8; k++) {
        blocks.push(block("action", 2, s), block("character", 1, s), block("dialogue", 3, s));
      }
    }
    const t0 = performance.now();
    const p = paginate(blocks, US_FORMAT);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(p.pages.length).toBeGreaterThan(100);
  });
});
