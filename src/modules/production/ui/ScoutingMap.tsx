import { open } from "@tauri-apps/plugin-dialog";
import { Camera, CloudDownload, Crosshair, ImageUp, Layers, MapPin, Minus, MousePointer2, Plus, Route, Search, Sun, Trash2, Wifi, WifiOff, X } from "lucide-react";
import maplibregl, { type GeoJSONSource, type Map as GlMap } from "maplibre-gl/dist/maplibre-gl-csp";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-csp-worker?url";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { commands, events, type GeoResult, type MapCacheState, type MapSettings } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import type { RouteMode } from "../../../core/db/schema";
import { describeError } from "../../../core/errors";
import { numberFormat, plural, t } from "../../../core/i18n";
import { confirmRemoval } from "../../../ui-kit/Dialog";
import { Select } from "../../../ui-kit/Select";
import { useProject } from "../../project/ui/projectContext";
import { readImage, storeImage } from "../../shared/media";
import { usePlans } from "../application/schedule";
import { addLocation, saveRoute, updateLocation, useOverlays, writeOverlays, type MapOverlay, type RealLocation, type Scouting } from "../application/scouting";
import { useTeam } from "../application/team";
import { chosenDecors } from "../domain/permits";
import { formatDistance, formatDuration, REAL_KINDS, ZONE_MAX_TILES, zoneCount, type Bounds } from "../domain/scouting";
import { goldenHours, localTime, sunPosition, sunTimesUtc, utcMinutesOf } from "../domain/sun";
import { useLive } from "../../../core/db/live";
import { loadEntries } from "../../script/bible/application/bible";
import { mapStyle } from "./mapStyle";
import { decorRefs, shootDayRefs } from "./preparation";
import { dayTitle, useBoard } from "./ScheduleView";

maplibregl.setWorkerUrl(workerUrl);

type Panel = "pin" | "layers" | "zones" | null;

/** A token of the theme, as the map's drawing needs its value. */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || "#888";

function statusColor(l: RealLocation): string {
  if (l.kind !== "set") return token("ink-2");
  return { lead: token("gray-dot"), visited: token("warning-dot"), kept: token("ok-dot"), booked: token("ok-dot"), refused: token("danger-dot") }[l.status];
}

/** The point a bearing and a distance lead to, near enough for what is drawn here. */
function towards(lat: number, lon: number, bearing: number, metres: number): [number, number] {
  const r = (bearing * Math.PI) / 180;
  const dLat = (metres * Math.cos(r)) / 111320;
  const dLon = (metres * Math.sin(r)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon + dLon, lat + dLat];
}

/** Six decimals: a position to within a dozen centimetres, more than a click on a map can tell. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Whether the window is dark now; the map is drawn again when it changes. */
function useDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => setDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return dark;
}

