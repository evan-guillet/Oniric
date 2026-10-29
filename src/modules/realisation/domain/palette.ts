/** A colour of a palette, with how much of the images it stands for. */
export interface Swatch {
  hex: string;
  weight: number;
}

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Squared distance between two colours, weighted for the eye (red-mean). */
function distance(a: number[], b: number[]): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/**
 * The main colours of RGBA pixels [MOO-04]: the pixels are gathered in boxes of similar colour, the fullest boxes
 * become the swatches, and those too close to a stronger one are merged into it. Transparent pixels do not count.
 */
export function extractPalette(pixels: Uint8ClampedArray, count = 6): Swatch[] {
  const boxes = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // 4 bits a channel: 4096 boxes.
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const box = boxes.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    box.n++;
    box.r += r;
    box.g += g;
    box.b += b;
    boxes.set(k, box);
    total++;
  }
  if (total === 0) return [];
  const sorted = [...boxes.values()].map((b) => ({ n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n] })).sort((a, b) => b.n - a.n);
  const kept: { n: number; c: number[] }[] = [];
  // Close enough to be the same colour on a moodboard.
  const SAME = 2200;
  for (const s of sorted) {
    const near = kept.find((k) => distance(k.c, s.c) < SAME);
    if (near) near.n += s.n;
    else kept.push({ ...s });
  }
  return kept
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((k) => ({ hex: hex(k.c[0], k.c[1], k.c[2]), weight: k.n / total }));
}

/** The palette of several images, each weighted by its own share, the strongest first. */
export function mergePalettes(palettes: Swatch[][], count = 8): Swatch[] {
  const all: { c: number[]; w: number }[] = palettes.flat().map((s) => ({
    c: [1, 3, 5].map((i) => parseInt(s.hex.slice(i, i + 2), 16)),
    w: s.weight / Math.max(1, palettes.length),
  }));
  const kept: { c: number[]; w: number }[] = [];
  for (const s of all.sort((a, b) => b.w - a.w)) {
    const near = kept.find((k) => distance(k.c, s.c) < 2200);
    if (near) near.w += s.w;
    else kept.push({ ...s });
  }
  return kept
    .sort((a, b) => b.w - a.w)
    .slice(0, count)
    .map((k) => ({ hex: hex(k.c[0], k.c[1], k.c[2]), weight: k.w }));
}

/** Black or white, whichever reads best on `color`. */
export function inkOn(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return "#111111";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
}
