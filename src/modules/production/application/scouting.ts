import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson, useLive } from "../../../core/db/live";
import type { RealKind, RealStatus, RouteMode, TableName } from "../../../core/db/schema";
import { uuidv7 } from "../../../core/ids";
import { rankBetween } from "../../../core/ordering";
import { readSetting, writeSetting } from "../../script/screenplay/application/settings";
import { DEFAULT_CRITERIA, locationData, type Bounds, type LocationData } from "../domain/scouting";

export const SCOUTING_TABLES: TableName[] = ["real_location", "real_location_entry", "scouting_visit", "map_route"];

export interface RealLocation {
  id: string;
  kind: RealKind;
  status: RealStatus;
  name: string;
  address: string;
  lat: number | null;
  lon: number | null;
  rank: string;
  data: LocationData;
  /** The places of the bible it plays. */
  entries: string[];
}

export interface VisitData {
  participants: string;
  report: string;
  photos: string[];
}

export interface Visit extends VisitData {
  id: string;
  locationId: string;
  date: string | null;
}

export interface MapRoute {
  from: string;
  to: string;
  mode: RouteMode;
  distance: number;
  duration: number;
  geometry: [number, number][];
}

export interface Scouting {
  locations: RealLocation[];
  visits: Visit[];
  routes: MapRoute[];
}

export async function loadScouting(): Promise<Scouting> {
  const [rows, links, visits, routes] = await Promise.all([
    query(db.selectFrom("real_location").selectAll().orderBy("rank")),
    query(db.selectFrom("real_location_entry").selectAll()),
    query(db.selectFrom("scouting_visit").selectAll().orderBy("visited_on", "desc")),
    query(db.selectFrom("map_route").selectAll()),
  ]);
  return {
    locations: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lon: r.lon,
      rank: r.rank,
      data: locationData(parseJson(r.data, {})),
      entries: links.filter((l) => l.location_id === r.id).map((l) => l.entry_id),
    })),
    visits: visits.map((r) => ({ participants: "", report: "", photos: [], ...parseJson<Partial<VisitData>>(r.data, {}), id: r.id, locationId: r.location_id, date: r.visited_on })),
    routes: routes.map((r) => ({ from: r.from_id, to: r.to_id, mode: r.mode, distance: r.distance_m, duration: r.duration_s, geometry: parseJson<[number, number][]>(r.geometry, []) })),
  };
}

export function useScouting(): Scouting | undefined {
  return useLive(loadScouting, SCOUTING_TABLES);
}

export async function addLocation(s: Scouting, init: { name: string; kind?: RealKind; lat?: number | null; lon?: number | null; address?: string; entryId?: string }): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Décor", ["real_location", "real_location_entry"], [
    db.insertInto("real_location").values({
      id,
      name: init.name,
      kind: init.kind ?? "set",
      address: init.address ?? "",
      lat: init.lat ?? null,
      lon: init.lon ?? null,
      rank: rankBetween(s.locations[s.locations.length - 1]?.rank ?? null, null),
      created_at: now,
      updated_at: now,
    }),
    ...(init.entryId ? [db.insertInto("real_location_entry").values({ location_id: id, entry_id: init.entryId })] : []),
  ]);
  return id;
}

export type LocationPatch = Partial<Pick<RealLocation, "kind" | "status" | "name" | "address" | "lat" | "lon" | "data">>;

export async function updateLocation(id: string, patch: LocationPatch): Promise<void> {
  const { data, ...rest } = patch;
  await write("Décor", ["real_location"], [
    db
      .updateTable("real_location")
      .set({ ...rest, ...(data && { data: JSON.stringify(data) }), updated_at: nowIso() })
      .where("id", "=", id),
  ]);
}

export async function deleteLocation(id: string): Promise<void> {
  await write("Décor supprimé", [...SCOUTING_TABLES, "permit", "insurance", "legal_document"], [db.deleteFrom("real_location").where("id", "=", id)]);
}

export async function linkEntry(locationId: string, entryId: string): Promise<void> {
  await write("Lieu de la Bible", ["real_location_entry"], [db.insertInto("real_location_entry").values({ location_id: locationId, entry_id: entryId }).onConflict((oc) => oc.doNothing())]);
}

export async function unlinkEntry(locationId: string, entryId: string): Promise<void> {
  await write("Lieu de la Bible", ["real_location_entry"], [db.deleteFrom("real_location_entry").where("location_id", "=", locationId).where("entry_id", "=", entryId)]);
}

export async function addVisit(locationId: string): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Visite", ["scouting_visit"], [db.insertInto("scouting_visit").values({ id, location_id: locationId, visited_on: now.slice(0, 10), created_at: now, updated_at: now })]);
  return id;
}

export async function updateVisit(v: Visit, patch: Partial<VisitData> & { date?: string | null }): Promise<void> {
  const { date, ...fields } = patch;
  const data: VisitData = { participants: v.participants, report: v.report, photos: v.photos, ...fields };
  await write("Visite", ["scouting_visit"], [
    db
      .updateTable("scouting_visit")
      .set({ data: JSON.stringify(data), ...(date !== undefined && { visited_on: date }), updated_at: nowIso() })
      .where("id", "=", v.id),
  ]);
}

export async function deleteVisit(id: string): Promise<void> {
  await write("Visite supprimée", ["scouting_visit"], [db.deleteFrom("scouting_visit").where("id", "=", id)]);
}

/** A route worked out is kept in the project: it stays readable without a connection [REP-04d]. Undoing it means nothing. */
export async function saveRoute(r: MapRoute): Promise<void> {
  const row = { distance_m: r.distance, duration_s: r.duration, geometry: JSON.stringify(r.geometry), computed_at: nowIso() };
  await write(
    "Itinéraire",
    ["map_route"],
    [
      db
        .insertInto("map_route")
        .values({ from_id: r.from, to_id: r.to, mode: r.mode, ...row })
        .onConflict((oc) => oc.columns(["from_id", "to_id", "mode"]).doUpdateSet(row)),
    ],
    false,
  );
}

const CRITERIA = "scouting_criteria";
const OVERLAYS = "map_overlays";

export interface Criterion {
  id: string;
  /** Empty: the name of a criterion given by the software. */
  name: string;
}

export async function readCriteria(): Promise<Criterion[]> {
  const saved = parseJson<Criterion[] | null>(await readSetting(CRITERIA), null);
  return saved ?? DEFAULT_CRITERIA.map((id) => ({ id, name: "" }));
}

export const useCriteria = () => useLive(readCriteria, ["project_setting"]);
export const writeCriteria = (list: Criterion[]) => writeSetting(CRITERIA, JSON.stringify(list));

/** An aerial photograph or a plan laid on the map, by the area it covers [REP-04f]. */
export interface MapOverlay {
  id: string;
  name: string;
  path: string;
  bounds: Bounds;
  opacity: number;
}

export const readOverlays = async () => parseJson<MapOverlay[]>(await readSetting(OVERLAYS), []);
export const useOverlays = () => useLive(readOverlays, ["project_setting"]);
export const writeOverlays = (list: MapOverlay[]) => writeSetting(OVERLAYS, JSON.stringify(list));
