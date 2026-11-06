//! The only door of Oniric to the network: the map of the scouting (architecture, section 10; REP-04b to REP-04e).
//! The interface cannot open a connection: it asks here, for a tile through the `oniric-tiles` protocol, for a search
//! or a route through a command. Nothing goes out when the map is off, nothing but the addresses of the settings is
//! contacted, always in HTTPS, and only the area shown, the words searched or the points of a route are sent.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::commands::CoreError;
use crate::system::{self, log};

type Result<T> = std::result::Result<T, CoreError>;

const SETTINGS: &str = "settings";
/// A tile older than this is fetched again when the map can connect; offline, it stays good.
const TILE_FRESH_SECS: u64 = 30 * 24 * 3600;
const TEMPLATE_FRESH_SECS: u64 = 24 * 3600;
const GEOCODE_EVERY: Duration = Duration::from_millis(1100);
/// Tiles kept beyond the saved zones; the oldest go first past this many.
const CACHE_TILES: i64 = 60_000;
const ZONE_FROM_ZOOM: u32 = 6;
const ZONE_TO_ZOOM: u32 = 14;
const ZONE_MAX_TILES: u64 = 4000;

#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct MapSettings {
    pub enabled: bool,
    pub tiles_url: String,
    pub fonts_url: String,
    pub geocode_url: String,
    pub car_url: String,
    pub foot_url: String,
    pub route_key_url: String,
    pub route_key: String,
}

impl Default for MapSettings {
    fn default() -> Self {
        MapSettings {
            // The first connection of the software is asked for, on the map itself.
            enabled: false,
            tiles_url: "https://tiles.openfreemap.org/planet".into(),
            fonts_url: "https://tiles.openfreemap.org/fonts".into(),
            geocode_url: "https://nominatim.openstreetmap.org/search".into(),
            car_url: "https://router.project-osrm.org/route/v1/driving".into(),
            foot_url: "https://routing.openstreetmap.de/routed-foot/route/v1/driving".into(),
            route_key_url: "https://api.openrouteservice.org/v2/directions".into(),
            route_key: String::new(),
        }
    }
}

#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GeoResult {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RouteResult {
    pub distance_m: f64,
    pub duration_s: f64,
    /// Longitude and latitude of each point.
    pub geometry: Vec<(f64, f64)>,
}

#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MapZone {
    pub id: String,
    pub name: String,
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
    pub tiles: u32,
    pub saved: u32,
    pub created_at: String,
}

#[derive(Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MapCacheState {
    pub bytes: f64,
    pub tiles: u32,
    pub zones: Vec<MapZone>,
}

/// Says the map is talking to the network, and whether the last attempt got through [REP-04e].
#[derive(Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct MapActivity {
    pub active: u32,
    pub offline: bool,
    pub enabled: bool,
}

#[derive(Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct MapZoneProgress {
    pub id: String,
    pub done: u32,
    pub total: u32,
    pub finished: bool,
}

pub struct MapNet {
    cache: Mutex<Connection>,
    last_geocode: Mutex<Option<Instant>>,
    template: Mutex<Option<(String, u64)>>,
    active: AtomicU32,
    offline: AtomicBool,
    agent: ureq::Agent,
}

fn open_cache(dir: &Path) -> rusqlite::Result<Connection> {
    std::fs::create_dir_all(dir).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let conn = Connection::open(dir.join("tuiles.db"))?;
    prepare_cache(&conn)?;
    Ok(conn)
}

