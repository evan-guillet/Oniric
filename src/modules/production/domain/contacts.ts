/** A person's card [EQU-01], and its exchange as CSV and vCard [EQU-08]. */

import type { Regime } from "./catalog";

export interface ContactData {
  phone: string;
  email: string;
  address: string;
  language: string;
  /** What the person does, whatever the project. */
  trades: string[];
  agent: string;
  regime: Regime;
  diet: string;
  allergies: string;
  /** Who to call if something happens: a name and a number. */
  emergency: string;
  notes: string;
  /** The photo, in medias/. */
  photo: string | null;
  /** CV, demo reel…, in medias/. */
  documents: { name: string; path: string }[];
  /** Sensitive: shown on demand only. */
  ssn: string;
  iban: string;
}

export const EMPTY_CONTACT: ContactData = {
  phone: "",
  email: "",
  address: "",
  language: "",
  trades: [],
  agent: "",
  regime: "",
  diet: "",
  allergies: "",
  emergency: "",
  notes: "",
  photo: null,
  documents: [],
  ssn: "",
  iban: "",
};

/** A card as kept, whatever it lacks. */
export function contactData(raw: unknown): ContactData {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<ContactData>) : {};
  return {
    ...EMPTY_CONTACT,
    ...o,
    trades: Array.isArray(o.trades) ? o.trades.filter((x) => typeof x === "string") : [],
    documents: Array.isArray(o.documents) ? o.documents.filter((x) => x && typeof x.path === "string") : [],
  };
}

export interface Card {
  name: string;
  data: ContactData;
}

/** The two letters of a name shown in place of a photo. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : (words[0][1] ?? "");
  return (first + last).toLocaleUpperCase();
}

/** The columns of a CSV of contacts, in the order they are written; read back by their names. */
export const CSV_FIELDS = ["name", "phone", "email", "address", "language", "trades", "agent", "regime", "diet", "allergies", "emergency", "notes"] as const;
type CsvField = (typeof CSV_FIELDS)[number];

const regimes = new Set<string>(["intermittent", "employee", "contractor", "volunteer"]);

export function cardRow(c: Card): string[] {
  return CSV_FIELDS.map((f) => (f === "name" ? c.name : f === "trades" ? c.data.trades.join(", ") : String(c.data[f] ?? "")));
}

/** The rows of a CSV file, separated by semicolons or commas, quotes and line breaks in quoted cells understood. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\ufeff/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** The head of a column, in any of the languages of the interface or as Oniric writes it, to the field it holds. */
const HEADS: Record<string, CsvField> = {
  name: "name",
  nom: "name",
  "nom complet": "name",
  nombre: "name",
  "full name": "name",
  phone: "phone",
  téléphone: "phone",
  telephone: "phone",
  tel: "phone",
  teléfono: "phone",
  mobile: "phone",
  portable: "phone",
  email: "email",
  "e-mail": "email",
  mail: "email",
  courriel: "email",
  "correo electrónico": "email",
  address: "address",
  adresse: "address",
  dirección: "address",
  language: "language",
  langue: "language",
  idioma: "language",
  trades: "trades",
  métiers: "trades",
  metiers: "trades",
  oficios: "trades",
  agent: "agent",
  agente: "agent",
  regime: "regime",
  régime: "regime",
  diet: "diet",
  "régime alimentaire": "diet",
  dieta: "diet",
  allergies: "allergies",
  alergias: "allergies",
  emergency: "emergency",
  "contact d'urgence": "emergency",
  urgence: "emergency",
  "contacto de emergencia": "emergency",
  notes: "notes",
  notas: "notes",
};

/** The contacts of a CSV file whose first row names the columns; `labels` are the heads Oniric writes in this language. */
export function cardsFromCsv(text: string, labels: Partial<Record<CsvField, string>> = {}): Card[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const known = { ...HEADS, ...Object.fromEntries(Object.entries(labels).map(([f, l]) => [l.toLocaleLowerCase(), f as CsvField])) };
  const fields = head.map((h) => known[h.trim().toLocaleLowerCase()] ?? null);
  const firstName = head.findIndex((h) => /^(prénom|prenom|first name|nombre de pila)$/i.test(h.trim()));
  const lastName = head.findIndex((h) => /^(nom de famille|last name|apellido|apellidos)$/i.test(h.trim()));
  const out: Card[] = [];
  for (const r of rows) {
    const data: ContactData = { ...EMPTY_CONTACT, trades: [], documents: [] };
    let name = "";
    fields.forEach((f, i) => {
      const v = (r[i] ?? "").trim();
      if (!f || !v) return;
      if (f === "name") name = v;
      else if (f === "trades") data.trades = v.split(/\s*[,/]\s*/).filter(Boolean);
      else if (f === "regime") data.regime = (regimes.has(v) ? v : "") as Regime;
      else data[f] = v;
    });
    if (!name && (firstName >= 0 || lastName >= 0)) name = [r[firstName] ?? "", r[lastName] ?? ""].map((s) => s.trim()).filter(Boolean).join(" ");
    if (name) out.push({ name, data });
  }
  return out;
}

