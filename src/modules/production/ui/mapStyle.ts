import type { StyleSpecification } from "maplibre-gl";

/**
 * The map in the greys of Oniric: the style ships with the software, so that the same drawing holds offline; only the
 * tiles and the letters of the labels come through the core. The layers follow the OpenMapTiles schema of OpenFreeMap.
 */

/** Tauri's address for a protocol of ours on Windows. */
export const TILES_ORIGIN = "http://oniric-tiles.localhost";

interface Palette {
  land: string;
  water: string;
  green: string;
  building: string;
  road: string;
  roadLine: string;
  major: string;
  majorLine: string;
  text: string;
  halo: string;
  border: string;
}

const LIGHT: Palette = {
  land: "#f4f4f2",
  water: "#c9d8e6",
  green: "#dfe8d7",
  building: "#e6e4e0",
  road: "#ffffff",
  roadLine: "#d9d8d4",
  major: "#fbf3d9",
  majorLine: "#d8ccab",
  text: "#3f4145",
  halo: "#ffffff",
  border: "#b6b5b1",
};

const DARK: Palette = {
  land: "#1f1f23",
  water: "#17242f",
  green: "#232b24",
  building: "#2a2a2f",
  road: "#35353b",
  roadLine: "#2a2a2f",
  major: "#4a4538",
  majorLine: "#37342b",
  text: "#c5c6cb",
  halo: "#17171a",
  border: "#4c4c54",
};

const REGULAR = ["Noto Sans Regular"];
const BOLD = ["Noto Sans Bold"];

const by = (...stops: number[]) => ["interpolate", ["exponential", 1.5], ["zoom"], ...stops] as unknown as number;

export function mapStyle(dark: boolean, online: boolean): StyleSpecification {
  const c = dark ? DARK : LIGHT;
  const name = ["coalesce", ["get", "name:latin"], ["get", "name"]] as unknown as string;
  const major = ["motorway", "trunk", "primary"];
  const middle = ["secondary", "tertiary"];
  const minor = ["minor", "service", "track"];
  const roadClass = (list: string[]) => ["all", ["in", ["get", "class"], ["literal", list]], ["!=", ["get", "brunnel"], "tunnel"]] as never;
  const base: StyleSpecification["layers"] = [{ id: "background", type: "background", paint: { "background-color": c.land } }];
  if (!online) return { version: 8, glyphs: `${TILES_ORIGIN}/f/{fontstack}/{range}.pbf`, sources: {}, layers: base };
  return {
    version: 8,
    glyphs: `${TILES_ORIGIN}/f/{fontstack}/{range}.pbf`,
    sources: {
      osm: { type: "vector", tiles: [`${TILES_ORIGIN}/t/{z}/{x}/{y}`], minzoom: 0, maxzoom: 14, attribution: "" },
    },
    layers: [
      ...base,
      { id: "landcover", type: "fill", source: "osm", "source-layer": "landcover", filter: ["in", ["get", "class"], ["literal", ["wood", "grass", "farmland"]]] as never, paint: { "fill-color": c.green, "fill-opacity": 0.6 } },
      { id: "park", type: "fill", source: "osm", "source-layer": "park", paint: { "fill-color": c.green, "fill-opacity": 0.7 } },
      { id: "water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": c.water } },
      { id: "waterway", type: "line", source: "osm", "source-layer": "waterway", paint: { "line-color": c.water, "line-width": by(8, 0.5, 18, 5) } },
      { id: "building", type: "fill", source: "osm", "source-layer": "building", minzoom: 13, paint: { "fill-color": c.building, "fill-outline-color": c.roadLine } },
      { id: "road-minor-line", type: "line", source: "osm", "source-layer": "transportation", minzoom: 12, filter: roadClass(minor), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.roadLine, "line-width": by(12, 1, 18, 12) } },
      { id: "road-middle-line", type: "line", source: "osm", "source-layer": "transportation", minzoom: 8, filter: roadClass(middle), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.roadLine, "line-width": by(8, 1, 18, 18) } },
      { id: "road-major-line", type: "line", source: "osm", "source-layer": "transportation", minzoom: 5, filter: roadClass(major), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.majorLine, "line-width": by(5, 1, 18, 24) } },
      { id: "road-minor", type: "line", source: "osm", "source-layer": "transportation", minzoom: 12, filter: roadClass(minor), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.road, "line-width": by(12, 0.5, 18, 10) } },
      { id: "road-middle", type: "line", source: "osm", "source-layer": "transportation", minzoom: 8, filter: roadClass(middle), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.road, "line-width": by(8, 0.5, 18, 15) } },
      { id: "road-major", type: "line", source: "osm", "source-layer": "transportation", minzoom: 5, filter: roadClass(major), layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": c.major, "line-width": by(5, 0.6, 18, 20) } },
      { id: "path", type: "line", source: "osm", "source-layer": "transportation", minzoom: 14, filter: ["==", ["get", "class"], "path"] as never, paint: { "line-color": c.border, "line-width": 1, "line-dasharray": [2, 2] } },
      { id: "rail", type: "line", source: "osm", "source-layer": "transportation", minzoom: 10, filter: ["==", ["get", "class"], "rail"] as never, paint: { "line-color": c.border, "line-width": 1 } },
      { id: "boundary", type: "line", source: "osm", "source-layer": "boundary", filter: ["<=", ["get", "admin_level"], 4] as never, paint: { "line-color": c.border, "line-width": 1, "line-dasharray": [3, 2] } },
      { id: "road-name", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: 13, layout: { "symbol-placement": "line", "text-field": name, "text-font": REGULAR, "text-size": 11 }, paint: { "text-color": c.text, "text-halo-color": c.halo, "text-halo-width": 1.5 } },
      { id: "water-name", type: "symbol", source: "osm", "source-layer": "water_name", layout: { "text-field": name, "text-font": REGULAR, "text-size": 11 }, paint: { "text-color": c.text, "text-opacity": 0.7, "text-halo-color": c.water, "text-halo-width": 1 } },
      { id: "housenumber", type: "symbol", source: "osm", "source-layer": "housenumber", minzoom: 17, layout: { "text-field": ["get", "housenumber"] as never, "text-font": REGULAR, "text-size": 10 }, paint: { "text-color": c.text, "text-opacity": 0.7 } },
      {
        id: "place-small",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        minzoom: 9,
        filter: ["in", ["get", "class"], ["literal", ["village", "hamlet", "suburb", "quarter", "neighbourhood"]]] as never,
        layout: { "text-field": name, "text-font": REGULAR, "text-size": by(9, 10, 16, 14) },
        paint: { "text-color": c.text, "text-halo-color": c.halo, "text-halo-width": 1.5 },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town"]]] as never,
        layout: { "text-field": name, "text-font": BOLD, "text-size": by(5, 11, 14, 18) },
        paint: { "text-color": c.text, "text-halo-color": c.halo, "text-halo-width": 1.5 },
      },
      {
        id: "place-country",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["country", "state"]]] as never,
        layout: { "text-field": name, "text-font": BOLD, "text-size": 13 },
        paint: { "text-color": c.text, "text-halo-color": c.halo, "text-halo-width": 2 },
      },
    ],
  };
}