fn prepare_cache(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS tile (z INTEGER, x INTEGER, y INTEGER, data BLOB NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY (z, x, y)) WITHOUT ROWID;
         CREATE INDEX IF NOT EXISTS tile_age ON tile (fetched_at);
         CREATE TABLE IF NOT EXISTS glyph (key TEXT PRIMARY KEY, data BLOB NOT NULL);
         CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS geocode (query TEXT PRIMARY KEY, value TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS zone (id TEXT PRIMARY KEY, name TEXT NOT NULL, west REAL, south REAL, east REAL, north REAL, tiles INTEGER NOT NULL, created_at TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS zone_tile (zone_id TEXT NOT NULL, z INTEGER, x INTEGER, y INTEGER, PRIMARY KEY (zone_id, z, x, y)) WITHOUT ROWID;",
    )
}

impl MapNet {
    pub fn new(dir: &Path, version: &str) -> MapNet {
        let conn = open_cache(dir).unwrap_or_else(|e| {
            log::error(&format!("cache de la carte indisponible : {e}"));
            let c = Connection::open_in_memory().expect("base en mémoire");
            let _ = prepare_cache(&c);
            c
        });
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(20)))
            .user_agent(format!("Oniric/{version} (logiciel libre de création de films)"))
            .https_only(true)
            .build()
            .into();
        MapNet {
            cache: Mutex::new(conn),
            last_geocode: Mutex::new(None),
            template: Mutex::new(None),
            active: AtomicU32::new(0),
            offline: AtomicBool::new(false),
            agent,
        }
    }

    pub fn settings(&self) -> MapSettings {
        let conn = self.cache.lock().unwrap();
        conn.query_row("SELECT value FROM kv WHERE key = ?1", [SETTINGS], |r| r.get::<_, String>(0))
            .optional()
            .ok()
            .flatten()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// One exchange with a service: counted for the indicator, and remembered as whether the network answers.
    fn exchange<T>(&self, app: &AppHandle, f: impl FnOnce() -> std::result::Result<T, ureq::Error>) -> std::result::Result<T, ureq::Error> {
        self.active.fetch_add(1, Ordering::SeqCst);
        self.tell(app);
        let out = f();
        self.active.fetch_sub(1, Ordering::SeqCst);
        // A refusal from the service is an answer: only a failure to reach it means the map is offline.
        let reached = !matches!(&out, Err(e) if !matches!(e, ureq::Error::StatusCode(_)));
        self.offline.store(!reached, Ordering::SeqCst);
        self.tell(app);
        out
    }

    fn tell(&self, app: &AppHandle) {
        let _ = MapActivity { active: self.active.load(Ordering::SeqCst), offline: self.offline.load(Ordering::SeqCst), enabled: self.settings().enabled }.emit(app);
    }

    fn get_bytes(&self, app: &AppHandle, url: &str) -> std::result::Result<Vec<u8>, ureq::Error> {
        self.exchange(app, || self.agent.get(url).call()?.body_mut().with_config().limit(16 << 20).read_to_vec())
    }

    fn get_text(&self, app: &AppHandle, url: &str) -> std::result::Result<String, ureq::Error> {
        self.exchange(app, || self.agent.get(url).call()?.body_mut().with_config().limit(32 << 20).read_to_string())
    }

    /// The address of the tiles: the service names its current edition; kept a day, and kept as long as it cannot be asked.
    fn tile_template(&self, app: &AppHandle, s: &MapSettings) -> Option<String> {
        let now = system::now_secs();
        if let Some((t, at)) = self.template.lock().unwrap().clone() {
            if now.saturating_sub(at) < TEMPLATE_FRESH_SECS {
                return Some(t);
            }
        }
        let kept = self.template.lock().unwrap().as_ref().map(|t| t.0.clone());
        let doc = self.get_text(app, &s.tiles_url).ok()?;
        let value: serde_json::Value = serde_json::from_str(&doc).ok()?;
        let found = value["tiles"][0].as_str().map(str::to_string).filter(|t| same_host(t, &s.tiles_url)).or(kept)?;
        *self.template.lock().unwrap() = Some((found.clone(), now));
        Some(found)
    }

    fn stored_tile(&self, z: u32, x: u32, y: u32) -> Option<(Vec<u8>, u64)> {
        let conn = self.cache.lock().unwrap();
        conn.query_row("SELECT data, fetched_at FROM tile WHERE z = ?1 AND x = ?2 AND y = ?3", params![z, x, y], |r| Ok((r.get(0)?, r.get::<_, i64>(1)? as u64)))
            .optional()
            .ok()
            .flatten()
    }

    fn store_tile(&self, z: u32, x: u32, y: u32, data: &[u8]) {
        let conn = self.cache.lock().unwrap();
        let _ = conn.execute(
            "INSERT INTO tile (z, x, y, data, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (z, x, y) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at",
            params![z, x, y, data, system::now_secs() as i64],
        );
    }

    /// Past the limit, the oldest tiles that no saved zone needs make room.
    fn trim(&self) {
        let conn = self.cache.lock().unwrap();
        let n: i64 = conn.query_row("SELECT count(*) FROM tile", [], |r| r.get(0)).unwrap_or(0);
        if n > CACHE_TILES {
            let _ = conn.execute(
                "DELETE FROM tile WHERE (z, x, y) IN (
                   SELECT z, x, y FROM tile t WHERE NOT EXISTS (SELECT 1 FROM zone_tile k WHERE k.z = t.z AND k.x = t.x AND k.y = t.y)
                   ORDER BY fetched_at LIMIT ?1)",
                [n - CACHE_TILES + 2000],
            );
        }
    }

    /// A tile from the cache when it is there, from the service otherwise; an old one rather than nothing.
    fn tile(&self, app: &AppHandle, z: u32, x: u32, y: u32) -> Option<Vec<u8>> {
        let stored = self.stored_tile(z, x, y);
        let fresh = stored.as_ref().is_some_and(|(_, at)| system::now_secs().saturating_sub(*at) < TILE_FRESH_SECS);
        if fresh {
            return stored.map(|s| s.0);
        }
        let settings = self.settings();
        if !settings.enabled {
            return stored.map(|s| s.0);
        }
        let got = self.tile_template(app, &settings).and_then(|t| {
            let url = t.replace("{z}", &z.to_string()).replace("{x}", &x.to_string()).replace("{y}", &y.to_string());
            self.get_bytes(app, &url).ok()
        });
        match got {
            Some(data) => {
                self.store_tile(z, x, y, &data);
                Some(data)
            }
            None => stored.map(|s| s.0),
        }
    }

    fn glyph(&self, app: &AppHandle, stack: &str, range: &str) -> Option<Vec<u8>> {
        // The Latin letters ship with the software: the names of the pins read even when the map has never connected.
        if let Some(data) = shipped_glyph(stack, range) {
            return Some(data.to_vec());
        }
        let key = format!("{stack}/{range}");
        let stored: Option<Vec<u8>> = {
            let conn = self.cache.lock().unwrap();
            conn.query_row("SELECT data FROM glyph WHERE key = ?1", [&key], |r| r.get(0)).optional().ok().flatten()
        };
        if stored.is_some() {
            return stored;
        }
        let settings = self.settings();
        if !settings.enabled {
            return None;
        }
        let url = format!("{}/{}/{range}", settings.fonts_url.trim_end_matches('/'), encode(stack));
        let data = self.get_bytes(app, &url).ok()?;
        let conn = self.cache.lock().unwrap();
        let _ = conn.execute("INSERT OR REPLACE INTO glyph (key, data) VALUES (?1, ?2)", params![key, data]);
        Some(data)
    }
}

