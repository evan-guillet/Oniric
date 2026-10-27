import { ELEMENT_TYPES, formatCss, spacingOf, type ElementType, type ScreenplayFormat } from "../../domain/formats";

/**
 * Lets the browser engine wrap each element in a hidden box styled exactly like the editor and the printed page,
 * then reads where each line starts.
 */
export class Measurer {
  private readonly root: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly boxes = new Map<ElementType, HTMLParagraphElement>();
  private readonly cache = new Map<string, number[]>();
  private readonly range = document.createRange();
  private lineHeightPx = 16;
  measuredCount = 0;

  constructor(readonly format: ScreenplayFormat) {
    this.style = document.createElement("style");
    this.style.textContent = formatCss(format).replace(/\.fmt/g, `.fmt-measure-${format.id}`);
    document.head.appendChild(this.style);
    this.root = document.createElement("div");
    this.root.className = `fmt-measure-${format.id}`;
    this.root.setAttribute("aria-hidden", "true");
    Object.assign(this.root.style, { position: "absolute", left: "-20000px", top: "0", visibility: "hidden", contain: "layout style" });
    for (const type of ELEMENT_TYPES) {
      const p = document.createElement("p");
      p.className = `el el-${type}`;
      this.root.appendChild(p);
      this.boxes.set(type, p);
    }
    document.body.appendChild(this.root);
    this.lineHeightPx = parseFloat(getComputedStyle(this.boxes.get("action")!).lineHeight) / spacingOf(format.elements.action);
  }

  lineStarts(type: ElementType, text: string): number[] {
    if (text.length === 0) return [0];
    const key = `${type}\u0000${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const p = this.boxes.get(type)!;
    p.textContent = text;
    const node = p.firstChild as Text;
    const box = p.getBoundingClientRect();
    // A double-spaced element's lines are twice as tall.
    const lineHeight = this.lineHeightPx * spacingOf(this.format.elements[type]);
    const lines = Math.round(box.height / lineHeight);
    const starts = [0];
    const lineOf = (i: number) => {
      this.range.setStart(node, i);
      this.range.setEnd(node, i + 1);
      const rects = this.range.getClientRects();
      const rect = rects.length > 0 ? rects[0] : this.range.getBoundingClientRect();
      return Math.floor((rect.top - box.top + lineHeight / 2) / lineHeight);
    };
    for (let k = 1; k < lines; k++) {
      let lo = starts[k - 1] + 1;
      let hi = text.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (lineOf(mid) >= k) hi = mid;
        else lo = mid + 1;
      }
      starts.push(lo);
    }
    this.measuredCount++;
    if (this.cache.size > 50_000) this.cache.clear();
    this.cache.set(key, starts);
    return starts;
  }

  dispose(): void {
    this.root.remove();
    this.style.remove();
  }
}
