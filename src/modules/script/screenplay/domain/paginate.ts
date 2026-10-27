import { linesPerPage, spacingOf, type ElementType, type ScreenplayFormat } from "./formats";
import type { LaidBlock, Page, PageStart, Pagination } from "./types";

const SENTENCE_END = /[.!?…:;]["»”)]?$/;

export function lineText(b: LaidBlock, k: number): string {
  const end = k + 1 < b.lineStarts.length ? b.lineStarts[k + 1] : b.text.length;
  return b.text.slice(b.lineStarts[k], end).replace(/\s+$/, "");
}

interface LineRef {
  block: number;
  line: number;
}

/**
 * Pure page-breaking: receives elements already split into lines and applies the screenplay rules
 * (heading kept with what follows, dialogue split with MORE / CONT'D, at least two lines on each side of a split).
 * A line of a double-spaced element takes two rows.
 */
export function paginate(blocks: LaidBlock[], format: ScreenplayFormat): Pagination {
  const L = linesPerPage(format);
  const sceneRows: number[] = [];
  const pages: Page[] = [];
  const starts: PageStart[] = [];
  let page: Page = { number: 1, lines: [], usedRows: 0 };
  pages.push(page);
  starts.push({ page: 1, blockIndex: 0, offset: 0, more: false, contd: null, previousUsedRows: 0 });
  let y = 0;

  const addRows = (blockIndex: number, rows: number) => {
    const s = blocks[blockIndex].sceneIndex;
    sceneRows[s] = (sceneRows[s] ?? 0) + rows;
  };
  /** Rows taken by each line of block `i`. */
  const step = (i: number) => spacingOf(format.elements[blocks[i].type]);
  const spaceBefore = (i: number) => (y === 0 ? 0 : format.elements[blocks[i].type].spaceBefore);
  const skipSpace = (i: number) => {
    const s = spaceBefore(i);
    y += s;
    addRows(i, s);
  };
  const putLine = (i: number, k: number) => {
    page.lines.push({ row: y, type: blocks[i].type, text: lineText(blocks[i], k), kind: "text", blockIndex: i });
    y += step(i);
    addRows(i, step(i));
  };
  const putLabel = (i: number, type: ElementType, text: string, kind: "more" | "contd") => {
    page.lines.push({ row: y, type, text, kind, blockIndex: i });
    y++;
    addRows(i, 1);
  };
  const newPage = (blockIndex: number, offset: number, more: boolean, contd: string | null) => {
    page.usedRows = y;
    starts.push({ page: page.number + 1, blockIndex, offset, more, contd, previousUsedRows: y });
    page = { number: page.number + 1, lines: [], usedRows: 0 };
    pages.push(page);
    y = 0;
  };
  const endsSentence = (r: LineRef) =>
    r.line === blocks[r.block].lineStarts.length - 1 || SENTENCE_END.test(lineText(blocks[r.block], r.line));

  const rowsFrom = (refs: LineRef[], from: number) => refs.slice(from).reduce((n, r) => n + step(r.block), 0);
  /** How many lines from `from` fit in `avail` rows. */
  const fit = (refs: LineRef[], from: number, avail: number): number => {
    let k = 0;
    for (let used = 0; from + k < refs.length && used + step(refs[from + k].block) <= avail; k++) used += step(refs[from + k].block);
    return k;
  };

  /** Number of lines to keep on the current page, or 0 when no acceptable split exists. */
  const chooseSplit = (refs: LineRef[], from: number, avail: number): number => {
    const rest = refs.length - from;
    let fallback = 0;
    for (let k = Math.min(fit(refs, from, avail), rest - 2); k >= 2; k--) {
      const last = refs[from + k - 1];
      if (blocks[last.block].type === "parenthetical") continue;
      if (endsSentence(last)) return k;
      if (fallback === 0) fallback = k;
    }
    return fallback;
  };

  const lineRefs = (i: number): LineRef[] => blocks[i].lineStarts.map((_, line) => ({ block: i, line }));
  const offsetOf = (r: LineRef) => blocks[r.block].lineStarts[r.line];

  const placeSplittable = (i: number) => {
    const refs = lineRefs(i);
    let pos = 0;
    while (pos < refs.length) {
      const space = pos === 0 ? spaceBefore(i) : 0;
      if (y + space + rowsFrom(refs, pos) <= L) {
        if (pos === 0) skipSpace(i);
        for (; pos < refs.length; pos++) putLine(i, refs[pos].line);
        return;
      }
      const avail = L - y - space;
      let k = chooseSplit(refs, pos, avail);
      if (k === 0 && y === 0) k = Math.max(1, fit(refs, pos, avail));
      if (k === 0) {
        newPage(i, offsetOf(refs[pos]), false, null);
        continue;
      }
      if (pos === 0) skipSpace(i);
      for (const end = pos + k; pos < end; pos++) putLine(i, refs[pos].line);
      newPage(i, offsetOf(refs[pos]), false, null);
    }
  };

  const placeDialogue = (c: number, members: number[]) => {
    const refs = members.flatMap(lineRefs);
    const nameLines = blocks[c].lineStarts.length;
    const nameRows = nameLines * step(c);
    const name = blocks[c].text.trim();
    let pos = 0;
    let headerPlaced = false;
    const putHeader = () => {
      skipSpace(c);
      for (let k = 0; k < nameLines; k++) putLine(c, k);
      headerPlaced = true;
    };
    while (true) {
      const header = headerPlaced ? 0 : spaceBefore(c) + nameRows;
      const rest = refs.length - pos;
      if (y + header + rowsFrom(refs, pos) <= L) {
        if (!headerPlaced) putHeader();
        for (; pos < refs.length; pos++) putLine(refs[pos].block, refs[pos].line);
        return;
      }
      const avail = L - y - header - 1;
      let k = chooseSplit(refs, pos, avail);
      const freshPage = headerPlaced ? y <= 1 : y === 0;
      if (k === 0 && freshPage) k = Math.max(1, Math.min(fit(refs, pos, avail), rest - 1));
      if (k === 0) {
        newPage(c, 0, false, null);
        continue;
      }
      if (!headerPlaced) putHeader();
      for (const end = pos + k; pos < end; pos++) putLine(refs[pos].block, refs[pos].line);
      putLabel(c, "character", format.labels.more, "more");
      newPage(refs[pos].block, offsetOf(refs[pos]), true, name);
      putLabel(c, "character", `${name} ${format.labels.contd}`, "contd");
    }
  };

  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const lines = b.lineStarts.length;
    const rows = lines * step(i);
    if (b.type === "character") {
      const members: number[] = [];
      let j = i + 1;
      while (j < blocks.length && (blocks[j].type === "dialogue" || blocks[j].type === "parenthetical")) members.push(j++);
      placeDialogue(i, members);
      i = j;
      continue;
    }
    if (b.type === "scene_heading" || b.type === "shot" || b.type === "transition") {
      let keep = 0;
      const next = blocks[i + 1];
      if (next && b.type !== "transition") {
        const nextSpace = format.elements[next.type].spaceBefore;
        if (next.type === "character") {
          const dialogue = blocks[i + 2] && blocks[i + 2].type !== "character" ? blocks[i + 2].lineStarts.length : 0;
          keep = nextSpace + next.lineStarts.length * step(i + 1) + Math.min(2, dialogue) * (dialogue > 0 ? step(i + 2) : 1);
        } else {
          keep = nextSpace + Math.min(2, next.lineStarts.length) * step(i + 1);
        }
      }
      if (y > 0 && y + spaceBefore(i) + rows + keep > L) newPage(i, 0, false, null);
      skipSpace(i);
      for (let k = 0; k < lines; k++) putLine(i, k);
      i++;
      continue;
    }
    placeSplittable(i);
    i++;
  }
  page.usedRows = y;

  const sceneCount = blocks.length > 0 ? blocks[blocks.length - 1].sceneIndex + 1 : 0;
  const sceneEighths = Array.from({ length: sceneCount }, (_, s) => Math.max(1, Math.ceil(((sceneRows[s] ?? 0) * 8) / L - 1e-9)));
  return { pages, starts, sceneEighths, linesPerPage: L };
}