fn shipped_glyph(stack: &str, range: &str) -> Option<&'static [u8]> {
    match (stack, range) {
        ("Noto Sans Regular", "0-255.pbf") => Some(include_bytes!("../map-fonts/regular-0-255.pbf")),
        ("Noto Sans Regular", "256-511.pbf") => Some(include_bytes!("../map-fonts/regular-256-511.pbf")),
        ("Noto Sans Bold", "0-255.pbf") => Some(include_bytes!("../map-fonts/bold-0-255.pbf")),
        ("Noto Sans Bold", "256-511.pbf") => Some(include_bytes!("../map-fonts/bold-256-511.pbf")),
        _ => None,
    }
}

fn host(url: &str) -> &str {
    url.strip_prefix("https://").unwrap_or("").split('/').next().unwrap_or("")
}

fn same_host(a: &str, b: &str) -> bool {
    !host(a).is_empty() && host(a) == host(b)
}

/// Percent-encodes what goes in an address.
pub fn encode(text: &str) -> String {
    let mut out = String::new();
    for b in text.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(n) = u8::from_str_radix(&text[i + 1..i + 3], 16) {
                out.push(n);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn refused(what: &str) -> CoreError {
    CoreError::Refused(what.into())
}

fn failed(e: ureq::Error) -> CoreError {
    log::error(&format!("carte : {e}"));
    CoreError::Refused(match e {
        ureq::Error::StatusCode(c) => format!("le service de la carte a répondu {c}"),
        _ => "le service de la carte ne répond pas : pas de connexion ?".into(),
    })
}

/// What `oniric-tiles://` answers: `/t/{z}/{x}/{y}` a tile, `/f/{stack}/{range}.pbf` the letters of the labels.
pub fn serve(app: &AppHandle, path: &str) -> tauri::http::Response<Vec<u8>> {
    let net = app.state::<MapNet>();
    let parts: Vec<&str> = path.trim_matches('/').split('/').collect();
    let body = match parts.as_slice() {
        ["t", z, x, y] => match (z.parse(), x.parse(), y.parse()) {
            (Ok(z), Ok(x), Ok(y)) => net.tile(app, z, x, y),
            _ => None,
        },
        ["f", stack, range] => net.glyph(app, &decode(stack), range),
        _ => None,
    };
    let builder = tauri::http::Response::builder().header("Access-Control-Allow-Origin", "*");
    match body {
        Some(data) => builder.status(200).header("Content-Type", "application/x-protobuf").body(data),
        None => builder.status(204).body(Vec::new()),
    }
    .unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub fn map_settings_get(net: State<'_, MapNet>) -> MapSettings {
    net.settings()
}

#[tauri::command]
#[specta::specta]
pub fn map_settings_set(app: AppHandle, net: State<'_, MapNet>, settings: MapSettings) -> Result<()> {
    for url in [&settings.tiles_url, &settings.fonts_url, &settings.geocode_url, &settings.car_url, &settings.foot_url, &settings.route_key_url] {
        if host(url).is_empty() {
            return Err(refused("une adresse de service doit commencer par https://"));
        }
    }
    let value = serde_json::to_string(&settings).map_err(|e| CoreError::Failed(e.to_string()))?;
    net.cache
        .lock()
        .unwrap()
        .execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?1, ?2)", params![SETTINGS, value])
        .map_err(|e| CoreError::Failed(e.to_string()))?;
    *net.template.lock().unwrap() = None;
    net.offline.store(false, Ordering::SeqCst);
    net.tell(&app);
    Ok(())
}

/// A search asked for by the user, one per second at most, its answer kept [REP-04b].
#[tauri::command]
#[specta::specta]
pub async fn map_geocode(app: AppHandle, query: String) -> Result<Vec<GeoResult>> {
    tauri::async_runtime::spawn_blocking(move || {
        let net = app.state::<MapNet>();
        let settings = net.settings();
        let query = query.trim().to_string();
        let key = query.to_lowercase();
        let kept: Option<String> = {
            let conn = net.cache.lock().unwrap();
            conn.query_row("SELECT value FROM geocode WHERE query = ?1", [&key], |r| r.get(0)).optional().ok().flatten()
        };
        let doc = match kept {
            Some(doc) => doc,
            None => {
                if !settings.enabled {
                    return Err(refused("la carte est coupée : elle ne cherche pas d'adresse"));
                }
                {
                    let mut last = net.last_geocode.lock().unwrap();
                    if let Some(t) = *last {
                        if let Some(wait) = GEOCODE_EVERY.checked_sub(t.elapsed()) {
                            std::thread::sleep(wait);
                        }
                    }
                    *last = Some(Instant::now());
                }
                let url = format!("{}?format=jsonv2&limit=6&q={}", settings.geocode_url, encode(&query));
                let doc = net.get_text(&app, &url).map_err(failed)?;
                let conn = net.cache.lock().unwrap();
                let _ = conn.execute("INSERT OR REPLACE INTO geocode (query, value) VALUES (?1, ?2)", params![key, doc]);
                doc
            }
        };
        let value: serde_json::Value = serde_json::from_str(&doc).map_err(|e| CoreError::Failed(e.to_string()))?;
        let number = |v: &serde_json::Value| v.as_str().and_then(|s| s.parse().ok());
        Ok(value
            .as_array()
            .map(|list| {
                list.iter()
                    .filter_map(|r| {
                        Some(GeoResult { name: r["display_name"].as_str()?.to_string(), lat: number(&r["lat"])?, lon: number(&r["lon"])? })
                    })
                    .collect()
            })
            .unwrap_or_default())
    })
    .await
    .map_err(|e| CoreError::Failed(e.to_string()))?
}

/// A route between two points: openrouteservice with the user's key, otherwise the free servers [REP-04b].
#[tauri::command]
#[specta::specta]
pub async fn map_route(app: AppHandle, from: (f64, f64), to: (f64, f64), mode: String) -> Result<RouteResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let net = app.state::<MapNet>();
        let s = net.settings();
        if !s.enabled {
            return Err(refused("la carte est coupée : elle ne calcule pas d'itinéraire"));
        }
        let foot = mode == "foot";
        let value: serde_json::Value = if s.route_key.is_empty() {
            let base = if foot { &s.foot_url } else { &s.car_url };
            let url = format!("{base}/{},{};{},{}?overview=full&geometries=geojson", from.0, from.1, to.0, to.1);
            serde_json::from_str(&net.get_text(&app, &url).map_err(failed)?).map_err(|e| CoreError::Failed(e.to_string()))?
        } else {
            let profile = if foot { "foot-walking" } else { "driving-car" };
            let url = format!("{}/{profile}/geojson", s.route_key_url.trim_end_matches('/'));
            let body = serde_json::json!({ "coordinates": [[from.0, from.1], [to.0, to.1]] }).to_string();
            let text = net
                .exchange(&app, || {
                    net.agent
                        .post(&url)
                        .header("Authorization", &s.route_key)
                        .header("Content-Type", "application/json")
                        .send(body.as_bytes())?
                        .body_mut()
                        .with_config()
                        .limit(32 << 20)
                        .read_to_string()
                })
                .map_err(failed)?;
            serde_json::from_str(&text).map_err(|e| CoreError::Failed(e.to_string()))?
        };
        route_of(&value).ok_or_else(|| refused("aucun itinéraire trouvé entre ces deux points"))
    })
    .await
    .map_err(|e| CoreError::Failed(e.to_string()))?
}

