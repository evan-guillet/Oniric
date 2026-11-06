import { useMemo } from "react";
import { useLive } from "../../../core/db/live";
import { numberFormat } from "../../../core/i18n";
import { loadEntries, type Entry } from "../../script/bible/application/bible";
import { useBreakdown, scenesByElement, type Breakdown } from "../application/breakdown";
import { usePlans, type Plans } from "../application/schedule";
import { useScouting, type RealLocation, type Scouting } from "../application/scouting";
import { usePermits } from "../application/permits";
import { useTeam, type Team } from "../application/team";
import { NO_FACTS, parsePay, type BudgetFacts } from "../domain/budget";
import { decorsOfPlace, permitAlerts, type DecorRef, type PermitAlert, type ShootDayRef } from "../domain/permits";
import { useBoard, type Board } from "./ScheduleView";

/** A real place as the schedule sees it: the names of the bible's places it plays. */
export function decorRefs(locations: RealLocation[], entries: Pick<Entry, "id" | "name" | "aliases">[]): DecorRef[] {
  const named = new Map(entries.map((e) => [e.id, [e.name, ...e.aliases]]));
  return locations
    .filter((l) => l.kind === "set" && l.status !== "refused")
    .map((l) => ({ id: l.id, name: l.name, noPermit: l.data.noPermit, retained: l.status === "kept" || l.status === "booked", plays: l.entries.flatMap((id) => named.get(id) ?? []) }));
}

export function shootDayRefs(b: Pick<Board, "days">): ShootDayRef[] {
  return b.days.filter((d) => d.day.kind === "shoot").map((d) => ({ id: d.day.id, number: d.number ?? 0, date: d.date, places: [...new Set(d.scenes.map((s) => s.facts.place).filter(Boolean))] }));
}

/** How many days the current schedule works in a week: what a rate by the week is shared over. */
export function workWeek(plans: Plans): number {
  return plans.schedules.find((s) => s.id === plans.currentId)?.week.length || 5;
}

/** The days of the current schedule and what each real place, each post and each element needs of them [BUD-03]. */
export function budgetFacts(b: Board, team: Team, scouting: Scouting, breakdown: Breakdown | undefined, decors: DecorRef[], daysInWeek = 5): BudgetFacts {
  const days = shootDayRefs(b);
  const crew = new Map(
    team.crew.map((m) => {
      const pay = parsePay(m.rate);
      return [
        m.id,
        {
          days: days.filter((d) => !d.date || ((!m.startDate || m.startDate <= d.date) && (!m.endDate || d.date <= m.endDate))).length,
          rate: pay?.rate ?? null,
          ...(pay?.per === "week" && { perWeek: daysInWeek }),
        },
      ];
    }),
  );
  const sceneDays = new Map<string, Set<string>>();
  for (const d of b.days.filter((x) => x.day.kind === "shoot")) for (const s of d.scenes) sceneDays.set(s.scene.id, new Set([...(sceneDays.get(s.scene.id) ?? []), d.day.id]));
  const element = new Map<string, number>();
  if (breakdown)
    for (const [id, scenes] of scenesByElement(breakdown)) {
      const on = new Set(scenes.flatMap((s) => [...(sceneDays.get(s) ?? [])]));
      element.set(id, on.size);
    }
  const location = new Map(
    scouting.locations.map((l) => {
      const n = days.filter((d) => d.places.some((p) => decorsOfPlace(p, decors).some((x) => x.id === l.id))).length;
      return [l.id, { days: n, rental: l.data.rental }];
    }),
  );
  return { shootDays: days.length, crew, element, location };
}

/** What the budget reads of the rest of the film, kept up to date. */
export function useBudgetFacts(): BudgetFacts {
  const plans = usePlans();
  const team = useTeam();
  const b = useBoard(plans, team);
  const scouting = useScouting();
  const breakdown = useBreakdown();
  const entries = useLive(loadEntries, ["bible_entry"]);
  return useMemo(() => {
    if (!b || !plans || !team || !scouting || !entries) return NO_FACTS;
    return budgetFacts(b, team, scouting, breakdown, decorRefs(scouting.locations, entries), workWeek(plans));
  }, [b, plans, team, scouting, breakdown, entries]);
}

/** The shooting days in a set without a permit for that day [AUT-04], undefined until everything is read. */
export function usePermitAlerts(): PermitAlert[] | undefined {
  const plans = usePlans();
  const team = useTeam();
  const b = useBoard(plans, team);
  const scouting = useScouting();
  const permits = usePermits();
  const entries = useLive(loadEntries, ["bible_entry"]);
  return useMemo(() => {
    if (!b || !scouting || !permits || !entries) return undefined;
    return permitAlerts(shootDayRefs(b), decorRefs(scouting.locations, entries), permits.permits);
  }, [b, scouting, permits, entries]);
}

/** The amount in the currency of the budget, with the separators of the language and without cents when there are none. */
export function money(n: number, currency = "EUR"): string {
  const digits = Number.isInteger(n) ? 0 : 2;
  try {
    return numberFormat({ style: "currency", currency: currency || "EUR", minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n)} ${currency}`;
  }
}
