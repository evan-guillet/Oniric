/** The real places of the film, how they compare, and the small sums the map asks for [REP-01 to REP-07]. */

import type { RealKind, RealStatus } from "../../../core/db/schema";

export const REAL_KINDS: RealKind[] = ["set", "base", "parking", "catering", "hospital", "pharmacy"];
export const REAL_STATUSES: RealStatus[] = ["lead", "visited", "kept", "booked", "refused"];

export interface LocationData {
  type: string;
  ownerName: string;
  ownerContact: string;
  photos: string[];
  plan: string | null;
  orientation: string;
  access: string;
  parking: string;
  power: string;
  toilets: string;
  network: string;
  noise: string;
  constraints: string;
  /** Rental per day, in the currency of the budget. */
  rental: number | null;
  hospital: string;
  pharmacy: string;
  notes: string;
  /** Scores given to the criteria of the comparison, from 1 to 5. */
  scores: Record<string, number>;
  /** The last picture taken of the map around it. */
  capture: string | null;
  /** A place that needs no permit: no alert for it. */
  noPermit: boolean;
}

export const EMPTY_LOCATION: LocationData = {
  type: "",
  ownerName: "",
  ownerContact: "",
  photos: [],
  plan: null,
  orientation: "",
  access: "",
  parking: "",
  power: "",
  toilets: "",
  network: "",
  noise: "",
  constraints: "",
  rental: null,
  hospital: "",
  pharmacy: "",
  notes: "",
  scores: {},
  capture: null,
  noPermit: false,
};

export const locationData = (raw: Partial<LocationData> | null | undefined): LocationData => ({ ...EMPTY_LOCATION, ...raw });

export const DEFAULT_CRITERIA = ["look", "access", "sound", "light", "cost"];

export interface LatLon {
  lat: number;
  lon: number;
}

/** The distance along the ground, in metres. */
export function haversine(a: LatLon, b: LatLon): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

/** « 850 m », « 12,4 km », with the decimal mark of the language. */
export function formatDistance(metres: number, locale = "fr"): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toLocaleString(locale, { maximumFractionDigits: metres < 100000 ? 1 : 0 })} km`;
}

/** « 8 min », « 1 h 05 ». */
export function formatDuration(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** The mean score of a place over the criteria it was given, or null. */
export function meanScore(scores: Record<string, number>, criteria: string[]): number | null {
  const given = criteria.map((c) => scores[c]).filter((n) => typeof n === "number" && n > 0);
  return given.length ? given.reduce((a, b) => a + b, 0) / given.length : null;
}

/** Web Mercator tile holding a point at a zoom. */
function tileOf(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return {
    x: Math.max(0, Math.min(n - 1, Math.floor(((lon + 180) / 360) * n))),
    y: Math.max(0, Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n))),
  };
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const ZONE_MAX_ZOOM = 14;
export const ZONE_MAX_TILES = 4000;

/** How many tiles a zone takes, from the zoom it is seen at up to the last one that holds details [REP-04c]. */
export function zoneTiles(b: Bounds, fromZoom = 6, toZoom = ZONE_MAX_ZOOM): { z: number; x: number; y: number }[] {
  const out: { z: number; x: number; y: number }[] = [];
  for (let z = fromZoom; z <= toZoom; z++) {
    const a = tileOf(b.north, b.west, z);
    const c = tileOf(b.south, b.east, z);
    for (let x = a.x; x <= c.x; x++) for (let y = a.y; y <= c.y; y++) out.push({ z, x, y });
  }
  return out;
}

/** The size of a zone without listing it: enough to refuse one too large. */
export function zoneCount(b: Bounds, fromZoom = 6, toZoom = ZONE_MAX_ZOOM): number {
  let n = 0;
  for (let z = fromZoom; z <= toZoom; z++) {
    const a = tileOf(b.north, b.west, z);
    const c = tileOf(b.south, b.east, z);
    n += (c.x - a.x + 1) * (c.y - a.y + 1);
  }
  return n;
}

/**
 * The position in a JPEG's EXIF data, to place a set from its photos [REP-03]. It reads the block by hand: the format
 * is small, and an image is only read, never run. Null for anything else.
 */
export function exifPosition(bytes: Uint8Array): LatLon | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    const marker = view.getUint16(at);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
    const size = view.getUint16(at + 2);
    if (marker === 0xffe1 && at + 10 <= bytes.length && String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === "Exif") return readTiff(view, at + 10, at + 2 + size);
    at += 2 + size;
  }
  return null;
}

function readTiff(view: DataView, base: number, end: number): LatLon | null {
  if (base + 8 > view.byteLength) return null;
  const little = view.getUint16(base) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const inside = (o: number, n = 1) => o >= base && o + n <= Math.min(end, view.byteLength);
  if (u16(base + 2) !== 42) return null;
  const find = (ifd: number, tag: number): number | null => {
    if (!inside(ifd, 2)) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (!inside(e, 12)) return null;
      if (u16(e) === tag) return e;
    }
    return null;
  };
  const first = base + u32(base + 4);
  const gpsEntry = find(first, 0x8825);
  if (gpsEntry === null) return null;
  const gps = base + u32(gpsEntry + 8);
  const coord = (tag: number): number | null => {
    const e = find(gps, tag);
    if (e === null || u32(e + 4) !== 3) return null;
    const o = base + u32(e + 8);
    if (!inside(o, 24)) return null;
    const part = (i: number) => {
      const d = u32(o + i * 8 + 4);
      return d ? u32(o + i * 8) / d : 0;
    };
    return part(0) + part(1) / 60 + part(2) / 3600;
  };
  const ref = (tag: number): string => {
    const e = find(gps, tag);
    return e === null ? "" : String.fromCharCode(view.getUint8(e + 8));
  };
  const lat = coord(2);
  const lon = coord(4);
  if (lat === null || lon === null || (lat === 0 && lon === 0)) return null;
  return { lat: ref(1) === "S" ? -lat : lat, lon: ref(3) === "W" ? -lon : lon };
}
