/** The shooting schedule: days and their dates, times, presence of the cast, conflicts and arranging [PDT-01 to PDT-05]. */

import type { DayKind } from "../../../core/db/schema";
import type { Moment, SceneFacts } from "./sceneFacts";

export interface ScheduleSettings {
  startDate: string | null;
  /** Week days worked, 1 for Monday to 7 for Sunday. */
  week: number[];
  dayMinutes: number;
  pageMinutes: number;
}

export interface DayRef {
  id: string;
  kind: DayKind;
  /** Set by hand. */
  date: string | null;
}

/** « 2026-03-12 » as a date at noon, so that no time zone moves it to another day. */
export const parseDay = (iso: string) => new Date(`${iso}T12:00:00`);

export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** 1 for Monday to 7 for Sunday. */
export const weekDay = (iso: string) => ((parseDay(iso).getDay() + 6) % 7) + 1;

function nextWorked(iso: string, week: number[]): string {
  const worked = week.length ? week : [1, 2, 3, 4, 5, 6, 7];
  let d = iso;
  for (let i = 0; i < 7 && !worked.includes(weekDay(d)); i++) d = addDays(d, 1);
  return d;
}

/**
 * The date of each day: the one set by hand, else the first day worked from the start, then the next day worked after
 * the day before; null as long as nothing gives a first date.
 */
export function dayDates(s: ScheduleSettings, days: DayRef[]): (string | null)[] {
  let last: string | null = null;
  return days.map((d, i) => {
    const date: string | null = d.date ?? (last ? nextWorked(addDays(last, 1), s.week) : i === 0 && s.startDate ? nextWorked(s.startDate, s.week) : null);
    last = date;
    return date;
  });
}

/** « J3 »: the shooting days counted alone, rest and travel days left out. */
export function shootNumbers(days: DayRef[]): (number | null)[] {
  let n = 0;
  return days.map((d) => (d.kind === "shoot" ? ++n : null));
}

/** The time a scene takes to shoot: what its shots say, else its length at the rate of the schedule. */
export function sceneMinutes(eighths: number, shotMinutes: number, s: Pick<ScheduleSettings, "pageMinutes">): number {
  return shotMinutes > 0 ? shotMinutes : Math.round((eighths / 8) * s.pageMinutes);
}

export interface Unavailable {
  contactId: string;
  start: string;
  end: string;
}

export interface Conflict {
  kind: "unavailable" | "overload";
  /** The character whose actor is away. */
  character?: string;
  minutes?: number;
}

/** What goes wrong on a day: an actor away that day, more work than the day holds [PDT-03]. */
export function dayConflicts(
  date: string | null,
  characters: string[],
  minutes: number,
  s: Pick<ScheduleSettings, "dayMinutes">,
  actorOf: (character: string) => string | null,
  away: Unavailable[],
): Conflict[] {
  const out: Conflict[] = [];
  if (date) {
    for (const c of characters) {
      const actor = actorOf(c);
      if (actor && away.some((u) => u.contactId === actor && u.start <= date && date <= u.end)) out.push({ kind: "unavailable", character: c });
    }
  }
  if (minutes > s.dayMinutes) out.push({ kind: "overload", minutes });
  return out;
}

/** Start work, work, work finish, start-work-finish, hold, travel; blank when the actor is not engaged [PDT-04]. */
export type Presence = "SW" | "W" | "WF" | "SWF" | "H" | "T" | "";

/** The presence of one actor over the days, from the days they work. */
export function presence(days: DayRef[], works: boolean[]): Presence[] {
  const first = works.indexOf(true);
  const last = works.lastIndexOf(true);
  return days.map((d, i) => {
    if (first < 0 || i < first || i > last) return "";
    if (works[i]) return first === last ? "SWF" : i === first ? "SW" : i === last ? "WF" : "W";
    if (d.kind === "travel") return "T";
    return d.kind === "shoot" ? "H" : "";
  });
}

export interface ArrangeScene {
  id: string;
  minutes: number;
  facts: SceneFacts;
  /** Numbers of the cast in the scene. */
  cast: number[];
}

export type ArrangeBy = "set" | "cast" | "moment";

const MOMENT_ORDER: Record<Moment, number> = { dawn: 0, day: 1, dusk: 2, night: 3 };
const momentRank = (m: Moment | null) => (m ? MOMENT_ORDER[m] : 1);

/**
 * Scenes put together the way asked [PDT-03]: by set (then moment), by actors (the scenes of the same people side by
 * side), or by moment of the day (all the nights together); then cut into days that hold no more than a day's work,
 * a set or a group not split across two days when the day before still has room for less than half of it.
 */
export function arrange(scenes: ArrangeScene[], by: ArrangeBy, dayMinutes: number): string[][] {
  const castKey = (s: ArrangeScene) => [...s.cast].sort((a, b) => a - b).join(",");
  const groupKey = (s: ArrangeScene) =>
    by === "set" ? s.facts.place : by === "cast" ? castKey(s) : `${momentRank(s.facts.moment)}`;
  const sorted = [...scenes].sort((a, b) => {
    const keys: [string | number, string | number][] =
      by === "set"
        ? [[a.facts.place, b.facts.place], [momentRank(a.facts.moment), momentRank(b.facts.moment)], [a.facts.side ?? "", b.facts.side ?? ""]]
        : by === "cast"
          ? [[Math.min(...a.cast, 999), Math.min(...b.cast, 999)], [castKey(a), castKey(b)], [a.facts.place, b.facts.place]]
          : [[momentRank(a.facts.moment), momentRank(b.facts.moment)], [a.facts.place, b.facts.place], [a.facts.side ?? "", b.facts.side ?? ""]];
    for (const [x, y] of keys) {
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
  const groups: ArrangeScene[][] = [];
  for (const s of sorted) {
    const g = groups[groups.length - 1];
    if (g && groupKey(g[0]) === groupKey(s)) g.push(s);
    else groups.push([s]);
  }
  const days: string[][] = [];
  let day: string[] = [];
  let used = 0;
  const close = () => {
    if (day.length) days.push(day);
    day = [];
    used = 0;
  };
  for (const g of groups) {
    const total = g.reduce((n, s) => n + s.minutes, 0);
    // A group that fits in a day but not in what is left starts a day of its own, unless most of it would fit.
    if (used > 0 && total <= dayMinutes && used + total > dayMinutes && dayMinutes - used < total / 2) close();
    for (const s of g) {
      if (used > 0 && used + s.minutes > dayMinutes) close();
      day.push(s.id);
      used += s.minutes;
    }
  }
  close();
  return days;
}
