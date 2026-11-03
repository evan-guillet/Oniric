import type { Compilable } from "kysely";
import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson, useLive } from "../../../core/db/live";
import type { DayKind, EventPhase, TableName } from "../../../core/db/schema";
import { uuidv7 } from "../../../core/ids";
import { rankBetween, ranksBetween } from "../../../core/ordering";
import { readSetting, writeSetting } from "../../script/screenplay/application/settings";
import type { ScheduleSettings } from "../domain/schedule";

export const SCHEDULE_TABLES: TableName[] = ["schedule", "shoot_day", "strip", "production_event"];

export interface Schedule extends ScheduleSettings {
  id: string;
  name: string;
  rank: string;
}

export interface Day {
  id: string;
  scheduleId: string;
  rank: string;
  kind: DayKind;
  date: string | null;
  notes: string;
}

export interface Strip {
  id: string;
  dayId: string;
  rank: string;
  sceneId: string | null;
  banner: string | null;
}

export interface ProductionEvent {
  id: string;
  phase: EventPhase;
  title: string;
  start: string;
  end: string;
  notes: string;
}

export interface Plans {
  schedules: Schedule[];
  days: Day[];
  strips: Strip[];
  events: ProductionEvent[];
  /** The schedule shown, and the one the call sheets follow. */
  currentId: string | null;
}

const CURRENT = "schedule_current";

export async function loadPlans(): Promise<Plans> {
  const [schedules, days, strips, events, current] = await Promise.all([
    query(db.selectFrom("schedule").selectAll().orderBy("rank")),
    query(db.selectFrom("shoot_day").selectAll().orderBy("rank")),
    query(db.selectFrom("strip").selectAll().orderBy("rank")),
    query(db.selectFrom("production_event").selectAll().orderBy("start_date")),
    readSetting(CURRENT),
  ]);
  return {
    schedules: schedules.map((r) => ({
      id: r.id,
      name: r.name,
      rank: r.rank,
      startDate: r.start_date,
      week: parseJson<number[]>(r.week, [1, 2, 3, 4, 5]),
      dayMinutes: r.day_minutes,
      pageMinutes: r.page_minutes,
    })),
    days: days.map((r) => ({ id: r.id, scheduleId: r.schedule_id, rank: r.rank, kind: r.kind, date: r.date, notes: r.notes })),
    strips: strips.map((r) => ({ id: r.id, dayId: r.day_id, rank: r.rank, sceneId: r.scene_id, banner: r.banner })),
    events: events.map((r) => ({ id: r.id, phase: r.phase, title: r.title, start: r.start_date, end: r.end_date, notes: r.notes })),
    currentId: schedules.some((s) => s.id === current) ? current : (schedules[0]?.id ?? null),
  };
}

export function usePlans(): Plans | undefined {
  return useLive(loadPlans, [...SCHEDULE_TABLES, "project_setting"]);
}

export function chooseSchedule(id: string): Promise<number> {
  return writeSetting(CURRENT, id);
}

/** The days of a schedule in order, and their strips. */
export function scheduleOf(p: Plans, id: string | null): { days: Day[]; strips: Map<string, Strip[]> } {
  const days = p.days.filter((d) => d.scheduleId === id);
  const ids = new Set(days.map((d) => d.id));
  const strips = new Map<string, Strip[]>(days.map((d) => [d.id, []]));
  for (const s of p.strips) if (ids.has(s.dayId)) strips.get(s.dayId)!.push(s);
  return { days, strips };
}

