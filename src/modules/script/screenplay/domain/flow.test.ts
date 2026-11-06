import { describe, expect, it } from "vitest";
import { flowPagination } from "./flow";
import { US_FORMAT, type ElementType } from "./formats";
import type { PageLine, Pagination } from "./types";

const line = (row: number, type: ElementType, blockIndex: number, kind: PageLine["kind"] = "text"): PageLine => ({ row, type, text: `${type}${row}`, kind, blockIndex });
const pagination = (...pages: PageLine[][]): Pagination => ({
  pages: pages.map((lines, i) => ({ number: i + 1, lines, usedRows: 0 })),
  starts: [],
  sceneEighths: [],
  linesPerPage: 55,
});

describe("flowPagination", () => {
  it("makes one page without page number", () => {
    const flow = flowPagination(pagination([line(0, "action", 0)], [line(0, "action", 1)]), US_FORMAT);
    expect(flow.pages).toHaveLength(1);
    expect(flow.pages[0].number).toBe(1);
  });
  it("keeps the rows inside a page", () => {
    const flow = flowPagination(pagination([line(0, "action", 0), line(1, "action", 0), line(3, "action", 1)]), US_FORMAT);
    expect(flow.pages[0].lines.map((l) => l.row)).toEqual([0, 1, 3]);
    expect(flow.pages[0].usedRows).toBe(4);
  });
  it("gives back the space lost at the top of a page", () => {
    const space = US_FORMAT.elements.action.spaceBefore;
    const flow = flowPagination(pagination([line(0, "action", 0)], [line(0, "action", 1)]), US_FORMAT);
    expect(flow.pages[0].lines[1].row).toBe(1 + space);
  });
  it("joins a dialogue split over two pages, without its marks", () => {
    const flow = flowPagination(
      pagination(
        [line(0, "dialogue", 0), line(1, "dialogue", 0, "more")],
        [line(0, "character", 0, "contd"), line(1, "dialogue", 0), line(2, "dialogue", 0)],
      ),
      US_FORMAT,
    );
    expect(flow.pages[0].lines.map((l) => [l.row, l.kind])).toEqual([
      [0, "text"],
      [1, "text"],
      [2, "text"],
    ]);
  });
});