fn points(line: &serde_json::Value) -> Vec<(f64, f64)> {
    line.as_array()
        .map(|l| l.iter().filter_map(|p| Some((p[0].as_f64()?, p[1].as_f64()?))).collect())
        .unwrap_or_default()
}

/// Reads the answer of either kind of service.
fn route_of(v: &serde_json::Value) -> Option<RouteResult> {
    if let Some(r) = v["routes"].get(0) {
        return Some(RouteResult { distance_m: r["distance"].as_f64()?, duration_s: r["duration"].as_f64()?, geometry: points(&r["geometry"]["coordinates"]) });
    }
    let f = v["features"].get(0)?;
    let sum = &f["properties"]["summary"];
    Some(RouteResult { distance_m: sum["distance"].as_f64()?, duration_s: sum["duration"].as_f64()?, geometry: points(&f["geometry"]["coordinates"]) })
}

fn tile_of(lat: f64, lon: f64, z: u32) -> (u32, u32) {
    let n = 2f64.powi(z as i32);
    let r = lat.clamp(-85.05, 85.05).to_radians();
    let x = ((lon + 180.0) / 360.0 * n).floor().clamp(0.0, n - 1.0) as u32;
    let y = ((1.0 - (r.tan() + 1.0 / r.cos()).ln() / std::f64::consts::PI) / 2.0 * n).floor().clamp(0.0, n - 1.0) as u32;
    (x, y)
}