/** The map, its only reading of the settings, and what it says about the connection [REP-04]. */
export default function ScoutingMap({ scouting: s, focus, onOpen }: { scouting: Scouting; focus: string | null; onOpen: (id: string) => void }) {
  const { notify, ask, prompt } = useProject();
  const fail = useCallback((e: unknown) => notify({ text: describeError(e), tone: "error" }), [notify]);
  const dark = useDark();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GlMap | null>(null);
  const lastView = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [activity, setActivity] = useState({ active: 0, offline: false });
  const [selected, setSelected] = useState<string | null>(focus);
  const [panel, setPanel] = useState<Panel>(focus ? "pin" : null);
  const [placing, setPlacing] = useState<string | "new" | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [layers, setLayers] = useState({ sets: true, refused: false, around: true });
  const [dayId, setDayId] = useState("");
  const [sunDate, setSunDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sunHour, setSunHour] = useState(12);
  const [showRoute, setShowRoute] = useState<RouteMode | null>(null);
  const overlays = useOverlays();
  const plans = usePlans();
  const team = useTeam();
  const board = useBoard(plans, team);
  const entries = useLive(loadEntries, ["bible_entry"]);

  useEffect(() => {
    void commands.mapSettingsGet().then(setSettings);
    // The window behind the settings stays open: when the map is cut there, this one hears of it.
    const off = events.mapActivity.listen((e) => {
      setActivity(e.payload);
      setSettings((old) => (old && old.enabled !== e.payload.enabled ? { ...old, enabled: e.payload.enabled } : old));
    });
    return () => void off.then((f) => f());
  }, []);

  const placed = useMemo(() => s.locations.filter((l) => l.lat !== null && l.lon !== null), [s.locations]);
  const location = s.locations.find((l) => l.id === selected) ?? null;
  const base = s.locations.find((l) => l.kind === "base" && l.lat !== null && l.id !== selected) ?? null;
  const dayDecors = useMemo(() => {
    if (!dayId || !board || !entries) return null;
    const day = shootDayRefs(board).find((d) => d.id === dayId);
    if (!day) return null;
    const decors = decorRefs(s.locations, entries);
    return new Set(day.places.flatMap((p) => chosenDecors(p, decors).map((d) => d.id)));
  }, [dayId, board, entries, s.locations]);
  const visible = useMemo(
    () =>
      placed.filter((l) => {
        if (dayDecors) return dayDecors.has(l.id);
        if (l.kind !== "set") return layers.around;
        return l.status === "refused" ? layers.refused : layers.sets;
      }),
    [placed, layers, dayDecors],
  );

  // The map itself, made once the settings are known, and made again when it is switched on or off.
  const enabled = settings?.enabled ?? false;
  useEffect(() => {
    if (!settings || !box.current) return;
    const first = focusPoint(s, focus);
    // Drawn again (the theme, the connection), it stays where it was.
    const kept = lastView.current;
    const map = new maplibregl.Map({
      container: box.current,
      style: mapStyle(dark, enabled),
      center: kept?.center ?? (first ? [first.lon, first.lat] : [2.35, 46.6]),
      zoom: kept?.zoom ?? (first ? 14 : 5),
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: enabled ? t("scouting.map.attribution") : t("scouting.map.attributionOff") }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => {
      map.addSource("overlays-empty", { type: "geojson", data: empty });
      map.addSource("pins", { type: "geojson", data: empty });
      map.addSource("route", { type: "geojson", data: empty });
      map.addSource("sun", { type: "geojson", data: empty });
      map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": token("accent"), "line-width": 4, "line-opacity": 0.85 } });
      map.addLayer({ id: "sun-line", type: "line", source: "sun", layout: { "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-dasharray": [1, 2] } });
      map.addLayer({ id: "sun-label", type: "symbol", source: "sun", filter: ["has", "label"], layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-offset": [0, -0.9] }, paint: { "text-color": ["get", "color"], "text-halo-color": token("panel"), "text-halo-width": 2 } });
      map.addLayer({ id: "pin-halo", type: "circle", source: "pins", filter: ["==", ["get", "selected"], true], paint: { "circle-radius": 14, "circle-color": token("accent"), "circle-opacity": 0.22 } });
      map.addLayer({ id: "pin", type: "circle", source: "pins", paint: { "circle-radius": ["case", ["==", ["get", "kind"], "set"], 7, 5.5], "circle-color": ["get", "color"], "circle-stroke-color": token("panel"), "circle-stroke-width": 2 } });
      map.addLayer({ id: "pin-name", type: "symbol", source: "pins", layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true }, paint: { "text-color": token("ink"), "text-halo-color": token("panel"), "text-halo-width": 2 } });
      setReady(true);
    });
    map.on("click", "pin", (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id && !placingRef.current) {
        setSelected(id);
        setPanel("pin");
      }
    });
    map.on("mouseenter", "pin", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "pin", () => (map.getCanvas().style.cursor = placingRef.current ? "crosshair" : ""));
    map.on("click", (e: maplibregl.MapMouseEvent) => placeRef.current(round(e.lngLat.lat), round(e.lngLat.lng)));
    map.on("moveend", () => {
      const c = map.getCenter();
      lastView.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
    });
    const fit = new ResizeObserver(() => map.resize());
    fit.observe(box.current);
    mapRef.current = map;
    return () => {
      fit.disconnect();
      setReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, [settings === null, enabled, dark]);

  // Placing: a click on the map gives the place its position.
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const placeRef = useRef<(lat: number, lon: number) => void>(() => {});
  placeRef.current = (lat, lon) => {
    const what = placingRef.current;
    if (!what) return;
    setPlacing(null);
    void (async () => {
      try {
        if (what === "new") {
          const name = (await prompt(t("scouting.newLocation"), t("scouting.name")))?.trim();
          if (!name) return;
          const id = await addLocation(s, { name, lat, lon });
          setSelected(id);
          setPanel("pin");
        } else {
          await updateLocation(what, { lat, lon });
          setSelected(what);
          setPanel("pin");
        }
      } catch (e) {
        fail(e);
      }
    })();
  };
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = placing ? "crosshair" : "";
  }, [placing, ready]);

  // Pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("pins") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: visible.map((l) => ({ type: "Feature", geometry: { type: "Point", coordinates: [l.lon!, l.lat!] }, properties: { id: l.id, name: l.name, kind: l.kind, color: statusColor(l), selected: l.id === selected } })),
    });
  }, [ready, visible, selected]);

  // When the connection fails, the land becomes a plain grid: the pins and what is known stay [REP-04d].
  useEffect(() => {
    if (box.current) box.current.classList.toggle("sc-map-grid", !enabled || activity.offline);
    const map = mapRef.current;
    if (ready && map?.getLayer("background")) map.setPaintProperty("background", "background-opacity", !enabled || activity.offline ? 0 : 1);
  }, [ready, enabled, activity.offline]);

  // Overlays: an aerial photograph or a plan, under the pins [REP-04f].
  const shownOverlays = useRef<string[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !overlays) return;
    let alive = true;
    void (async () => {
      for (const id of shownOverlays.current) {
        if (map.getLayer(`ov-${id}`)) map.removeLayer(`ov-${id}`);
        if (map.getSource(`ov-${id}`)) map.removeSource(`ov-${id}`);
      }
      shownOverlays.current = [];
      for (const o of overlays) {
        const url = await readImage(o.path).catch(() => null);
        if (!alive || !url) continue;
        const b = o.bounds;
        map.addSource(`ov-${o.id}`, { type: "image", url, coordinates: [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]] });
        map.addLayer({ id: `ov-${o.id}`, type: "raster", source: `ov-${o.id}`, paint: { "raster-opacity": o.opacity } }, "route-line");
        shownOverlays.current.push(o.id);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, overlays]);

  // The chosen pin comes into view when it was asked for.
  useEffect(() => {
    if (!ready || !focus) return;
    const f = s.locations.find((l) => l.id === focus);
    if (f && f.lat === null) setPlacing(f.id);
  }, [ready, focus]);

  const route = location && base && showRoute ? s.routes.find((r) => r.from === base.id && r.to === location.id && r.mode === showRoute) : undefined;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("route") as GeoJSONSource).setData(route ? { type: "Feature", geometry: { type: "LineString", coordinates: route.geometry }, properties: {} } : empty);
  }, [ready, route]);

  // The sun: its bearing at sunrise, at sunset and at the chosen hour, drawn from the place [REP-04].
  const sun = useMemo(() => {
    if (!location || location.lat === null || location.lon === null) return null;
    const { lat, lon } = location as { lat: number; lon: number };
    const times = sunTimesUtc(sunDate, lat, lon);
    const golden = goldenHours(sunDate, lat, lon);
    const at = utcMinutesOf(sunDate, Math.floor(sunHour), Math.round((sunHour % 1) * 60));
    const now = sunPosition(sunDate, at, lat, lon);
    return {
      lat,
      lon,
      now,
      rise: times ? { ...sunPosition(sunDate, times.rise, lat, lon), text: localTime(sunDate, times.rise) } : null,
      set: times ? { ...sunPosition(sunDate, times.set, lat, lon), text: localTime(sunDate, times.set) } : null,
      golden: golden && times ? { morning: `${localTime(sunDate, times.rise)} – ${localTime(sunDate, golden.morningEnd)}`, evening: `${localTime(sunDate, golden.eveningStart)} – ${localTime(sunDate, times.set)}` } : null,
    };
  }, [location, sunDate, sunHour]);
  const drawSun = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("sun")) return;
    if (!sun || panel !== "pin") {
      (map.getSource("sun") as GeoJSONSource).setData(empty);
      return;
    }
    const metres = (40075016 / 2 ** map.getZoom()) * 0.35 * Math.cos((sun.lat * Math.PI) / 180);
    const ray = (bearing: number, color: string, width: number, label?: string) => ({ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: [[sun.lon, sun.lat], towards(sun.lat, sun.lon, bearing, metres)] }, properties: { color, width, ...(label ? { label } : {}) } });
    (map.getSource("sun") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [
        ...(sun.rise ? [ray(sun.rise.azimuth, token("warning-dot"), 2, t("scouting.map.sunrise"))] : []),
        ...(sun.set ? [ray(sun.set.azimuth, token("danger-dot"), 2, t("scouting.map.sunset"))] : []),
        ...(sun.now.elevation > 0 ? [ray(sun.now.azimuth, token("warning"), 4)] : []),
      ],
    });
  }, [sun, panel]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    drawSun();
    map.on("zoomend", drawSun);
    return () => void map.off("zoomend", drawSun);
  }, [ready, drawSun]);

  const center = (lat: number, lon: number, zoom = 15) => mapRef.current?.flyTo({ center: [lon, lat], zoom: Math.max(mapRef.current.getZoom(), zoom), essential: true });

  const search = async () => {
    const text = q.trim();
    if (!text) return;
    setSearching(true);
    try {
      setFound(unwrap(await commands.mapGeocode(text)));
    } catch (e) {
      fail(e);
    } finally {
      setSearching(false);
    }
  };

  const enable = async (on: boolean) => {
    if (!settings) return;
    const next = { ...settings, enabled: on };
    try {
      unwrap(await commands.mapSettingsSet(next));
      setSettings(next);
    } catch (e) {
      fail(e);
    }
  };

  const capture = async () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.redraw();
      const blob = await new Promise<Blob | null>((res) => map.getCanvas().toBlob(res, "image/png"));
      if (!blob) return;
      const path = await storeImage(blob, "cartes", location?.name || t("scouting.map.captureName"));
      if (location) {
        await updateLocation(location.id, { data: { ...location.data, capture: path } });
        notify({ text: t("scouting.map.capturedFor", { name: location.name }) });
      } else notify({ text: t("scouting.map.captured") });
    } catch (e) {
      fail(e);
    }
  };

  const addOverlay = async () => {
    const map = mapRef.current;
    if (!map || !overlays) return;
    try {
      const f = await open({ title: t("scouting.map.overlayChoose"), filters: [{ name: t("media.images"), extensions: ["png", "jpg", "jpeg", "webp"] }] });
      if (typeof f !== "string") return;
      const path = unwrap(await commands.mediaImport(f, "cartes"));
      const b = map.getBounds();
      await writeOverlays([...overlays, { id: `o${Date.now()}`, name: f.split(/[\\/]/).pop() ?? "", path, opacity: 0.8, bounds: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } }]);
      setPanel("layers");
    } catch (e) {
      fail(e);
    }
  };

  const ctlPressed = (p: Panel) => panel === p;
  const dayList = board ? board.days.filter((d) => d.day.kind === "shoot") : [];
  return (
    <div className={panel ? "view sc-map-view with-panel" : "view sc-map-view"}>
      <div className="sc-map-stage">
        <div ref={box} className="sc-map" />
        <form
          className="sc-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Search aria-hidden="true" />
          <input type="search" value={q} placeholder={t("scouting.map.search")} aria-label={t("scouting.map.search")} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setFound(null); }} />
          {searching && <span className="sc-spin" aria-label={t("scouting.map.searching")} />}
        </form>
        {found && (
          <ul className="sc-found">
            {found.length === 0 && <li className="muted sc-found-none">{t("scouting.map.nothing")}</li>}
            {found.map((r) => (
              <li key={`${r.lat},${r.lon}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (r.lat !== null && r.lon !== null) center(r.lat, r.lon);
                  }}
                >
                  <span className="sc-found-name">{r.name}</span>
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    void (async () => {
                      if (r.lat === null || r.lon === null) return;
                      const name = (await prompt(t("scouting.newLocation"), t("scouting.name"), r.name.split(",")[0]))?.trim();
                      if (!name) return;
                      const id = await addLocation(s, { name, lat: r.lat, lon: r.lon, address: r.name });
                      setSelected(id);
                      setPanel("pin");
                      setFound(null);
                      center(r.lat, r.lon);
                    })().catch(fail);
                  }}
                >
                  {t("scouting.map.addHere")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="sc-status-line" role="status">
          {!enabled ? (
            <span className="sc-net off">
              <WifiOff aria-hidden="true" />
              {t("scouting.map.off")}
            </span>
          ) : activity.offline ? (
            <span className="sc-net off">
              <WifiOff aria-hidden="true" />
              {t("scouting.map.offline")}
            </span>
          ) : activity.active > 0 ? (
            <span className="sc-net on">
              <Wifi aria-hidden="true" />
              {t("scouting.map.connecting")}
            </span>
          ) : null}
        </div>
        {!enabled && settings && (
          <div className="sc-consent">
            <h2>{t("scouting.map.consentTitle")}</h2>
            <p>{t("scouting.map.consentText")}</p>
            <button type="button" className="btn primary" onClick={() => void enable(true)}>
              {t("scouting.map.enable")}
            </button>
          </div>
        )}
        {placing && (
          <div className="sc-placing" role="status">
            <Crosshair aria-hidden="true" />
            {placing === "new" ? t("scouting.map.placingNew") : t("scouting.map.placing", { name: s.locations.find((l) => l.id === placing)?.name ?? "" })}
            <button type="button" className="btn small" onClick={() => setPlacing(null)}>
              {t("common.cancel")}
            </button>
          </div>
        )}
        <div className="sc-zoom">
          <button type="button" aria-label={t("scouting.map.zoomIn")} onClick={() => mapRef.current?.zoomIn()}>
            <Plus aria-hidden="true" />
          </button>
          <button type="button" aria-label={t("scouting.map.zoomOut")} onClick={() => mapRef.current?.zoomOut()}>
            <Minus aria-hidden="true" />
          </button>
        </div>
        <div className="sc-tools" role="toolbar" aria-label={t("scouting.map.tools")}>
          <ToolButton icon={MousePointer2} label={t("scouting.map.toolSelect")} on={!placing} onClick={() => setPlacing(null)} />
          <ToolButton icon={MapPin} label={t("scouting.map.toolPlace")} on={!!placing} onClick={() => setPlacing(placing ? null : "new")} />
          <span className="sc-tools-sep" />
          <ToolButton icon={Layers} label={t("scouting.map.toolLayers")} on={ctlPressed("layers")} onClick={() => setPanel(panel === "layers" ? null : "layers")} />
          <ToolButton icon={CloudDownload} label={t("scouting.map.toolZones")} on={ctlPressed("zones")} onClick={() => setPanel(panel === "zones" ? null : "zones")} />
          <ToolButton icon={ImageUp} label={t("scouting.map.toolOverlay")} on={false} onClick={() => void addOverlay()} />
          <ToolButton icon={Camera} label={t("scouting.map.toolCapture")} on={false} onClick={() => void capture()} />
        </div>
      </div>
      {panel && (
        <aside className="sc-panel" aria-label={t(`scouting.map.panel.${panel}`)}>
          <header>
            <h2>{panel === "pin" ? location?.name || t("scouting.unnamed") : t(`scouting.map.panel.${panel}`)}</h2>
            <button type="button" className="icon-btn" aria-label={t("common.close")} onClick={() => setPanel(null)}>
              <X aria-hidden="true" />
            </button>
          </header>
          {panel === "layers" && (
            <div className="sc-panel-body">
              <label className="sc-check">
                <input type="checkbox" checked={layers.sets} disabled={!!dayDecors} onChange={(e) => setLayers({ ...layers, sets: e.target.checked })} />
                {t("scouting.map.layerSets")}
              </label>
              <label className="sc-check">
                <input type="checkbox" checked={layers.refused} disabled={!!dayDecors} onChange={(e) => setLayers({ ...layers, refused: e.target.checked })} />
                {t("scouting.map.layerRefused")}
              </label>
              <label className="sc-check">
                <input type="checkbox" checked={layers.around} disabled={!!dayDecors} onChange={(e) => setLayers({ ...layers, around: e.target.checked })} />
                {t("scouting.map.layerAround")}
              </label>
              {dayList.length > 0 && (
                <label className="pr-field">
                  <span>{t("scouting.map.layerDay")}</span>
                  <Select value={dayId} onChange={(e) => setDayId(e.target.value)}>
                    <option value="">{t("scouting.map.allDays")}</option>
                    {dayList.map((d) => (
                      <option key={d.day.id} value={d.day.id}>
                        {dayTitle(d)}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              {overlays && overlays.length > 0 && (
                <>
                  <h3>{t("scouting.map.overlays")}</h3>
                  {overlays.map((o) => (
                    <OverlayRow key={o.id} overlay={o} list={overlays} map={mapRef.current} onError={fail} />
                  ))}
                </>
              )}
              <ul className="sc-legend" aria-label={t("scouting.map.legend")}>
                {(["lead", "visited", "kept", "refused"] as const).map((k) => (
                  <li key={k}>
                    <span className={`sc-dot ${k}`} aria-hidden="true" />
                    {t(`scouting.statuses.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {panel === "zones" && <Zones map={mapRef.current} enabled={enabled} onError={fail} ask={ask} prompt={prompt} />}
          {panel === "pin" &&
            (location ? (
              <div className="sc-panel-body">
                {location.kind === "set" ? <p className="muted">{t(`scouting.statuses.${location.status}`)}</p> : <p className="muted">{t(`scouting.kinds.${location.kind}`)}</p>}
                {location.address && <p>{location.address}</p>}
                {location.lat !== null ? (
                  <p className="muted sc-coords">
                    {numberFormat({ maximumFractionDigits: 5 }).format(location.lat)}, {numberFormat({ maximumFractionDigits: 5 }).format(location.lon ?? 0)}
                  </p>
                ) : (
                  <p className="muted">{t("scouting.map.notPlaced")}</p>
                )}
                <div className="sc-panel-actions">
                  <button type="button" className="btn small" onClick={() => onOpen(location.id)}>
                    {t("scouting.map.openCard")}
                  </button>
                  <button type="button" className="btn small" onClick={() => setPlacing(location.id)}>
                    <Crosshair aria-hidden="true" />
                    {location.lat !== null ? t("scouting.map.move") : t("scouting.map.place")}
                  </button>
                </div>
                {base && location.lat !== null && (
                  <section>
                    <h3>
                      <Route aria-hidden="true" />
                      {t("scouting.map.fromBase", { name: base.name })}
                    </h3>
                    {(["car", "foot"] as RouteMode[]).map((mode) => (
                      <RouteRow key={mode} mode={mode} from={base} to={location} scouting={s} enabled={enabled && !activity.offline} shown={showRoute === mode} onShow={() => setShowRoute(showRoute === mode ? null : mode)} onError={fail} />
                    ))}
                  </section>
                )}
                {sun && (
                  <section>
                    <h3>
                      <Sun aria-hidden="true" />
                      {t("scouting.map.sun")}
                    </h3>
                    <label className="pr-field">
                      <span>{t("scouting.map.sunDate")}</span>
                      <input type="date" value={sunDate} onChange={(e) => e.target.value && setSunDate(e.target.value)} />
                    </label>
                    <label className="pr-field">
                      <span>{t("scouting.map.sunAt", { time: `${Math.floor(sunHour)} h ${String(Math.round((sunHour % 1) * 60)).padStart(2, "0")}` })}</span>
                      <input type="range" min={0} max={23.75} step={0.25} value={sunHour} onChange={(e) => setSunHour(Number(e.target.value))} />
                    </label>
                    <dl className="sc-sun">
                      <dt>{t("scouting.map.sunNow")}</dt>
                      <dd>{sun.now.elevation > 0 ? t("scouting.map.sunBearing", { azimuth: Math.round(sun.now.azimuth), height: Math.round(sun.now.elevation) }) : t("scouting.map.sunDown")}</dd>
                      {sun.rise && (
                        <>
                          <dt>{t("scouting.map.sunrise")}</dt>
                          <dd>{`${sun.rise.text} · ${Math.round(sun.rise.azimuth)}°`}</dd>
                        </>
                      )}
                      {sun.set && (
                        <>
                          <dt>{t("scouting.map.sunset")}</dt>
                          <dd>{`${sun.set.text} · ${Math.round(sun.set.azimuth)}°`}</dd>
                        </>
                      )}
                      {sun.golden && (
                        <>
                          <dt>{t("scouting.map.golden")}</dt>
                          <dd>
                            {sun.golden.morning}
                            <br />
                            {sun.golden.evening}
                          </dd>
                        </>
                      )}
                    </dl>
                  </section>
                )}
              </div>
            ) : (
              <div className="sc-panel-body">
                <p className="muted">{t("scouting.map.pickPin")}</p>
                <ul className="sc-unplaced">
                  {REAL_KINDS.flatMap((k) => s.locations.filter((l) => l.kind === k && l.lat === null)).map((l) => (
                    <li key={l.id}>
                      <button type="button" className="btn small" onClick={() => setPlacing(l.id)}>
                        <Crosshair aria-hidden="true" />
                        {l.name || t("scouting.unnamed")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </aside>
      )}
    </div>
  );
}

const empty = { type: "FeatureCollection" as const, features: [] };

function focusPoint(s: Scouting, focus: string | null) {
  const f = s.locations.find((l) => l.id === focus && l.lat !== null);
  const any = f ?? s.locations.find((l) => l.lat !== null);
  return any && any.lat !== null && any.lon !== null ? { lat: any.lat, lon: any.lon } : null;
}

function ToolButton({ icon: Icon, label, on, onClick }: { icon: ComponentType<{ "aria-hidden"?: boolean | "true" }>; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={on ? "on" : ""} aria-pressed={on} title={label} aria-label={label} onClick={onClick}>
      <Icon aria-hidden="true" />
    </button>
  );
}

/** A route already worked out reads without a connection; the button asks for one [REP-04, REP-04d]. */
function RouteRow({ mode, from, to, scouting: s, enabled, shown, onShow, onError }: { mode: RouteMode; from: RealLocation; to: RealLocation; scouting: Scouting; enabled: boolean; shown: boolean; onShow: () => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const known = s.routes.find((r) => r.from === from.id && r.to === to.id && r.mode === mode);
  const compute = async () => {
    setBusy(true);
    try {
      const r = unwrap(await commands.mapRoute([from.lon!, from.lat!], [to.lon!, to.lat!], mode));
      await saveRoute({ from: from.id, to: to.id, mode, distance: r.distanceM ?? 0, duration: r.durationS ?? 0, geometry: r.geometry.flatMap((p) => (p[0] !== null && p[1] !== null ? [[p[0], p[1]] as [number, number]] : [])) });
      if (!shown) onShow();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sc-route">
      <span>{t(`scouting.map.mode.${mode}`)}</span>
      {known ? (
        <button type="button" className={shown ? "btn text small on" : "btn text small"} aria-pressed={shown} title={t("scouting.map.showRoute")} onClick={onShow}>
          {formatDistance(known.distance)} · {formatDuration(known.duration)}
        </button>
      ) : (
        <button type="button" className="btn small" disabled={!enabled || busy} onClick={() => void compute()}>
          {busy ? t("scouting.map.computing") : t("scouting.map.compute")}
        </button>
      )}
    </div>
  );
}

function OverlayRow({ overlay: o, list, map, onError }: { overlay: MapOverlay; list: MapOverlay[]; map: GlMap | null; onError: (e: unknown) => void }) {
  const save = (patch: Partial<MapOverlay>) => void writeOverlays(list.map((x) => (x.id === o.id ? { ...x, ...patch } : x))).catch(onError);
  const fit = () => {
    if (!map) return;
    const b = map.getBounds();
    const bounds: Bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
    save({ bounds });
  };
  return (
    <div className="sc-overlay">
      <span className="sc-overlay-name" title={o.name}>
        {o.name}
      </span>
      <label className="pr-field">
        <span>{t("scouting.map.opacity")}</span>
        <input type="range" min={0.1} max={1} step={0.05} defaultValue={o.opacity} onChange={(e) => map?.getLayer(`ov-${o.id}`) && map.setPaintProperty(`ov-${o.id}`, "raster-opacity", Number(e.target.value))} onPointerUp={(e) => save({ opacity: Number(e.currentTarget.value) })} />
      </label>
      <div className="sc-panel-actions">
        <button type="button" className="btn small" title={t("scouting.map.fitHint")} onClick={fit}>
          {t("scouting.map.fit")}
        </button>
        <button type="button" className="btn ghost small" onClick={() => void writeOverlays(list.filter((x) => x.id !== o.id)).catch(onError)}>
          {t("common.removeAction")}
        </button>
      </div>
    </div>
  );
}

/** The areas kept for use without a connection [REP-04c]. */
function Zones({ map, enabled, onError, ask, prompt }: { map: GlMap | null; enabled: boolean; onError: (e: unknown) => void; ask: ReturnType<typeof useProject>["ask"]; prompt: ReturnType<typeof useProject>["prompt"] }) {
  const [state, setState] = useState<MapCacheState | null>(null);
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const refresh = useCallback(() => void commands.mapCacheState().then(unwrap).then(setState).catch(onError), []);
  useEffect(() => {
    refresh();
    const off = events.mapZoneProgress.listen((e) => {
      const p = e.payload;
      setProgress((old) => ({ ...old, [p.id]: { done: p.done, total: p.total } }));
      if (p.finished) refresh();
    });
    return () => void off.then((f) => f());
  }, []);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!map) return;
    const update = () => tick((n) => n + 1);
    map.on("moveend", update);
    return () => void map.off("moveend", update);
  }, [map]);
  const bounds = map?.getBounds();
  const area: Bounds | null = bounds ? { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } : null;
  const count = area ? zoneCount(area) : 0;
  const tooLarge = count > ZONE_MAX_TILES;
  const save = async () => {
    if (!area) return;
    const name = (await prompt(t("scouting.map.zoneNew"), t("scouting.map.zoneName")))?.trim();
    if (!name) return;
    try {
      unwrap(await commands.mapZoneSave(name, area.west, area.south, area.east, area.north));
      refresh();
    } catch (e) {
      onError(e);
    }
  };
  const remove = async (id: string, name: string) => {
    if (!(await confirmRemoval(ask, { title: t("scouting.map.zoneDelete", { name }), text: t("scouting.map.zoneDeleteText") }))) return;
    try {
      unwrap(await commands.mapZoneDelete(id));
      refresh();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="sc-panel-body">
      <p className="muted">{t("scouting.map.zonesText")}</p>
      <button type="button" className="btn" disabled={!enabled || tooLarge || !area} onClick={() => void save()}>
        <CloudDownload aria-hidden="true" />
        {t("scouting.map.zoneSave")}
      </button>
      <p className={tooLarge ? "sc-zone-size warn" : "sc-zone-size muted"}>{tooLarge ? t("scouting.map.zoneTooLarge") : plural("scouting.map.zoneTiles", count)}</p>
      {state?.zones.map((z) => {
        const p = progress[z.id];
        const going = p && p.done < p.total;
        return (
          <div key={z.id} className="sc-zone">
            <button type="button" className="btn text small" onClick={() => map?.fitBounds([[z.west ?? 0, z.south ?? 0], [z.east ?? 0, z.north ?? 0]])}>
              {z.name}
            </button>
            <span className="muted">{going ? `${Math.round((p.done / p.total) * 100)} %` : plural("scouting.map.zoneTiles", z.saved)}</span>
            <button type="button" className="icon-btn" aria-label={t("scouting.map.zoneDelete", { name: z.name })} onClick={() => void remove(z.id, z.name)}>
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
