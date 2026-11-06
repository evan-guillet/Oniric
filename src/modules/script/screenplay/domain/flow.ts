import { spacingOf, type ScreenplayFormat } from "./formats";
import type { PageLine, Pagination } from "./types";

/**
 * The script without its page breaks, as one long page: what only a break calls for (« (SUITE) », « (à suivre) ») goes,
 * and the space an element loses at the top of a page comes back.
 */
export function flowPagination(pagination: Pagination, format: ScreenplayFormat): Pagination {
  const lines: PageLine[] = [];
  let row = 0;
  let last: PageLine | null = null;
  for (const page of pagination.pages) {
    let above: PageLine | null = null;
    for (const line of page.lines) {
      if (line.kind !== "text") continue;
      if (above) row += line.row - above.row;
      else if (last) {
        row += spacingOf(format.elements[last.type]);
        if (line.blockIndex !== last.blockIndex) row += format.elements[line.type].spaceBefore;
      }
      lines.push({ ...line, row });
      above = line;
      last = line;
    }
  }
  const usedRows = last ? row + spacingOf(format.elements[last.type]) : 0;
  return { ...pagination, pages: [{ number: 1, lines, usedRows }] };
}