fn zone_list(west: f64, south: f64, east: f64, north: f64) -> Vec<(u32, u32, u32)> {
    let mut out = Vec::new();
    for z in ZONE_FROM_ZOOM..=ZONE_TO_ZOOM {
        let (x0, y0) = tile_of(north, west, z);
        let (x1, y1) = tile_of(south, east, z);
        for x in x0..=x1 {
            for y in y0..=y1 {
                out.push((z, x, y));
            }
        }
    }
    out
}

/// Keeps the tiles of an area for use without a connection, in the background; its size is limited, so as not to
/// overload the free services [REP-04c].
#[tauri::command]
#[specta::specta]
pub fn map_zone_save(app: AppHandle, net: State<'_, MapNet>, name: String, west: f64, south: f64, east: f64, north: f64) -> Result<String> {
    if !net.settings().enabled {
        return Err(refused("la carte est coupée : elle ne peut pas enregistrer de zone"));
    }
    let tiles = zone_list(west, south, east, north);
    if tiles.len() as u64 > ZONE_MAX_TILES {
        return Err(refused("cette zone est trop grande : rapprochez la carte"));
    }
    let id = format!("z{}", system::now_nanos());
    {
        let conn = net.cache.lock().unwrap();
        conn.execute(
            "INSERT INTO zone (id, name, west, south, east, north, tiles, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, name, west, south, east, north, tiles.len() as i64, system::iso_utc(system::now_secs())],
        )
        .map_err(|e| CoreError::Failed(e.to_string()))?;
    }
    let zone = id.clone();
    let total = tiles.len() as u32;
    std::thread::spawn(move || {
        let net = app.state::<MapNet>();
        // The labels of the area, so that they still read offline.
        for stack in ["Noto Sans Regular", "Noto Sans Bold"] {
            for range in ["8192-8447.pbf"] {
                let _ = net.glyph(&app, stack, range);
            }
        }
        let mut done = 0;
        for (z, x, y) in tiles {
            if net.tile(&app, z, x, y).is_some() {
                let conn = net.cache.lock().unwrap();
                let _ = conn.execute("INSERT OR IGNORE INTO zone_tile (zone_id, z, x, y) VALUES (?1, ?2, ?3, ?4)", params![zone, z, x, y]);
            }
            done += 1;
            if done % 16 == 0 {
                let _ = MapZoneProgress { id: zone.clone(), done, total, finished: false }.emit(&app);
            }
        }
        let _ = MapZoneProgress { id: zone.clone(), done, total, finished: true }.emit(&app);
        net.trim();
    });
    Ok(id)
}

