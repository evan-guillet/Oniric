/** The permits of the shoot, when one is missing, and the letters they call for [AUT-01 to AUT-06]. */

import type { PermitStatus, ReleaseStatus } from "../../../core/db/schema";
import { fold } from "../../script/bible/domain/types";
import { zipStored } from "./files";

export const PERMIT_STATUSES: PermitStatus[] = ["todo", "sent", "review", "granted", "refused", "expired"];
export const PERMIT_KINDS = ["street", "parking", "closure", "drone", "weapons", "pyro", "private", "park", "other"];
export const AUTHORITIES = ["cityHall", "prefecture", "police", "publicSpace", "owner", "park", "aviation", "other"];
export const RELEASE_STATUSES: ReleaseStatus[] = ["todo", "sent", "signed"];
export const DOCUMENT_MODELS = ["request", "rental", "image", "rights", "owner"] as const;
export type DocumentModel = (typeof DOCUMENT_MODELS)[number];

export const permitTone: Record<PermitStatus, string> = { todo: "", sent: "warn", review: "warn", granted: "ok", refused: "bad", expired: "bad" };

export interface PermitData {
  hours: string;
  contact: string;
  documents: string[];
  notes: string;
}

export const permitData = (raw: Partial<PermitData> | null | undefined): PermitData => ({ hours: "", contact: "", documents: [], notes: "", ...raw });

export interface PermitRef {
  id: string;
  locationId: string | null;
  status: PermitStatus;
  start: string | null;
  end: string | null;
  deadline: string | null;
}

export interface DecorRef {
  id: string;
  name: string;
  noPermit: boolean;
  /** The bible's places it plays, as names written in headings. */
  plays: string[];
}

export interface ShootDayRef {
  id: string;
  number: number;
  date: string | null;
  /** The sets written in the headings of its scenes. */
  places: string[];
}

export interface PermitAlert {
  dayId: string;
  number: number;
  date: string | null;
  locationId: string;
  name: string;
  /** The nearest permit for this set, when there is one not yet granted. */
  waiting: PermitStatus | null;
}

/** The set a heading's place is played by. */
export function decorsOfPlace(place: string, decors: DecorRef[]): DecorRef[] {
  const key = fold(place);
  if (!key) return [];
  return decors.filter((d) => d.plays.some((n) => fold(n) === key) || fold(d.name) === key);
}

const covers = (p: PermitRef, date: string | null) => !date || ((!p.start || p.start <= date) && (!p.end || date <= p.end));

/** Every shooting day in a set with no permit granted for that day [AUT-04]; a set that needs none is left out. */
export function permitAlerts(days: ShootDayRef[], decors: DecorRef[], permits: PermitRef[]): PermitAlert[] {
  const out: PermitAlert[] = [];
  for (const day of days) {
    const seen = new Set<string>();
    for (const place of day.places) {
      for (const d of decorsOfPlace(place, decors)) {
        if (d.noPermit || seen.has(d.id)) continue;
        seen.add(d.id);
        const own = permits.filter((p) => p.locationId === d.id);
        if (own.some((p) => p.status === "granted" && covers(p, day.date))) continue;
        const open = own.find((p) => p.status === "todo" || p.status === "sent" || p.status === "review");
        out.push({ dayId: day.id, number: day.number, date: day.date, locationId: d.id, name: d.name, waiting: open?.status ?? null });
      }
    }
  }
  return out;
}

/** The requests whose deadline is past or within the days given, still to send [AUT-02]. */
export function dueSoon<T extends PermitRef>(permits: T[], today: string, within = 14): T[] {
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + within);
  const until = limit.toISOString().slice(0, 10);
  return permits.filter((p) => p.status === "todo" && !!p.deadline && p.deadline <= until).sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));
}

/** Replaces each « {name} » of a model by what the project knows; what it does not know stays dotted, to be filled in. */
export function fillModel(model: string, values: Record<string, string>): string {
  return model.replace(/\{(\w+)\}/g, (_all, key: string) => values[key] || "……………");
}

const xml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** A Word file with the title and the paragraphs of a letter: stored as is, as an XLSX is here [AUT-03]. */
export function toDocx(title: string, body: string): Uint8Array {
  const enc = new TextEncoder();
  const para = (text: string, bold = false, size = 22) =>
    `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:rPr>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${para(title, true, 28)}${body
    .split("\n")
    .map((l) => para(l))
    .join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr></w:body></w:document>`;
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": doc,
  };
  return zipStored(Object.entries(files).map(([name, text]) => ({ name, data: enc.encode(text) })));
}
