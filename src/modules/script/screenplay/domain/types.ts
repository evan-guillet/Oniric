import type { ElementType } from "./formats";

/** One element of the screenplay, already split into lines by the measuring step. */
export interface LaidBlock {
  type: ElementType;
  text: string;
  /** Character offset in `text` where each line starts; always begins with 0. */
  lineStarts: number[];
  sceneIndex: number;
}

export interface PageLine {
  row: number;
  type: ElementType;
  text: string;
  kind: "text" | "more" | "contd";
  blockIndex: number;
}

export interface Page {
  number: number;
  lines: PageLine[];
  usedRows: number;
}

/** Where a page starts inside the document: before a block (offset 0) or inside it. */
export interface PageStart {
  page: number;
  blockIndex: number;
  offset: number;
  /** "(MORE)" printed at the bottom of the previous page. */
  more: boolean;
  /** Character name repeated at the top of the page, with "(CONT'D)". */
  contd: string | null;
  previousUsedRows: number;
}

export interface Pagination {
  pages: Page[];
  starts: PageStart[];
  sceneEighths: number[];
  linesPerPage: number;
}