#[tauri::command]
#[specta::specta]
pub fn map_zone_delete(net: State<'_, MapNet>, id: String) -> Result<()> {
    let conn = net.cache.lock().unwrap();
    conn.execute("DELETE FROM zone_tile WHERE zone_id = ?1", [&id]).map_err(|e| CoreError::Failed(e.to_string()))?;
    conn.execute("DELETE FROM zone WHERE id = ?1", [&id]).map_err(|e| CoreError::Failed(e.to_string()))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn map_cache_state(net: State<'_, MapNet>) -> Result<MapCacheState> {
    net.trim();
    let conn = net.cache.lock().unwrap();
    let fail = |e: rusqlite::Error| CoreError::Failed(e.to_string());
    let (tiles, bytes): (i64, f64) = conn
        .query_row("SELECT count(*), coalesce(sum(length(data)), 0) FROM tile", [], |r| Ok((r.get(0)?, r.get::<_, i64>(1)? as f64)))
        .map_err(fail)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, west, south, east, north, tiles, created_at, (SELECT count(*) FROM zone_tile k WHERE k.zone_id = zone.id)
             FROM zone ORDER BY created_at DESC",
        )
        .map_err(fail)?;
    let zones = stmt
        .query_map([], |r| {
            Ok(MapZone {
                id: r.get(0)?,
                name: r.get(1)?,
                west: r.get(2)?,
                south: r.get(3)?,
                east: r.get(4)?,
                north: r.get(5)?,
                tiles: r.get::<_, i64>(6)? as u32,
                created_at: r.get(7)?,
                saved: r.get::<_, i64>(8)? as u32,
            })
        })
        .map_err(fail)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(fail)?;
    Ok(MapCacheState { bytes, tiles: tiles as u32, zones })
}

/// Empties the tiles kept, but those of the saved zones.
#[tauri::command]
#[specta::specta]
pub fn map_cache_clear(net: State<'_, MapNet>) -> Result<()> {
    let conn = net.cache.lock().unwrap();
    conn.execute("DELETE FROM tile WHERE NOT EXISTS (SELECT 1 FROM zone_tile k WHERE k.z = tile.z AND k.x = tile.x AND k.y = tile.y)", [])
        .map_err(|e| CoreError::Failed(e.to_string()))?;
    conn.execute("DELETE FROM geocode", []).map_err(|e| CoreError::Failed(e.to_string()))?;
    let _ = conn.execute_batch("VACUUM");
    Ok(())
}
