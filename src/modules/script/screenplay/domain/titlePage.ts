/** The title page of the screenplay [EDT-06]. */
export interface TitlePage {
  title: string;
  /** « Écrit par », one author per line. */
  authors: string;
  basedOn: string;
  version: string;
  date: string;
  contact: string;
  /** Deposit mentions (SACD, WGA…), copyright. */
  notes: string;
  /** Printed at the start of the PDF. */
  include: boolean;
}

export const TITLE_PAGE_SETTING = "title_page";

export function emptyTitlePage(title: string, profile?: { name?: string; email?: string; phone?: string; address?: string }): TitlePage {
  return {
    title,
    authors: profile?.name ?? "",
    basedOn: "",
    version: "",
    date: "",
    contact: [profile?.name, profile?.address, profile?.phone, profile?.email].filter(Boolean).join("\n"),
    notes: "",
    include: false,
  };
}

export function hasContent(p: TitlePage | null): p is TitlePage {
  return !!p && p.include && [p.title, p.authors, p.basedOn, p.version, p.date, p.contact, p.notes].some((s) => s.trim());
}
