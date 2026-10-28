import { t } from "../../../../core/i18n";
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
  align: "left" | "center" | "right";
  underline?: boolean;
  /** 2 for double-spaced lines (multi-camera dialogue); each line then takes two rows of the page. */
  spacing?: 1 | 2;
}

export type FormatLanguage = "fr" | "en" | "de" | "es";

/** Where a provided format is listed. */
export type FormatKind = "film" | "tv" | "stage" | "audio";

export const FORMAT_KINDS: { id: FormatKind; readonly label: string }[] = (["film", "tv", "stage", "audio"] as const).map((id) => ({
  id,
  get label() {
    return t(`formats.kinds.${id}`);
  },
}));

export interface ScreenplayFormat {
  id: string;
  name: string;
  /** Paper size, used in file names. */
  paper: string;
  /** Language of the labels and of the typography rules. */
  language: FormatLanguage;
  kind?: FormatKind;
  /** One line saying what the format is for, under its name in the lists. */
  help?: string;
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
  align: ElementStyle["align"] = "left",
  italic = false,
  more: Pick<ElementStyle, "underline" | "spacing"> = {},
): ElementStyle => ({ indent, width, spaceBefore, uppercase, italic, align, ...more });

const LETTER = { width: 8.5, height: 11 };
const A4 = { width: 8.2677, height: 11.6929 };
const LABELS = {
  fr: { more: "(À SUIVRE)", contd: "(SUITE)" },
  en: { more: "(MORE)", contd: "(CONT'D)" },
  de: { more: "(WEITER)", contd: "(FORTS.)" },
  es: { more: "(SIGUE)", contd: "(CONT.)" },
};

export const US_FORMAT: ScreenplayFormat = {
  id: "us",
  name: "Américain (Letter)",
  kind: "film",
  help: "Le format de Final Draft pour le cinéma et les séries à une caméra",
  paper: "Letter",
  language: "en",
  page: LETTER,
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
  labels: LABELS.en,
  pageNumberTop: 0.5,
};

export const FR_FORMAT: ScreenplayFormat = {
  id: "fr",
  name: "Français (A4)",
  kind: "film",
  help: "Le format des scénarios français, en A4",
  paper: "A4",
  language: "fr",
  page: A4,
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
  labels: LABELS.fr,
  pageNumberTop: 0.5,
};

/** A provided format built on another one: its own page, elements and labels where they differ. */
function variant(
  base: ScreenplayFormat,
  patch: Omit<Partial<ScreenplayFormat>, "elements"> & { id: string; name: string; elements?: Partial<Record<ElementType, ElementStyle>> },
): ScreenplayFormat {
  const { elements, ...rest } = patch;
  return { ...base, ...rest, elements: { ...base.elements, ...elements } };
}

/** The American screenplay in the language of a foreign production, as Final Draft's « US Screenplay (French) ». */
const translated = (language: "fr" | "de" | "es", id: string, name: string, help: string) =>
  variant(US_FORMAT, { id, name, help, language, labels: LABELS[language] });

/** The older layout of Hillis Cole and Judith Haag's guide: every column a little to the right. */
export const COLE_HAAG_FORMAT = variant(US_FORMAT, {
  id: "cole-haag",
  name: "Cole et Haag (Letter)",
  help: "L'ancienne mise en page du guide de Cole et Haag, colonnes décalées vers la droite",
  margins: { top: 1, bottom: 1, left: 1.7, right: 1 },
  elements: {
    scene_heading: el(0, 5.8, 1, true),
    action: el(0, 5.8, 1),
    character: el(2.3, 3.2, 1, true),
    parenthetical: el(1.7, 2, 0),
    dialogue: el(1, 3.5, 0),
    transition: el(3.8, 2, 1, true, "right"),
    shot: el(0, 5.8, 1, true),
    on_screen_text: el(0, 5.8, 1, false, "left", true),
  },
});

/** The studio layout: narrower dialogue set further in, which holds more on a page. */
export const WARNER_FORMAT = variant(US_FORMAT, {
  id: "warner",
  name: "Warner Bros. (Letter)",
  help: "La mise en page de studio : dialogue plus étroit et plus en retrait",
  margins: { top: 1, bottom: 0.75, left: 1.5, right: 0.75 },
  elements: {
    scene_heading: el(0, 6.25, 1, true),
    action: el(0, 6.25, 1),
    character: el(2.7, 3, 1, true),
    parenthetical: el(2.1, 2, 0),
    dialogue: el(1.4, 3.3, 0),
    transition: el(4.25, 2, 1, true, "right"),
    shot: el(0, 6.25, 1, true),
    on_screen_text: el(0, 6.25, 1, false, "left", true),
  },
});

