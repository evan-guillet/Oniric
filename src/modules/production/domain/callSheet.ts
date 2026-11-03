/** The call sheet of a day [FDS-01 to FDS-08]: what it holds, its sections, what changed since it was sent. */

export interface CallLocation {
  name: string;
  address: string;
  /** « 48.85, 2.35 »: gives the sun times. */
  coordinates: string;
  parking: string;
  notes: string;
}

export interface CastCall {
  pickup: string;
  /** Habillage, maquillage, coiffure. */
  hmc: string;
  onSet: string;
  notes: string;
}

export interface CallSheetData {
  generalCall: string;
  /** Prêt à tourner. */
  readyToShoot: string;
  lunch: string;
  wrap: string;
  weather: string;
  /** Typed by hand; empty, computed from the first set's coordinates. */
  sunrise: string;
  sunset: string;
  locations: CallLocation[];
  base: string;
  hospital: string;
  pharmacy: string;
  emergency: string;
  cast: Record<string, CastCall>;
  extras: string;
  /** Call time of each department, by its id. */
  departments: Record<string, string>;
  needs: string;
  safety: string;
  nextDay: string;
  contacts: string;
  notes: string;
}

export const EMPTY_CALL: CastCall = { pickup: "", hmc: "", onSet: "", notes: "" };

export function emptySheet(): CallSheetData {
  return {
    generalCall: "",
    readyToShoot: "",
    lunch: "",
    wrap: "",
    weather: "",
    sunrise: "",
    sunset: "",
    locations: [],
    base: "",
    hospital: "",
    pharmacy: "",
    emergency: "",
    cast: {},
    extras: "",
    departments: {},
    needs: "",
    safety: "",
    nextDay: "",
    contacts: "",
    notes: "",
  };
}

/** A sheet as kept, whatever it lacks. */
export function sheetData(raw: unknown): CallSheetData {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<CallSheetData>) : {};
  const base = emptySheet();
  return {
    ...base,
    ...o,
    locations: Array.isArray(o.locations) ? o.locations.map((l: Partial<CallLocation>) => ({ name: "", address: "", coordinates: "", parking: "", notes: "", ...l })) : [],
    cast: o.cast && typeof o.cast === "object" ? o.cast : {},
    departments: o.departments && typeof o.departments === "object" ? o.departments : {},
  };
}

/** The sections of a sheet, in the order the template sets [FDS-04]. */
export const SECTIONS = ["times", "locations", "safety", "scenes", "cast", "extras", "departments", "needs", "notes", "nextDay", "contacts"] as const;
export type SectionId = (typeof SECTIONS)[number];

export interface Template {
  sections: { id: SectionId; shown: boolean }[];
  /** The logo at the top of the sheet, in medias/. */
  logo: string | null;
}

export function template(raw: unknown): Template {
  const o = raw && typeof raw === "object" ? (raw as Partial<Template>) : {};
  const saved = Array.isArray(o.sections) ? o.sections.filter((s) => (SECTIONS as readonly string[]).includes(s.id)) : [];
  // A section the template does not know yet comes at the end, shown.
  const missing = SECTIONS.filter((id) => !saved.some((s) => s.id === id)).map((id) => ({ id, shown: true }));
  return { sections: [...saved, ...missing], logo: typeof o.logo === "string" ? o.logo : null };
}

/** A version sent: its number, when, and the sheet as it went [FDS-07]. */
export interface SentVersion {
  n: number;
  at: string;
  data: CallSheetData;
}

/** The paths of what differs between two sheets: « generalCall », « cast.MARIE.pickup », « locations.0.address ». */
export function changes(before: unknown, after: unknown, path = ""): Set<string> {
  const out = new Set<string>();
  const walk = (a: unknown, b: unknown, p: string) => {
    if (a && b && typeof a === "object" && typeof b === "object") {
      const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
      for (const k of keys) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], p ? `${p}.${k}` : k);
      return;
    }
    const empty = (v: unknown) => v === undefined || v === null || v === "";
    if (empty(a) && empty(b)) return;
    if (a !== b) {
      // A change deep down marks every level above it, so a section knows it changed.
      const parts = p.split(".");
      for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join("."));
    }
  };
  walk(before, after, path);
  return out;
}

/** The report of the day [FDS-08]. */
export interface DayReport {
  /** The scenes shot: all of it, part of it. */
  scenes: Record<string, "done" | "part">;
  shots: string;
  /** Minutes of film shot. */
  screenTime: string;
  call: string;
  firstShot: string;
  lunch: string;
  wrap: string;
  incidents: string;
  continuity: string;
  notes: string;
}

export function dayReport(raw: unknown): DayReport {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<DayReport>) : {};
  return {
    shots: "",
    screenTime: "",
    call: "",
    firstShot: "",
    lunch: "",
    wrap: "",
    incidents: "",
    continuity: "",
    notes: "",
    ...o,
    scenes: o.scenes && typeof o.scenes === "object" ? o.scenes : {},
  };
}

/** « 07:30 » for « 7h30 », « 7:30 », « 730 » or « 7 »; what it can't read stays as typed. */
export function normalizeTime(v: string): string {
  const s = v.trim();
  const m = /^(\d{1,2})(?:\s*[h:.]\s*(\d{2})?|(\d{2}))?$/i.exec(s);
  if (!m) return s;
  const h = Number(m[1]);
  const min = Number(m[2] ?? m[3] ?? 0);
  if (h > 23 || min > 59) return s;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** The earlier of two times « hh:mm », the empty one left aside. */
export function earliest(times: string[]): string {
  return times.filter((x) => /^\d{2}:\d{2}$/.test(x)).sort()[0] ?? "";
}
