export const ELEMENT_TYPES = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
  "on_screen_text",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

/** Distances in inches, measured from the left margin of the page. */
export interface ElementStyle {
  indent: number;
  width: number;
  spaceBefore: number;
  uppercase: boolean;
  italic: boolean;
  align: "left" | "right";
}

export interface ScreenplayFormat {
  id: string;
  name: string;
  /** Paper size, used in file names. */
  paper: string;
  /** Language of the labels and of the typography rules. */
  language: "fr" | "en";
  page: { width: number; height: number };
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  fontSizePt: number;
  lineHeightPt: number;
  elements: Record<ElementType, ElementStyle>;
  labels: { more: string; contd: string };
  pageNumberTop: number;
  linesPerEighth?: number;
}

const el = (
  indent: number,
  width: number,
  spaceBefore: number,
  uppercase = false,
  align: "left" | "right" = "left",
  italic = false,
): ElementStyle => ({ indent, width, spaceBefore, uppercase, italic, align });

export const US_FORMAT: ScreenplayFormat = {
  id: "us",
  name: "Américain (Letter)",
  paper: "Letter",
  language: "en",
  page: { width: 8.5, height: 11 },
  margins: { top: 1, bottom: 1, left: 1.5, right: 1 },
  fontFamily: "Courier Prime",
  fontSizePt: 12,
  lineHeightPt: 12,
  elements: {
    scene_heading: el(0, 6, 1, true),
    action: el(0, 6, 1),
    character: el(2.2, 3.3, 1, true),
    parenthetical: el(1.6, 1.9, 0),
    dialogue: el(1, 3.5, 0),
    transition: el(4, 2, 1, true, "right"),
    shot: el(0, 6, 1, true),
    on_screen_text: el(0, 6, 1, false, "left", true),
  },
  labels: { more: "(MORE)", contd: "(CONT'D)" },
  pageNumberTop: 0.5,
};

export const FR_FORMAT: ScreenplayFormat = {
  id: "fr",
  name: "Français (A4)",
  paper: "A4",
  language: "fr",
  page: { width: 8.2677, height: 11.6929 },
  margins: { top: 1, bottom: 1, left: 1.38, right: 0.98 },
  fontFamily: "Courier Prime",
  fontSizePt: 12,
  lineHeightPt: 12,
  elements: {
    scene_heading: el(0, 5.9, 1, true),
    action: el(0, 5.9, 1),
    character: el(2.2, 3.3, 1, true),
    parenthetical: el(1.6, 1.9, 0),
    dialogue: el(1, 3.5, 0),
    transition: el(3.9, 2, 1, true, "right"),
    shot: el(0, 5.9, 1, true),
    on_screen_text: el(0, 5.9, 1, false, "left", true),
  },
  labels: { more: "(À SUIVRE)", contd: "(SUITE)" },
  pageNumberTop: 0.5,
};

export const FORMATS = [FR_FORMAT, US_FORMAT];

export function formatById(id: string | null | undefined): ScreenplayFormat {
  return FORMATS.find((f) => f.id === id) ?? FR_FORMAT;
}

export function linesPerPage(f: ScreenplayFormat): number {
  return Math.floor(((f.page.height - f.margins.top - f.margins.bottom) * 72) / f.lineHeightPt + 1e-6);
}

export function lineHeightIn(f: ScreenplayFormat): number {
  return f.lineHeightPt / 72;
}

/** CSS shared by the editor, the measuring box and the printed pages, so that all three wrap lines identically. */
export function formatCss(f: ScreenplayFormat, withPage = true): string {
  const lh = lineHeightIn(f);
  const rules = [
    `.fmt { --lh: ${lh}in; font-family: "${f.fontFamily}", monospace; font-size: ${f.fontSizePt}pt; line-height: ${lh}in;` +
      ` font-kerning: none; font-variant-ligatures: none; font-feature-settings: "kern" 0, "liga" 0; text-rendering: geometricPrecision; }`,
    `.fmt .el { margin: 0; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; hyphens: manual; box-sizing: border-box; padding: 0; }`,
  ];
  for (const [type, s] of Object.entries(f.elements)) {
    rules.push(
      `.fmt .el-${type} { margin-left: ${s.indent}in; width: ${s.width}in; text-align: ${s.align};` +
        ` text-transform: ${s.uppercase ? "uppercase" : "none"}; font-style: ${s.italic ? "italic" : "normal"}; }`,
      `.fmt .ProseMirror .el-${type} { --space-before: ${s.spaceBefore * lh}in; padding-top: var(--space-before); }`,
    );
  }
  rules.push(`.fmt .ProseMirror .el.page-top { --space-before: 0in; }`);
  if (withPage) rules.push(`@page { size: ${f.page.width}in ${f.page.height}in; margin: 0; }`);
  return rules.join("\n");
}

export function displayText(f: ScreenplayFormat, type: ElementType, text: string): string {
  return f.elements[type].uppercase ? text.toLocaleUpperCase(f.language) : text;
}