/** BBC Writersroom's film and single-camera drama: the American columns on A4. */
export const BBC_FORMAT = variant(US_FORMAT, {
  id: "bbc",
  name: "BBC (A4)",
  help: "Le format de la BBC pour le cinéma et la fiction télé à une caméra",
  paper: "A4",
  page: A4,
  elements: {
    scene_heading: el(0, 5.75, 1, true),
    action: el(0, 5.75, 1),
    character: el(2.2, 3.3, 1, true),
    parenthetical: el(1.6, 1.9, 0),
    dialogue: el(1, 3.5, 0),
    transition: el(3.75, 2, 1, true, "right"),
    shot: el(0, 5.75, 1, true),
    on_screen_text: el(0, 5.75, 1, false, "left", true),
  },
});

/** The American sitcom shot before an audience: directions in capitals, dialogue double-spaced, scenes underlined. */
export const MULTICAM_FORMAT = variant(US_FORMAT, {
  id: "multicam",
  name: "Sitcom multi-caméra (Letter)",
  kind: "tv",
  help: "Sitcom tournée en public : didascalies en capitales, dialogue en double interligne",
  elements: {
    scene_heading: el(0, 6, 1, true, "left", false, { underline: true }),
    action: el(0, 6, 1, true),
    character: el(2.5, 3, 1, true),
    parenthetical: el(1.5, 2.5, 0),
    dialogue: el(1, 4, 0, false, "left", false, { spacing: 2 }),
    transition: el(4, 2, 1, true, "right", false, { underline: true }),
    shot: el(0, 6, 1, true, "left", false, { underline: true }),
    on_screen_text: el(0, 6, 1, true, "left", true),
  },
});

/** The BBC studio sitcom: name on the left, speech and capitalised directions in one column, double-spaced. */
export const BBC_SITCOM_FORMAT = variant(BBC_FORMAT, {
  id: "bbc-sitcom",
  name: "Sitcom BBC en studio (A4)",
  kind: "tv",
  help: "Sitcom BBC en public : répliques en double interligne, didascalies en capitales",
  elements: {
    scene_heading: el(0, 5.75, 1, true, "left", false, { underline: true }),
    action: el(1.5, 4.25, 1, true),
    character: el(0, 1.5, 1, true),
    parenthetical: el(1.5, 3, 0),
    dialogue: el(1.5, 4.25, 0, false, "left", false, { spacing: 2 }),
    transition: el(3.75, 2, 1, true, "right", false, { underline: true }),
    shot: el(1.5, 4.25, 1, true),
    on_screen_text: el(1.5, 4.25, 1, true, "left", true),
  },
});

/** The Dramatists Guild's traditional play: centred names, speech across the page, directions set in, in italics. */
export const STAGE_FORMAT = variant(US_FORMAT, {
  id: "stage",
  name: "Théâtre traditionnel (Letter)",
  kind: "stage",
  help: "Le format du Dramatists Guild : noms centrés, répliques pleine largeur, didascalies en retrait",
  elements: {
    scene_heading: el(0, 6, 1, true, "center", false, { underline: true }),
    action: el(2, 4, 1, false, "left", true),
    character: el(0, 6, 1, true, "center"),
    parenthetical: el(2, 4, 0, false, "left", true),
    dialogue: el(0, 6, 0),
    transition: el(4, 2, 1, true, "right"),
    shot: el(2, 4, 1, true),
    on_screen_text: el(2, 4, 1, false, "left", true),
  },
});

/** The Dramatists Guild's modern play: the name on its own line at the margin, directions set in. */
export const STAGE_MODERN_FORMAT = variant(STAGE_FORMAT, {
  id: "stage-modern",
  name: "Théâtre moderne (Letter)",
  help: "Le format moderne du Dramatists Guild : noms à la marge, didascalies en retrait",
  elements: {
    scene_heading: el(0, 6, 1, true),
    action: el(1.5, 4.5, 1, false, "left", true),
    character: el(0, 6, 1, true),
    parenthetical: el(1.5, 4.5, 0, false, "left", true),
    dialogue: el(0, 6, 0),
    transition: el(4, 2, 1, true, "right"),
    shot: el(1.5, 4.5, 1, true),
    on_screen_text: el(1.5, 4.5, 1, false, "left", true),
  },
});

