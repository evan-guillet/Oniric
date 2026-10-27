import type { FormatLanguage } from "./formats";

/** The title page of the screenplay [EDT-06]. */
export interface TitlePage {
  title: string;
  /** A line under the title, in lower case: a genre, a tagline, an episode. */
  subtitle: string;
  /** « Écrit par », one author per line. */
  authors: string;
  basedOn: string;
  /** Filled in when the page prints: the version in progress, the one the next freeze will be named. */
  version: string;
  /** Filled in when the page prints: the day it prints. */
  date: string;
  contact: string;
  /** The mention as typed, used when `mention` is « custom ». */
  notes: string;
  /** Kept for older projects: a title page with content always prints at the start of the PDF. */
  include: boolean;
  /** A preset mention (see MENTIONS), or « custom » for `notes`. */
  mention: MentionId;
}

export const TITLE_PAGE_SETTING = "title_page";

/** What the project says about the automatic fields. */
export interface TitleAuto {
  version: string;
  date: string;
}

export type MentionId = "none" | "sacd" | "sacd-copyright" | "sgdl" | "wga" | "copyright" | "confidential" | "draft" | "custom";

interface MentionContext {
  year: number;
  authors: string;
}

const copyright = ({ year, authors }: MentionContext) => {
  const names = authors.split("\n").map((a) => a.trim()).filter(Boolean);
  return `© ${year}${names.length ? ` ${names.join(", ")}` : ""}. Tous droits réservés.`;
};

/** Mentions written in advance: deposit, rights, confidentiality. */
export const MENTIONS: { id: MentionId; label: string; text: (c: MentionContext) => string }[] = [
  { id: "none", label: "Aucune mention", text: () => "" },
  { id: "sacd", label: "Œuvre déposée à la SACD", text: () => "Œuvre déposée à la SACD" },
  { id: "sacd-copyright", label: "Déposée à la SACD, © et droits réservés", text: (c) => `Œuvre déposée à la SACD\n${copyright(c)}` },
  { id: "sgdl", label: "Œuvre déposée à la SGDL", text: () => "Œuvre déposée à la SGDL" },
  { id: "wga", label: "Registered WGA (Writers Guild of America)", text: () => "Registered WGA" },
  { id: "copyright", label: "© année, auteurs. Tous droits réservés.", text: copyright },
  { id: "confidential", label: "Document confidentiel, ne pas diffuser", text: () => "Document confidentiel – ne pas diffuser" },
  { id: "draft", label: "Version de travail, ne pas diffuser", text: () => "Version de travail – ne pas diffuser" },
  { id: "custom", label: "Autre mention…", text: () => "" },
];

export function emptyTitlePage(title: string, profile?: { name?: string; email?: string; phone?: string; address?: string; agent?: string }): TitlePage {
  return {
    title,
    subtitle: "",
    authors: profile?.name ?? "",
    basedOn: "",
    version: "",
    date: "",
    contact: [profile?.name, profile?.address, profile?.phone, profile?.email, profile?.agent].filter(Boolean).join("\n"),
    notes: "",
    include: false,
    mention: "none",
  };
}

/** A title page saved before the subtitle and the mentions: a mention typed then stays as typed. */
export function normalizeTitlePage(raw: Partial<TitlePage> & { title?: string }): TitlePage {
  const p = { ...emptyTitlePage(raw.title ?? ""), ...raw };
  return { ...p, mention: raw.mention ?? (raw.notes?.trim() ? "custom" : "none") };
}

/** The page as it prints: the version and date from the project, the authors without empty lines, the mention written out. */
export function resolveTitlePage(p: TitlePage, auto: TitleAuto | null, year = new Date().getFullYear()): TitlePage {
  const mention = MENTIONS.find((m) => m.id === p.mention);
  const authors = p.authors.split("\n").map((a) => a.trim()).filter(Boolean).join("\n");
  return {
    ...p,
    authors,
    version: auto?.version ?? p.version,
    date: auto?.date ?? p.date,
    notes: p.mention === "custom" || !mention ? p.notes : mention.text({ year, authors }),
  };
}

const LOCALES: Record<FormatLanguage, string> = { fr: "fr-FR", en: "en-US", de: "de-DE", es: "es-ES" };

export function formatTitleDate(d: Date, language: FormatLanguage): string {
  return new Intl.DateTimeFormat(LOCALES[language], { day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function hasContent(p: TitlePage | null): p is TitlePage {
  return !!p && [p.title, p.subtitle, p.authors, p.basedOn, p.version, p.date, p.contact, p.notes].some((s) => s.trim());
}
