/** The vocabularies of a shot [DEC-02], kept by id in the project; their names are in the catalog (shot.<field>.<id>). */
export const SHOT_SIZES = ["xcu", "cu", "mcu", "cowboy", "medium", "wide", "extreme"] as const;
export const SHOT_ANGLES = ["eye", "high", "low", "dutch"] as const;
export const SHOT_MOVEMENTS = ["static", "pan", "tracking", "steadicam", "handheld", "crane", "drone", "zoom"] as const;
export const SHOT_SUPPORTS = ["tripod", "dolly", "slider", "gimbal", "shoulder", "crane", "vehicle"] as const;
export const SHOT_SOUNDS = ["sync", "mos", "playback"] as const;

export const SHOT_CHOICES = {
  size: SHOT_SIZES,
  angle: SHOT_ANGLES,
  movement: SHOT_MOVEMENTS,
  support: SHOT_SUPPORTS,
  sound: SHOT_SOUNDS,
} as const;

export type ChoiceField = keyof typeof SHOT_CHOICES;

/** How shots are numbered after their scene: 12-1, 12-2… or 12A, 12B… [DEC-01]. */
export type ShotNumbering = "dash" | "letter";

/** A, B… Z, then AA, AB…, as letters follow on a clapperboard. */
export function letters(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** The number of the `i`-th shot (from 0) of scene `scene`. */
export function shotNumber(scene: number | string, i: number, style: ShotNumbering): string {
  return style === "letter" ? `${scene}${letters(i)}` : `${scene}-${i + 1}`;
}

/** An element of the scene's text, as the coverage reads it. */
export interface SceneElement {
  type: string;
  text: string;
}

/** What a shot covers can be set on these elements: everything but the scene heading. */
export function coverable(elements: SceneElement[]): SceneElement[] {
  return elements.filter((e) => e.type !== "scene_heading" && e.text.trim() !== "");
}

const key = (text: string) => text.trim().replace(/\s+/g, " ");

/**
 * For each coverable element of the scene, the indexes of the shots that cover it [DEC-03]. Elements are matched by
 * their text, so that writing above or below a covered passage does not move the coverage.
 */
export function coverage(elements: SceneElement[], shots: { covers: string[] }[]): number[][] {
  const by = new Map<string, number[]>();
  shots.forEach((s, i) => {
    for (const c of new Set(s.covers.map(key))) by.set(c, [...(by.get(c) ?? []), i]);
  });
  return coverable(elements).map((e) => by.get(key(e.text)) ?? []);
}

/** The passages of the scene no shot covers, once at least one shot covers something. */
export function uncovered(elements: SceneElement[], shots: { covers: string[] }[]): number {
  if (!shots.some((s) => s.covers.length > 0)) return 0;
  return coverage(elements, shots).filter((c) => c.length === 0).length;
}

/** Seconds as the shot list writes them: 45 s, 1 min 30. */
export function formatSeconds(s: number | null | undefined): string {
  if (!s) return "";
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${String(r).padStart(2, "0")}` : `${m} min`;
}

/** Minutes as hours and minutes: 45 min, 2 h 15. */
export function formatMinutes(m: number | null | undefined): string {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}

/** Reads « 1:30 », « 90 », « 1 min 30 » or « 45 s » as seconds; null when it cannot. */
export function parseSeconds(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const colon = /^(\d+):(\d{1,2})$/.exec(t);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const parts = /^(?:(\d+)\s*(?:min|mn|m)\s*)?(?:(\d+)\s*(?:s|sec)?)?$/.exec(t);
  if (parts && (parts[1] || parts[2])) {
    const m = Number(parts[1] ?? 0);
    const s = Number(parts[2] ?? 0);
    return parts[1] ? m * 60 + s : s;
  }
  return null;
}

/** Reads « 2 h 15 », « 2:15 », « 135 » or « 45 min » as minutes; null when it cannot. */
export function parseMinutes(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const colon = /^(\d+):(\d{1,2})$/.exec(t);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const parts = /^(?:(\d+)\s*h\s*)?(?:(\d+)\s*(?:min|mn|m)?)?$/.exec(t);
  if (parts && (parts[1] || parts[2])) return Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0);
  return null;
}

/** One cell of a CSV file: quoted when it holds a separator, a quote or a line break. */
function cell(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A CSV table separated by semicolons, as a French spreadsheet opens it, with a BOM for the accents [DEC-08]. */
export function toCsv(head: string[], rows: string[][]): string {
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