/** A French play on A4: names centred, didascalies in italics. */
export const STAGE_FR_FORMAT = variant(FR_FORMAT, {
  id: "stage-fr",
  name: "Théâtre français (A4)",
  kind: "stage",
  help: "Noms des personnages centrés, didascalies en italique",
  elements: {
    scene_heading: el(0, 5.9, 1, true, "center"),
    action: el(1, 4.9, 1, false, "left", true),
    character: el(0, 5.9, 1, true, "center"),
    parenthetical: el(1, 4.9, 0, false, "left", true),
    dialogue: el(0, 5.9, 0),
    transition: el(3.9, 2, 1, true, "right"),
    shot: el(1, 4.9, 1, true),
    on_screen_text: el(1, 4.9, 1, false, "left", true),
  },
});

/** Audio drama and podcast: the name at the margin, the speech set in under it, cues in capitals. */
export const PODCAST_FORMAT = variant(US_FORMAT, {
  id: "podcast",
  name: "Podcast et fiction audio (Letter)",
  kind: "audio",
  help: "Noms à la marge, répliques en retrait, bruitages et musiques en capitales soulignées",
  elements: {
    scene_heading: el(0, 6, 1, true),
    action: el(0, 6, 1),
    character: el(0, 6, 1, true),
    parenthetical: el(1.5, 3, 0),
    dialogue: el(1.5, 4.5, 0),
    transition: el(4, 2, 1, true, "right"),
    shot: el(0, 6, 1, true, "left", false, { underline: true }),
    on_screen_text: el(0, 6, 1, false, "left", true),
  },
});

export const FORMATS = [
  FR_FORMAT,
  US_FORMAT,
  translated("fr", "us-fr", "Américain en français (Letter)", "La mise en page américaine, mentions et typographie françaises"),
  translated("de", "us-de", "Américain en allemand (Letter)", "La mise en page américaine, mentions en allemand"),
  translated("es", "us-es", "Américain en espagnol (Letter)", "La mise en page américaine, mentions en espagnol"),
  COLE_HAAG_FORMAT,
  WARNER_FORMAT,
  BBC_FORMAT,
  MULTICAM_FORMAT,
  BBC_SITCOM_FORMAT,
  STAGE_FORMAT,
  STAGE_MODERN_FORMAT,
  STAGE_FR_FORMAT,
  PODCAST_FORMAT,
];

/** The formats in their lists' groups; the user's own come last, under « Mes formats ». */
export function groupFormats(formats: ScreenplayFormat[]): { label: string; formats: ScreenplayFormat[] }[] {
  const provided = new Set(FORMATS.map((f) => f.id));
  const groups = FORMAT_KINDS.map((k) => ({ label: k.label, formats: formats.filter((f) => provided.has(f.id) && (f.kind ?? "film") === k.id) }));
  groups.push({ label: t("settings.myFormats"), formats: formats.filter((f) => !provided.has(f.id)) });
  return groups.filter((g) => g.formats.length > 0);
}

/** The name of a format in the interface's language; the user's own keep the name they were given. */
export function formatName(f: ScreenplayFormat): string {
  return FORMATS.some((x) => x.id === f.id) ? t(`formats.list.${f.id}.name`) : f.name;
}

export function formatHelp(f: ScreenplayFormat): string | undefined {
  return FORMATS.some((x) => x.id === f.id) ? t(`formats.list.${f.id}.help`) : f.help;
}

export function formatById(id: string | null | undefined): ScreenplayFormat {
  return FORMATS.find((f) => f.id === id) ?? FR_FORMAT;
}

/** Rows of the page each line of the element takes: 2 when double-spaced. */
export function spacingOf(s: ElementStyle): number {
  return s.spacing ?? 1;
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
        ` text-transform: ${s.uppercase ? "uppercase" : "none"}; font-style: ${s.italic ? "italic" : "normal"};` +
        ` text-decoration: ${s.underline ? "underline" : "none"}; line-height: ${lh * spacingOf(s)}in; }`,
      `.fmt .ProseMirror .el-${type} { --space-before: ${s.spaceBefore * lh}in; padding-top: var(--space-before); }`,
    );
  }
  rules.push(`.fmt .ProseMirror .el.page-top { padding-top: 0; }`);
  if (withPage) rules.push(`@page { size: ${f.page.width}in ${f.page.height}in; margin: 0; }`);
  return rules.join("\n");
}

export function displayText(f: ScreenplayFormat, type: ElementType, text: string): string {
  return f.elements[type].uppercase ? text.toLocaleUpperCase(f.language) : text;
}
