import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { lineHeightIn, type ElementType, type ScreenplayFormat } from "../../domain/formats";
import type { PageStart, Pagination } from "../../domain/types";

function div(className: string, style: Partial<CSSStyleDeclaration>, text?: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = className;
  Object.assign(d.style, style);
  if (text) d.textContent = text;
  return d;
}

function breakWidget(f: ScreenplayFormat, s: PageStart, L: number, insideType: ElementType | null): HTMLElement {
  const lh = lineHeightIn(f);
  const shift = f.margins.left + (insideType ? f.elements[insideType].indent : 0);
  const root = document.createElement(insideType ? "span" : "div");
  root.className = "pg-break";
  root.contentEditable = "false";
  Object.assign(root.style, { display: "block", marginLeft: `${-shift}in`, width: `${f.page.width}in`, textTransform: "none" });

  const character = f.elements.character;
  const labelStyle = { height: `${lh}in`, paddingLeft: `${f.margins.left + character.indent}in`, textTransform: "uppercase" };
  if (s.more) root.appendChild(div("pg-label", labelStyle, f.labels.more));
  root.appendChild(div("pg-fill", { height: `${(L - s.previousUsedRows) * lh + f.margins.bottom}in` }));
  root.appendChild(div("pg-gap", {}));
  const top = div("pg-top", { height: `${f.margins.top}in` });
  top.appendChild(div("pg-number", { top: `${f.pageNumberTop}in`, right: `${f.margins.right}in` }, `${s.page}.`));
  root.appendChild(top);
  if (s.contd) root.appendChild(div("pg-label", labelStyle, `${s.contd} ${f.labels.contd}`));
  return root;
}

function endWidget(f: ScreenplayFormat, usedRows: number, L: number): HTMLElement {
  const lh = lineHeightIn(f);
  const d = div("pg-end", { height: `${(L - usedRows) * lh + f.margins.bottom}in`, marginLeft: `${-f.margins.left}in`, width: `${f.page.width}in` });
  d.contentEditable = "false";
  return d;
}

/** Positions (before the node) of every screenplay element, in document order. */
export function blockPositions(doc: PMNode): number[] {
  const out: number[] = [];
  doc.forEach((scene, sceneOffset) => scene.forEach((_b, offset) => out.push(sceneOffset + 1 + offset)));
  return out;
}

export function pageDecorations(doc: PMNode, p: Pagination, f: ScreenplayFormat): DecorationSet {
  const positions = blockPositions(doc);
  const decos: Decoration[] = [];
  for (const s of p.starts) {
    const pos = positions[s.blockIndex];
    if (pos === undefined) continue;
    const node = doc.nodeAt(pos)!;
    const key = `b${s.page}-${s.previousUsedRows}-${s.more}-${s.contd}-${f.id}`;
    if (s.offset === 0) {
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "page-top" }));
      if (s.page > 1) decos.push(Decoration.widget(pos, () => breakWidget(f, s, p.linesPerPage, null), { side: -1, key }));
    } else {
      const type = node.type.name as ElementType;
      decos.push(Decoration.widget(pos + 1 + s.offset, () => breakWidget(f, s, p.linesPerPage, type), { side: -1, key: `${key}-${type}` }));
    }
  }
  const last = p.pages[p.pages.length - 1];
  decos.push(Decoration.widget(doc.content.size, () => endWidget(f, last.usedRows, p.linesPerPage), { side: 1, key: `end-${last.usedRows}-${f.id}` }));
  return DecorationSet.create(doc, decos);
}