const vEscape = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const vUnescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/** A line of a vCard folded at 75 octets, as the format asks. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let n = 75;
    while (new TextEncoder().encode(rest.slice(0, n)).length > 75) n--;
    out.push(rest.slice(0, n));
    rest = " " + rest.slice(n);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** The contacts as vCard 3.0, which any address book reads [EQU-08]. */
export function toVCard(cards: Card[]): string {
  return cards
    .map((c) => {
      const parts = c.name.trim().split(/\s+/);
      const family = parts.length > 1 ? parts[parts.length - 1] : "";
      const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
      const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vEscape(c.name)}`, `N:${vEscape(family)};${vEscape(given)};;;`];
      if (c.data.phone) lines.push(`TEL;TYPE=CELL:${vEscape(c.data.phone)}`);
      if (c.data.email) lines.push(`EMAIL;TYPE=INTERNET:${vEscape(c.data.email)}`);
      if (c.data.address) lines.push(`ADR:;;${vEscape(c.data.address)};;;;`);
      if (c.data.trades.length) lines.push(`TITLE:${vEscape(c.data.trades.join(", "))}`);
      if (c.data.language) lines.push(`LANG:${vEscape(c.data.language)}`);
      const note = [c.data.notes, c.data.agent && `Agent : ${c.data.agent}`, c.data.emergency && `Urgence : ${c.data.emergency}`].filter(Boolean).join("\n");
      if (note) lines.push(`NOTE:${vEscape(note)}`);
      lines.push("END:VCARD");
      return lines.map(fold).join("\r\n");
    })
    .join("\r\n")
    .concat("\r\n");
}

/** The contacts of a vCard file, of any version: names, numbers, e-mails, addresses, titles and notes. */
export function cardsFromVCard(text: string): Card[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const out: Card[] = [];
  let card: Card | null = null;
  let n = "";
  for (const raw of unfolded.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^BEGIN:VCARD$/i.test(line)) {
      card = { name: "", data: { ...EMPTY_CONTACT, trades: [], documents: [] } };
      n = "";
      continue;
    }
    if (!card) continue;
    if (/^END:VCARD$/i.test(line)) {
      if (!card.name && n) card.name = n;
      if (card.name) out.push(card);
      card = null;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).split(";")[0].replace(/^item\d+\./i, "").toUpperCase();
    const value = line.slice(colon + 1);
    const d = card.data;
    switch (key) {
      case "FN":
        card.name = vUnescape(value).trim();
        break;
      case "N": {
        const [family = "", given = ""] = value.split(/(?<!\\);/).map(vUnescape);
        n = [given, family].map((s) => s.trim()).filter(Boolean).join(" ");
        break;
      }
      case "TEL":
        d.phone ||= vUnescape(value).trim();
        break;
      case "EMAIL":
        d.email ||= vUnescape(value).trim();
        break;
      case "ADR":
        d.address ||= value.split(/(?<!\\);/).map(vUnescape).map((s) => s.trim()).filter(Boolean).join(", ");
        break;
      case "TITLE":
      case "ROLE":
        d.trades = [...new Set([...d.trades, ...vUnescape(value).split(/\s*,\s*/).filter(Boolean)])];
        break;
      case "LANG":
        d.language ||= vUnescape(value).trim();
        break;
      case "NOTE":
        d.notes = [d.notes, vUnescape(value).trim()].filter(Boolean).join("\n");
        break;
    }
  }
  return out;
}

/** Whether two cards are the same person: same e-mail, or same name and no e-mail to tell them apart. */
export function samePerson(a: Card, b: Card): boolean {
  const ea = a.data.email.trim().toLowerCase();
  const eb = b.data.email.trim().toLowerCase();
  if (ea && eb) return ea === eb;
  return a.name.trim().toLocaleLowerCase() === b.name.trim().toLocaleLowerCase();
}