/** A new schedule, empty or a copy of another one with its days and strips [PDT-05]. */
export async function createSchedule(p: Plans, name: string, from: Schedule | null): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  const last = p.schedules[p.schedules.length - 1]?.rank ?? null;
  const queries: Compilable[] = [
    db.insertInto("schedule").values({
      id,
      name,
      rank: rankBetween(last, null),
      start_date: from?.startDate ?? null,
      week: JSON.stringify(from?.week ?? [1, 2, 3, 4, 5]),
      day_minutes: from?.dayMinutes ?? 600,
      page_minutes: from?.pageMinutes ?? 90,
      created_at: now,
      updated_at: now,
    }),
  ];
  if (from) {
    const { days, strips } = scheduleOf(p, from.id);
    for (const d of days) {
      const dayId = uuidv7();
      queries.push(db.insertInto("shoot_day").values({ id: dayId, schedule_id: id, rank: d.rank, kind: d.kind, date: d.date, notes: d.notes, created_at: now, updated_at: now }));
      for (const s of strips.get(d.id) ?? [])
        queries.push(db.insertInto("strip").values({ id: uuidv7(), day_id: dayId, rank: s.rank, scene_id: s.sceneId, banner: s.banner, created_at: now, updated_at: now }));
    }
  }
  queries.push(db.insertInto("project_setting").values({ key: CURRENT, value: id, updated_at: now }).onConflict((oc) => oc.column("key").doUpdateSet({ value: id, updated_at: now })));
  await write(from ? "Plan de travail dupliqué" : "Nouveau plan de travail", [...SCHEDULE_TABLES, "project_setting"], queries);
  return id;
}

export async function updateSchedule(id: string, patch: Partial<Omit<Schedule, "id" | "rank">>): Promise<void> {
  await write("Plan de travail", ["schedule"], [
    db
      .updateTable("schedule")
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.startDate !== undefined && { start_date: patch.startDate }),
        ...(patch.week !== undefined && { week: JSON.stringify([...patch.week].sort()) }),
        ...(patch.dayMinutes !== undefined && { day_minutes: patch.dayMinutes }),
        ...(patch.pageMinutes !== undefined && { page_minutes: patch.pageMinutes }),
        updated_at: nowIso(),
      })
      .where("id", "=", id),
  ]);
}

export async function deleteSchedule(id: string): Promise<void> {
  await write("Plan de travail supprimé", [...SCHEDULE_TABLES, "call_sheet", "call_recipient"], [db.deleteFrom("schedule").where("id", "=", id)]);
}

/** A day added after `after`, or at the end. */
export async function addDay(scheduleId: string, days: Day[], kind: DayKind, after: Day | null = null): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  const at = after ? days.findIndex((d) => d.id === after.id) : days.length - 1;
  const rank = rankBetween(days[at]?.rank ?? null, after ? (days[at + 1]?.rank ?? null) : null);
  await write(kind === "shoot" ? "Journée ajoutée" : kind === "off" ? "Jour de repos" : "Jour de déplacement", ["shoot_day"], [
    db.insertInto("shoot_day").values({ id, schedule_id: scheduleId, rank, kind, created_at: now, updated_at: now }),
  ]);
  return id;
}

