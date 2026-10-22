import { displayText, type ScreenplayFormat } from "../domain/formats";
import type { Pagination } from "../domain/types";

/** The text and row of every printed line, as computed by the layout: what scripts/verifier-pdf.mjs compares the PDF with. */
export interface ExpectedPdf {
  format: string;
  linesPerPage: number;
  /** Pages printed before the screenplay (title page). */
  titlePages?: number;
  pages: { number: number; lines: { row: number; text: string }[] }[];
}

export function expectedPdf(p: Pagination, f: ScreenplayFormat): ExpectedPdf {
  return {
    format: f.id,
    linesPerPage: p.linesPerPage,
    pages: p.pages.map((page) => ({
      number: page.number,
      lines: page.lines.filter((l) => l.text.length > 0).map((l) => ({ row: l.row, text: displayText(f, l.type, l.text) })),
    })),
  };
}
