import { open } from "@tauri-apps/plugin-dialog";
import { Building2, ImagePlus, Map as MapIcon, MapPin, Plus, Trash2, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import type { RealKind, RealStatus } from "../../../core/db/schema";
import { describeError } from "../../../core/errors";
import { numberFormat, plural, t } from "../../../core/i18n";
import { confirmRemoval } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { MoreMenu } from "../../../ui-kit/MoreMenu";
import { SearchBox } from "../../../ui-kit/SearchBox";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { PAGE_KEY, useProject } from "../../project/ui/projectContext";
import { loadEntries, type Entry } from "../../script/bible/application/bible";
import { fold } from "../../script/bible/domain/types";
import { MediaImage } from "../../shared/media";
import { usePermits } from "../application/permits";
import {
  addLocation,
  addVisit,
  deleteLocation,
  deleteVisit,
  linkEntry,
  unlinkEntry,
  updateLocation,
  updateVisit,
  useCriteria,
  useScouting,
  writeCriteria,
  type Criterion,
  type RealLocation,
  type Scouting,
  type Visit,
} from "../application/scouting";
import { permitTone } from "../domain/permits";
import { exifPosition, formatDistance, formatDuration, haversine, meanScore, REAL_KINDS, REAL_STATUSES, type LocationData } from "../domain/scouting";
import { readNumber } from "./BudgetView";
import { Field, Section, shortDate } from "./parts";
import { money } from "./preparation";

const ScoutingMap = lazy(() => import("./ScoutingMap"));

type Tab = "sets" | "map" | "compare";

export const statusTone: Record<RealStatus, string> = { lead: "", visited: "warn", kept: "ok", booked: "ok", refused: "bad" };

export function StatusBadge({ status }: { status: RealStatus }) {
  return <span className={`badge ${statusTone[status]} sc-status`}>{t(`scouting.statuses.${status}`)}</span>;
}

function useFail() {
  const { notify } = useProject();
  return (e: unknown) => notify({ text: describeError(e), tone: "error" });
}

/** The real places of the film, on cards, on the map, side by side [REP-01 to REP-07]. */
export function ScoutingView({ home }: { home: number }) {
  const [tab, setTab] = useStoredState<Tab>(PAGE_KEY.scouting, "sets");
  const s = useScouting();
  const entries = useLive(loadEntries, ["bible_entry"]);
  const [opened, setOpened] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [lastHome, setLastHome] = useState(home);
  if (home !== lastHome) {
    setLastHome(home);
    setOpened(null);
  }
  if (!s || !entries) return null;
  const places = entries.filter((e) => e.type === "location");
  if (tab === "map")
    return (
      <Suspense fallback={null}>
        <ScoutingMap
          scouting={s}
          focus={focus}
          onOpen={(id) => {
            setOpened(id);
            setTab("sets");
          }}
        />
      </Suspense>
    );
  if (tab === "compare") return <Compare scouting={s} onOpen={(id) => { setOpened(id); setTab("sets"); }} />;
  const location = s.locations.find((l) => l.id === opened);
  if (location)
    return (
      <LocationPage
        key={location.id}
        scouting={s}
        location={location}
        places={places}
        onBack={() => setOpened(null)}
        onMap={() => {
          setFocus(location.id);
          setTab("map");
        }}
      />
    );
  return <Sets scouting={s} places={places} onOpen={setOpened} />;
}

/** The cover of a place: its first photo, or the icon of what it is. */
function Cover({ location }: { location: RealLocation }) {
  const photo = location.data.photos[0];
  return (
    <span className="sc-cover">
      {photo ? <MediaImage path={photo} alt="" /> : location.kind === "set" ? <Building2 aria-hidden="true" /> : <MapPin aria-hidden="true" />}
    </span>
  );
}

function Sets({ scouting: s, places, onOpen }: { scouting: Scouting; places: Entry[]; onOpen: (id: string) => void }) {
  const { prompt, notify } = useProject();
  const [q, setQ] = useStoredState<string>("oniric.scouting.q", "");
  const nameOf = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);
  const hit = (l: RealLocation) => !q || fold([l.name, l.address, l.data.type, ...l.entries.map((e) => nameOf.get(e) ?? "")].join(" ")).includes(fold(q));
  const add = async () => {
    const name = (await prompt(t("scouting.newLocation"), t("scouting.name")))?.trim();
    if (!name) return;
    try {
      onOpen(await addLocation(s, { name }));
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  const groups = REAL_KINDS.map((k) => ({ kind: k, list: s.locations.filter((l) => l.kind === k && hit(l)) })).filter((g) => g.list.length);
  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div className="bible-toolbar">
          {s.locations.length > 0 && <SearchBox value={q} onChange={setQ} placeholder={t("scouting.search")} label={t("scouting.search")} />}
          <button type="button" className="btn primary bu-push" onClick={() => void add()}>
            <Plus aria-hidden="true" />
            {t("scouting.newLocation")}
          </button>
        </div>
        {s.locations.length === 0 ? (
          <EmptyState title={t("scouting.emptyTitle")}>
            <p className="muted">{t("scouting.emptyText")}</p>
          </EmptyState>
        ) : groups.length === 0 ? (
          <p className="muted pr-none" role="status">
            {t("scouting.noMatch")}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.kind} className="sc-group" aria-label={t(`scouting.kindsPlural.${g.kind}`)}>
              <h2>
                {t(`scouting.kindsPlural.${g.kind}`)} <span className="muted">{numberFormat().format(g.list.length)}</span>
              </h2>
              <ul className="sc-cards">
                {g.list.map((l) => (
                  <li key={l.id} className="sc-card">
                    <Cover location={l} />
                    <div className="sc-card-text">
                      <h3>
                        <button type="button" className="entry-card-open" data-entry={l.id} onClick={() => onOpen(l.id)}>
                          {l.name || t("scouting.unnamed")}
                        </button>
                      </h3>
                      {l.address && <p className="muted">{l.address}</p>}
                      {l.entries.length > 0 && <p className="sc-plays">{t("scouting.plays", { names: l.entries.map((e) => nameOf.get(e)).filter(Boolean).join(", ") })}</p>}
                    </div>
                    {l.kind === "set" && <StatusBadge status={l.status} />}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

/** Fills a place with the position of the first photo that carries one [REP-03]. */
async function positionOfPhoto(path: string): Promise<{ lat: number; lon: number } | null> {
  const url = unwrap(await commands.mediaRead(path));
  const bytes = Uint8Array.from(atob(url.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0));
  return exifPosition(bytes);
}

/** The card of a real place, in a page as a contact's [REP-01, REP-02, REP-06]. */
function LocationPage({ scouting: s, location: l, places, onBack, onMap }: { scouting: Scouting; location: RealLocation; places: Entry[]; onBack: () => void; onMap: () => void }) {
  const { ask, notify, setTrail, go } = useProject();
  const fail = useFail();
  const permits = usePermits();
  const d = l.data;
  const setData = (p: Partial<LocationData>) => void updateLocation(l.id, { data: { ...d, ...p } }).catch(fail);
  useEffect(() => {
    setTrail([{ label: t("scouting.sets"), onClick: onBack }, { label: l.name || t("scouting.unnamed") }]);
    return () => setTrail(null);
  }, [l.name, setTrail]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, dialog, [role=dialog], [role=menu]")) return;
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const addPhotos = async () => {
    try {
      const chosen = await open({ title: t("media.choose"), multiple: true, filters: [{ name: t("media.images"), extensions: ["jpg", "jpeg", "png", "webp"] }] });
      const files = chosen === null ? [] : Array.isArray(chosen) ? chosen : [chosen];
      const added: string[] = [];
      for (const f of files) added.push(unwrap(await commands.mediaImport(f, "reperages")));
      if (!added.length) return;
      const patch: Parameters<typeof updateLocation>[1] = { data: { ...d, photos: [...d.photos, ...added] } };
      if (l.lat === null || l.lon === null) {
        for (const p of added) {
          const at = await positionOfPhoto(p).catch(() => null);
          if (at) {
            patch.lat = at.lat;
            patch.lon = at.lon;
            notify({ text: t("scouting.placedFromPhoto"), actions: [{ label: t("scouting.seeOnMap"), onClick: onMap }] });
            break;
          }
        }
      }
      await updateLocation(l.id, patch);
    } catch (e) {
      fail(e);
    }
  };
  const remove = async () => {
    if (await confirmRemoval(ask, { title: t("scouting.deleteTitle", { name: l.name || t("scouting.unnamed") }), text: t("scouting.deleteText") })) {
      onBack();
      await deleteLocation(l.id).catch(fail);
    }
  };
  const short = (key: keyof LocationData, wide = false) => (
    <Field key={key} label={t(`scouting.fields.${key}`)} multiline className={wide ? "wide" : ""} value={String(d[key] ?? "")} placeholder="–" onCommit={(v) => setData({ [key]: v } as Partial<LocationData>)} />
  );
  const linked = places.filter((p) => l.entries.includes(p.id));
  const free = places.filter((p) => !l.entries.includes(p.id));
  const visits = s.visits.filter((v) => v.locationId === l.id);
  const own = permits?.permits.filter((p) => p.locationId === l.id) ?? [];
  const base = s.locations.find((x) => x.kind === "base" && x.lat !== null && x.id !== l.id);
  const crow = base && l.lat !== null && l.lon !== null ? haversine({ lat: l.lat, lon: l.lon }, { lat: base.lat!, lon: base.lon! }) : null;
  const route = base ? s.routes.find((r) => r.from === base.id && r.to === l.id && r.mode === "car") : undefined;
  return (
    <div className="view pr-view">
      <main className="view-main wide sc-page">
        <header className="sc-page-head">
          <Field label={t("scouting.name")} hideLabel className="sc-page-name" value={l.name} placeholder={t("scouting.name")} onCommit={(v) => void updateLocation(l.id, { name: v }).catch(fail)} />
          <Select value={l.kind} aria-label={t("scouting.kind")} onChange={(e) => void updateLocation(l.id, { kind: e.target.value as RealKind }).catch(fail)}>
            {REAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`scouting.kinds.${k}`)}
              </option>
            ))}
          </Select>
          {l.kind === "set" && (
            <Select value={l.status} aria-label={t("scouting.status")} onChange={(e) => void updateLocation(l.id, { status: e.target.value as RealStatus }).catch(fail)}>
              {REAL_STATUSES.map((k) => (
                <option key={k} value={k}>
                  {t(`scouting.statuses.${k}`)}
                </option>
              ))}
            </Select>
          )}
          <button type="button" className="btn destructive bu-push" onClick={() => void remove()}>
            <Trash2 aria-hidden="true" />
            {t("common.delete")}
          </button>
        </header>

        <Section title={t("scouting.where")}>
          <div className="pr-form sc-form">
            <Field label={t("scouting.address")} multiline className="wide" value={l.address} placeholder="–" onCommit={(v) => void updateLocation(l.id, { address: v }).catch(fail)} />
            <Field label={t("scouting.latitude")} value={l.lat === null ? "" : String(l.lat)} placeholder="48,8566" onCommit={(v) => void updateLocation(l.id, { lat: v.trim() ? readNumber(v) : null }).catch(fail)} />
            <Field label={t("scouting.longitude")} value={l.lon === null ? "" : String(l.lon)} placeholder="2,3522" onCommit={(v) => void updateLocation(l.id, { lon: v.trim() ? readNumber(v) : null }).catch(fail)} />
          </div>
          <div className="sc-where">
            <button type="button" className="btn" onClick={onMap}>
              <MapIcon aria-hidden="true" />
              {l.lat !== null ? t("scouting.seeOnMap") : t("scouting.placeOnMap")}
            </button>
            {crow !== null && (
              <span className="muted">
                {route ? t("scouting.fromBaseRoute", { distance: formatDistance(route.distance), time: formatDuration(route.duration) }) : t("scouting.fromBase", { distance: formatDistance(crow) })}
              </span>
            )}
          </div>
        </Section>

        <Section
          title={t("scouting.photos")}
          aside={
            <button type="button" className="btn small" onClick={() => void addPhotos()}>
              <ImagePlus aria-hidden="true" />
              {t("scouting.addPhotos")}
            </button>
          }
        >
          {d.photos.length === 0 ? (
            <p className="muted">{t("scouting.noPhotos")}</p>
          ) : (
            <ul className="sc-photos">
              {d.photos.map((p, i) => (
                <li key={p}>
                  <MediaImage path={p} alt={t("scouting.photoOf", { n: i + 1, name: l.name })} />
                  <button type="button" className="sc-photo-x" aria-label={t("scouting.removePhoto")} onClick={() => void confirmRemoval(ask, { title: t("scouting.removePhotoTitle"), text: t("scouting.removePhotoText"), label: t("common.removeAction") }).then((y) => {
                    if (y) setData({ photos: d.photos.filter((x) => x !== p) });
                  })}>
                    <X aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {l.kind === "set" && (
          <Section title={t("scouting.storyPlaces")}>
            <div className="sc-links">
              {linked.map((p) => (
                <span key={p.id} className="chip">
                  {p.name}
                  <button type="button" className="icon-btn" aria-label={t("scouting.unlink", { name: p.name })} onClick={() => void unlinkEntry(l.id, p.id).catch(fail)}>
                    <X aria-hidden="true" />
                  </button>
                </span>
              ))}
              {free.length > 0 ? (
                <Select value="" aria-label={t("scouting.linkPlace")} onChange={(e) => void linkEntry(l.id, e.target.value).catch(fail)}>
                  <option value="" hidden>
                    {t("scouting.linkPlace")}
                  </option>
                  {free.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              ) : (
                places.length === 0 && <p className="muted">{t("scouting.noPlaces")}</p>
              )}
            </div>
          </Section>
        )}

        <Section title={t("scouting.owner")}>
          <div className="pr-form sc-form">
            <Field label={t("scouting.fields.type")} value={d.type} placeholder="–" onCommit={(v) => setData({ type: v })} />
            <Field label={t("scouting.fields.ownerName")} value={d.ownerName} placeholder="–" onCommit={(v) => setData({ ownerName: v })} />
            <Field label={t("scouting.fields.ownerContact")} value={d.ownerContact} placeholder="–" onCommit={(v) => setData({ ownerContact: v })} />
            <Field label={t("scouting.fields.rental")} value={d.rental === null ? "" : String(d.rental).replace(".", ",")} placeholder="–" title={t("scouting.rentalHint")} onCommit={(v) => setData({ rental: v.trim() ? readNumber(v) : null })} />
          </div>
        </Section>

        <Section title={t("scouting.onSite")}>
          <div className="pr-form sc-form">
            {short("orientation")}
            {short("access")}
            {short("parking")}
            {short("power")}
            {short("toilets")}
            {short("network")}
            {short("noise")}
            {short("constraints")}
            {short("hospital")}
            {short("pharmacy")}
            {short("notes", true)}
          </div>
        </Section>

        {l.kind === "set" && (
          <Section title={t("scouting.permits")}>
            {own.length > 0 && (
              <ul className="sc-permit-list">
                {own.map((p) => (
                  <li key={p.id}>
                    <span className={`badge ${permitTone[p.status]}`}>{t(`permits.statuses.${p.status}`)}</span>
                    {t(`permits.kinds.${p.kind}`)}
                  </li>
                ))}
              </ul>
            )}
            <label className="switch-line">
              <input type="checkbox" checked={d.noPermit} onChange={(e) => setData({ noPermit: e.target.checked })} />
              {t("scouting.noPermit")}
            </label>
            <button type="button" className="btn text small" onClick={() => go("permits")}>
              {t("scouting.toPermits")}
            </button>
          </Section>
        )}

        <Section
          title={t("scouting.visits")}
          aside={
            <button type="button" className="btn small" onClick={() => void addVisit(l.id).catch(fail)}>
              <Plus aria-hidden="true" />
              {t("scouting.addVisit")}
            </button>
          }
        >
          {visits.length === 0 ? (
            <p className="muted">{t("scouting.noVisits")}</p>
          ) : (
            <ul className="sc-visits">
              {visits.map((v) => (
                <VisitCard key={v.id} visit={v} />
              ))}
            </ul>
          )}
        </Section>

        {d.capture && (
          <Section title={t("scouting.capture")}>
            <MediaImage path={d.capture} alt={t("scouting.capture")} className="sc-capture" />
          </Section>
        )}
      </main>
    </div>
  );
}

function VisitCard({ visit: v }: { visit: Visit }) {
  const { ask } = useProject();
  const fail = useFail();
  const addPhoto = async () => {
    try {
      const chosen = await open({ title: t("media.choose"), multiple: true, filters: [{ name: t("media.images"), extensions: ["jpg", "jpeg", "png", "webp"] }] });
      const files = chosen === null ? [] : Array.isArray(chosen) ? chosen : [chosen];
      const added: string[] = [];
      for (const f of files) added.push(unwrap(await commands.mediaImport(f, "reperages")));
      if (added.length) await updateVisit(v, { photos: [...v.photos, ...added] });
    } catch (e) {
      fail(e);
    }
  };
  return (
    <li className="sc-visit">
      <div className="sc-visit-head">
        <Field label={t("scouting.visitDate")} hideLabel type="date" value={v.date ?? ""} onCommit={(x) => void updateVisit(v, { date: x || null }).catch(fail)} />
        <Field label={t("scouting.participants")} hideLabel value={v.participants} placeholder={t("scouting.participants")} onCommit={(x) => void updateVisit(v, { participants: x }).catch(fail)} />
        <MoreMenu
          label={t("scouting.visitMenu")}
          items={[
            { label: t("scouting.addPhotos"), icon: ImagePlus, onClick: () => void addPhoto() },
            {
              label: t("scouting.deleteVisit"),
              icon: Trash2,
              danger: true,
              onClick: () => void confirmRemoval(ask, { title: t("scouting.deleteVisitTitle", { date: v.date ? shortDate(v.date) : "" }), text: t("scouting.deleteVisitText") }).then((y) => {
                if (y) void deleteVisit(v.id).catch(fail);
              }),
            },
          ]}
        />
      </div>
      <Field label={t("scouting.report")} hideLabel multiline value={v.report} placeholder={t("scouting.report")} onCommit={(x) => void updateVisit(v, { report: x }).catch(fail)} />
      {v.photos.length > 0 && (
        <ul className="sc-photos small">
          {v.photos.map((p) => (
            <li key={p}>
              <MediaImage path={p} alt="" />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A mark out of five, as five notches: pressing the one given again takes it back. The pointer previews the mark it
 * would give; `lead` sets the notches in ink when this is the best mark of its row.
 */
function Meter({ value, label, lead, onChange }: { value: number; label: string; lead: boolean; onChange: (n: number) => void }) {
  return (
    <span className={`sc-meter${lead ? " lead" : ""}`} role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={t("scouting.stars", { n })} className={n <= value ? "on" : ""} onClick={() => onChange(value === n ? 0 : n)}>
          <i />
        </button>
      ))}
    </span>
  );
}

const criterionName = (c: Criterion) => c.name || t(`scouting.criteria.${c.id}`, { defaultValue: c.id });

/** The ids whose value is the best of the row, the lowest when `low`; none when fewer than two compete or all tie. */
function leaders(values: [string, number | null][], low = false): Set<string> {
  const given = values.filter((v): v is [string, number] => v[1] !== null && (low || v[1] > 0));
  if (given.length < 2) return new Set();
  const best = low ? Math.min(...given.map((v) => v[1])) : Math.max(...given.map((v) => v[1]));
  const won = given.filter((v) => v[1] === best);
  return won.length === given.length ? new Set() : new Set(won.map((v) => v[0]));
}

/**
 * The leads for one place of the story, side by side [REP-05]. The table points at the answer: each lead's mean under
 * its photo, « Meilleure note » on the best, and in every row the best value in ink, the others in grey.
 */
function Compare({ scouting: s, onOpen }: { scouting: Scouting; onOpen: (id: string) => void }) {
  const { prompt } = useProject();
  const fail = useFail();
  const criteria = useCriteria();
  const sets = s.locations.filter((l) => l.kind === "set");
  const shown = sets;
  if (!criteria) return null;
  if (sets.length === 0)
    return (
      <div className="view view-pad">
        <EmptyState title={t("scouting.compareEmptyTitle")}>
          <p className="muted">{t("scouting.compareEmptyText")}</p>
        </EmptyState>
      </div>
    );
  const ids = criteria.map((c) => c.id);
  const base = s.locations.find((x) => x.kind === "base" && x.lat !== null);
  const addCriterion = async () => {
    const name = (await prompt(t("scouting.addCriterion"), t("scouting.criterionName")))?.trim();
    if (name) await writeCriteria([...criteria, { id: `c${Date.now()}`, name }]).catch(fail);
  };
  const means = new Map(shown.map((l) => [l.id, meanScore(l.data.scores, ids)]));
  const best = leaders(shown.map((l) => [l.id, means.get(l.id) ?? null]));
  const cheapest = leaders(shown.map((l) => [l.id, l.data.rental]), true);
  // By road when the route is known, as the crow flies otherwise; the crow's metres only compete among themselves.
  const trip = new Map(
    shown.map((l) => {
      const r = base && s.routes.find((x) => x.from === base.id && x.to === l.id && x.mode === "car");
      const crow = base && l.lat !== null ? haversine({ lat: l.lat, lon: l.lon! }, { lat: base.lat!, lon: base.lon! }) : null;
      return [l.id, { road: r || null, crow }] as const;
    }),
  );
  const byRoad = shown.some((l) => trip.get(l.id)!.road);
  const closest = leaders(shown.map((l) => { const x = trip.get(l.id)!; return [l.id, byRoad ? (x.road?.duration ?? null) : x.crow]; }), true);
  const visits = new Map(shown.map((l) => [l.id, s.visits.filter((v) => v.locationId === l.id).length]));
  const one = numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const cell = (on: boolean) => (on ? "lead" : undefined);
  return (
    <div className="view pr-view sc-compare-view">
      <div className="sc-compare-scroll">
        <table className="sc-compare" style={{ minWidth: 208 + shown.length * 168 }}>
          <colgroup>
            <col className="sc-compare-labels" />
            {shown.map((l) => (
              <col key={l.id} className={best.has(l.id) ? "best" : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <td />
              {shown.map((l) => {
                const m = means.get(l.id) ?? null;
                return (
                  <th key={l.id} scope="col">
                    <button type="button" className="sc-compare-lead" onClick={() => onOpen(l.id)}>
                      <span className="sc-compare-cover">
                        <Cover location={l} />
                        {best.has(l.id) && <span className="badge ok sc-best">{t("scouting.bestScore")}</span>}
                      </span>
                      <span className="sc-compare-name">{l.name || t("scouting.unnamed")}</span>
                    </button>
                    <StatusBadge status={l.status} />
                    <span className="sc-score" aria-label={m === null ? undefined : t("scouting.meanOutOf", { n: one.format(m) })}>
                      <b aria-hidden="true">{m === null ? "–" : one.format(m)}</b>
                      <span aria-hidden="true">/ 5</span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => {
              const lead = leaders(shown.map((l) => [l.id, l.data.scores[c.id] ?? 0]));
              return (
                <tr key={c.id}>
                  <th scope="row">
                    <span className="sc-criterion">
                      {criterionName(c)}
                      <button type="button" className="icon-btn" aria-label={t("scouting.removeCriterion", { name: criterionName(c) })} onClick={() => void writeCriteria(criteria.filter((x) => x.id !== c.id)).catch(fail)}>
                        <X aria-hidden="true" />
                      </button>
                    </span>
                  </th>
                  {shown.map((l) => (
                    <td key={l.id}>
                      <Meter value={l.data.scores[c.id] ?? 0} lead={lead.has(l.id)} label={`${l.name} · ${criterionName(c)}`} onChange={(n) => void updateLocation(l.id, { data: { ...l.data, scores: { ...l.data.scores, [c.id]: n } } }).catch(fail)} />
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr className="sc-add-row">
              <th scope="row" colSpan={shown.length + 1}>
                <button type="button" className="btn text small" onClick={() => void addCriterion()}>
                  <Plus aria-hidden="true" />
                  {t("scouting.addCriterion")}
                </button>
              </th>
            </tr>
            <tr className="sc-facts-start">
              <th scope="row">{t("scouting.fields.rental")}</th>
              {shown.map((l) => (
                <td key={l.id} className={cell(cheapest.has(l.id))}>
                  {l.data.rental === null ? <span className="muted">–</span> : money(l.data.rental)}
                </td>
              ))}
            </tr>
            {base && (
              <tr>
                <th scope="row">{t("scouting.fromBaseShort")}</th>
                {shown.map((l) => {
                  const x = trip.get(l.id)!;
                  return (
                    <td key={l.id} className={cell(closest.has(l.id))}>
                      {x.road ? `${formatDistance(x.road.distance)} · ${formatDuration(x.road.duration)}` : x.crow !== null ? formatDistance(x.crow) : <span className="muted">–</span>}
                    </td>
                  );
                })}
              </tr>
            )}
            <tr>
              <th scope="row">{t("scouting.visits")}</th>
              {shown.map((l) => (
                <td key={l.id} className={visits.get(l.id) ? undefined : "muted"}>
                  {plural("scouting.visitCount", visits.get(l.id)!)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