export async function updateDay(id: string, patch: Partial<Pick<Day, "kind" | "date" | "notes" | "rank">>): Promise<void> {
  await write("Journée", ["shoot_day"], [
    db
      .updateTable("shoot_day")
      .set({
        ...(patch.kind !== undefined && { kind: patch.kind }),
        ...(patch.date !== undefined && { date: patch.date }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        ...(patch.rank !== undefined && { rank: patch.rank }),
        updated_at: nowIso(),
      })
      .where("id", "=", id),
  ]);
}

/** A day goes, its scenes back with the scenes to schedule. */
export async function deleteDay(id: string): Promise<void> {
  await write("Journée supprimée", ["shoot_day", "strip", "call_sheet", "call_recipient"], [db.deleteFrom("shoot_day").where("id", "=", id)]);
}

/** What is dropped on a day: a strip already on the board, or a scene still to schedule. */
export type Moving = { stripId: string } | { sceneId: string };

/** Puts strips or scenes into a day, between two strips (or at an end); the scene rows must exist. */
export async function placeStrips(moving: Moving[], dayId: string, before: Strip | null, after: Strip | null): Promise<void> {
  const ranks = ranksBetween(before?.rank ?? null, after?.rank ?? null, moving.length);
  const now = nowIso();
  await write(
    "Bandes déplacées",
    ["strip"],
    moving.map((m, i) =>
      "stripId" in m
        ? db.updateTable("strip").set({ day_id: dayId, rank: ranks[i], updated_at: now }).where("id", "=", m.stripId)
        : db.insertInto("strip").values({ id: uuidv7(), day_id: dayId, rank: ranks[i], scene_id: m.sceneId, created_at: now, updated_at: now }),
    ),
  );
}

export async function unschedule(stripIds: string[]): Promise<void> {
  await write("Bande retirée du plan", ["strip"], [db.deleteFrom("strip").where("id", "in", stripIds)]);
}

export async function addBanner(dayId: string, text: string, after: Strip | null, next: Strip | null): Promise<void> {
  const now = nowIso();
  await write("Bannière", ["strip"], [
    db.insertInto("strip").values({ id: uuidv7(), day_id: dayId, rank: rankBetween(after?.rank ?? null, next?.rank ?? null), banner: text, created_at: now, updated_at: now }),
  ]);
}

export async function updateBanner(id: string, text: string): Promise<void> {
  await write("Bannière", ["strip"], [db.updateTable("strip").set({ banner: text, updated_at: nowIso() }).where("id", "=", id)]);
}

/**
 * The scenes arranged into new days at the end of the schedule [PDT-03]; with `replace`, every shooting day goes first
 * and the whole film is arranged again (rest and travel days stay, at the end).
 */
export async function applyArrangement(scheduleId: string, days: Day[], groups: string[][], replace: boolean): Promise<void> {
  const now = nowIso();
  const queries: Compilable[] = [];
  const kept = replace ? days.filter((d) => d.kind !== "shoot") : days;
  if (replace) for (const d of days) if (d.kind === "shoot") queries.push(db.deleteFrom("shoot_day").where("id", "=", d.id));
  const last = replace ? null : (kept[kept.length - 1]?.rank ?? null);
  const dayRanks = ranksBetween(last, replace ? (kept[0]?.rank ?? null) : null, groups.length);
  groups.forEach((g, i) => {
    const dayId = uuidv7();
    queries.push(db.insertInto("shoot_day").values({ id: dayId, schedule_id: scheduleId, rank: dayRanks[i], kind: "shoot", created_at: now, updated_at: now }));
    const ranks = ranksBetween(null, null, g.length);
    g.forEach((sceneId, j) => queries.push(db.insertInto("strip").values({ id: uuidv7(), day_id: dayId, rank: ranks[j], scene_id: sceneId, created_at: now, updated_at: now })));
  });
  await write("Plan de travail réparti", ["shoot_day", "strip", "call_sheet", "call_recipient"], queries);
}

export async function addEvent(e: Omit<ProductionEvent, "id">): Promise<void> {
  const now = nowIso();
  await write("Étape de production", ["production_event"], [
    db.insertInto("production_event").values({ id: uuidv7(), phase: e.phase, title: e.title, start_date: e.start, end_date: e.end, notes: e.notes, created_at: now, updated_at: now }),
  ]);
}

export async function updateEvent(id: string, patch: Partial<Omit<ProductionEvent, "id">>): Promise<void> {
  await write("Étape de production", ["production_event"], [
    db
      .updateTable("production_event")
      .set({
        ...(patch.phase !== undefined && { phase: patch.phase }),
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.start !== undefined && { start_date: patch.start }),
        ...(patch.end !== undefined && { end_date: patch.end }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        updated_at: nowIso(),
      })
      .where("id", "=", id),
  ]);
}

export async function deleteEvent(id: string): Promise<void> {
  await write("Étape supprimée", ["production_event"], [db.deleteFrom("production_event").where("id", "=", id)]);
}
