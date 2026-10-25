import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLive } from "../../../../core/db/live";
import { Segmented } from "../../../../ui-kit/Segmented";
import { useProject } from "../../../project/ui/projectContext";
import { loadEntries } from "../../bible/application/bible";
import { prettyName } from "../../bible/domain/appearances";
import { useScenes, useSessionState } from "../../screenplay/application/scriptSession";
import { listVersions } from "../../screenplay/application/versions";
import { formatEighths, formatMinutes } from "../../screenplay/domain/duration";
import type { ElementType } from "../../screenplay/domain/formats";
import { characterName } from "../../screenplay/ui/editor/schema";
import { loadStory, SCENE_STATUSES, STORY_TABLES } from "../../views/application/story";
import { sceneLabel } from "../../views/domain/outline";
import { readJournal } from "../application/journal";
import {
  characterStats,
  dayKey,
  headingShares,
  percents,
  periodDays,
  placeStats,
  WORD_GROUPS,
  wordCounts,
  type Share,
  type StatScene,
} from "../domain/stats";

const num = new Intl.NumberFormat("fr-FR");
const pct = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const longDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const versionDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** « 19–25 oct. 2026 », or across months « 28 sept. – 4 oct. 2026 ». */
function rangeLabel(days: Date[]): string {
  const a = days[0];
  const b = days[days.length - 1];
  const year = b.getFullYear();
  if (a.getMonth() === b.getMonth() && a.getFullYear() === year) return `${a.getDate()}–${shortDay.format(b)} ${year}`;
  return `${shortDay.format(a)} – ${shortDay.format(b)} ${year}`;
}

const shareLabel = (p: number) => (p > 0 && p < 0.1 ? "< 0,1 %" : `${pct.format(p)} %`);

function formatTime(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** The width of an element, followed as it changes. */
function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

/** A round step above `max` for the top of an axis: 10, 25, 50, 100, 250… */
function niceMax(max: number): number {
  if (max <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= max) ?? 10 * p);
}

/** Counts and shares of the screenplay, its characters and places, and the writing of the last days. */
export function StatsView() {
  const { session } = useProject();
  useSessionState(session);
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const entries = useLive(async () => (await loadEntries()).filter((e) => !e.archivedAt).length, ["bible_entry"]);

  const statScenes = useMemo(
    (): StatScene[] =>
      scenes.map((s) => {
        const blocks: StatScene["blocks"] = [];
        s.node.forEach((b) => blocks.push({ type: b.type.name as ElementType, text: b.textContent }));
        return { id: s.id, index: s.index, heading: s.heading, eighths: s.eighths, blocks };
      }),
    [scenes],
  );
  const words = useMemo(() => wordCounts(statScenes.flatMap((s) => s.blocks)), [statScenes]);
  const characters = useMemo(() => characterStats(statScenes, characterName), [statScenes]);
  const places = useMemo(() => placeStats(statScenes), [statScenes]);

  const snap = session.snapshot;
  const pages = snap?.pagination.pages ?? [];
  const exactPages = pages.length === 0 ? 0 : pages.length - 1 + pages[pages.length - 1].usedRows / (snap?.pagination.linesPerPage ?? 1);
  const totalWords = words.action + words.dialogue + words.other;

  return (
    <div className="view view-main stats-view">
      <section className="stats-section" aria-labelledby="stats-overview">
        <h2 id="stats-overview">Aperçu</h2>
        <div className="stats-card stats-tiles">
          <Tile label="Pages" value={num.format(pages.length)} />
          <Tile label="Durée estimée" value={formatMinutes(exactPages)} />
          <Tile label="Scènes" value={num.format(scenes.length)} />
          <Tile label="Mots" value={num.format(totalWords)} />
          <Tile label="Personnages qui parlent" value={num.format(characters.length)} />
          <Tile label="Fiches de la Bible" value={entries === undefined ? "…" : num.format(entries)} />
        </div>
        {story && scenes.length > 0 && (
          <Progress counts={SCENE_STATUSES.map((st) => scenes.filter((s) => story.meta.get(s.id)?.status === st.id).length)} total={scenes.length} />
        )}
      </section>

      <WritingHistory />

      <section className="stats-section" aria-labelledby="stats-words">
        <h2 id="stats-words">Répartition du texte</h2>
        <p className="stats-lead">Les mots du scénario selon le type d'élément.</p>
        <div className="stats-card stats-split">
          <SplitBar values={WORD_GROUPS.map((g) => words[g.id])} />
          <Legend items={WORD_GROUPS.map((g, i) => ({ label: g.label, series: i + 1, value: words[g.id] }))} />
        </div>
      </section>

      <CharacterTable characters={characters} totalDialogue={characters.reduce((n, c) => n + c.words, 0)} />

      <div className="stats-columns">
        <PlaceTable places={places} />
        <div className="stats-stack">
          <ShareTable title="Intérieur et extérieur" shares={headingShares(statScenes, "intExt")} />
          <ShareTable title="Moments de la journée" shares={headingShares(statScenes, "time")} />
        </div>
      </div>

      <VersionsChart currentPages={pages.length} currentScenes={scenes.length} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stats-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** How far the scenes are, by status: one bar in the colors of the states. */
function Progress({ counts, total }: { counts: number[]; total: number }) {
  const none = total - counts.reduce((a, b) => a + b, 0);
  const parts = [...SCENE_STATUSES.map((s, i) => ({ id: s.id, label: s.label, n: counts[i] })), { id: "none", label: "Sans statut", n: none }].filter((p) => p.n > 0);
  return (
    <div className="stats-card stats-progress">
      <div className="stats-progress-head">
        <h3>Avancement des scènes</h3>
        <span className="muted">
          {counts[3]} sur {total} validée{counts[3] > 1 ? "s" : ""}
        </span>
      </div>
      <div className="stats-progress-bar" role="img" aria-label={parts.map((p) => `${p.label} : ${p.n}`).join(", ")}>
        {parts.map((p) => (
          <span key={p.id} className={`stats-p-${p.id}`} style={{ flexGrow: p.n }} />
        ))}
      </div>
      <ul className="stats-progress-legend">
        {parts.map((p) => (
          <li key={p.id}>
            <span className={`stats-dot stats-p-${p.id}`} aria-hidden="true" />
            {p.label}
            <strong>{p.n}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SplitBar({ values }: { values: number[] }) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return <div className="stats-split-bar empty" />;
  return (
    <div className="stats-split-bar" aria-hidden="true">
      {values.map((v, i) => v > 0 && <span key={i} className={`series-${i + 1}`} style={{ flexGrow: v }} />)}
    </div>
  );
}

/** Colored strip, label, and share of the total: the key of a chart, always beside it. */
function Legend({ items }: { items: { label: string; series: number; value: number }[] }) {
  const shares = percents(items.map((i) => i.value));
  return (
    <ul className="stats-legend">
      {items.map((item, i) => (
        <li key={item.label} className={`series-${item.series}`}>
          <span>{item.label}</span>
          <strong>{shareLabel(shares[i])}</strong>
          <small>{num.format(Math.round(item.value))}</small>
        </li>
      ))}
    </ul>
  );
}

type HistoryMode = "groups" | "balance";

/** Words written each day, from the journal the project keeps while the screenplay is open. */
function WritingHistory() {
  const journal = useLive(readJournal, ["project_setting"]);
  const [span, setSpan] = useState<"7" | "30">("7");
  const [mode, setMode] = useState<HistoryMode>("groups");
  const [offset, setOffset] = useState(0);
  const count = Number(span);
  const days = periodDays(new Date(), count, offset);
  const rows = days.map((d) => ({ date: d, day: journal?.[dayKey(d)] }));
  const series =
    mode === "groups"
      ? WORD_GROUPS.map((g, i) => ({ label: g.label, series: i + 1, values: rows.map((r) => r.day?.added[g.id] ?? 0) }))
      : [
          { label: "Mots ajoutés", series: 1, values: rows.map((r) => (r.day ? r.day.added.action + r.day.added.dialogue + r.day.added.other : 0)) },
          { label: "Mots supprimés", series: 2, values: rows.map((r) => r.day?.removed ?? 0) },
        ];
  const minutes = rows.reduce((n, r) => n + (r.day?.minutes ?? 0), 0);
  const written = rows.reduce((n, r) => n + (r.day ? r.day.added.action + r.day.added.dialogue + r.day.added.other : 0), 0);
  const empty = !journal || Object.keys(journal).length === 0;

  return (
    <section className="stats-section" aria-labelledby="stats-history">
      <h2 id="stats-history">Historique d'écriture</h2>
      <p className="stats-lead">Les mots écrits dans le Scénario, jour par jour. Les imports et les retours à une version ne comptent pas.</p>
      <div className="stats-controls">
        <Segmented
          label="Période"
          options={[
            { id: "7", label: "7 j" },
            { id: "30", label: "30 j" },
          ]}
          value={span}
          onChange={(v) => {
            setSpan(v);
            setOffset(0);
          }}
        />
        <select aria-label="Découpage des barres" value={mode} onChange={(e) => setMode(e.target.value as HistoryMode)}>
          <option value="groups">Par élément</option>
          <option value="balance">Ajouts et suppressions</option>
        </select>
      </div>
      <div className="stats-card">
        <div className="stats-card-head">
          <h3>{rangeLabel(days)}</h3>
          <div className="stats-nav">
            <button type="button" className="btn ghost tiny" aria-label="Période précédente" onClick={() => setOffset((o) => o + 1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" className="btn ghost tiny" aria-label="Période suivante" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
        <BarChart
          dates={days}
          series={series}
          stacked={mode === "groups"}
          empty={empty ? "Les mots écrits s'inscriront ici jour après jour, à partir d'aujourd'hui." : null}
        />
        <Legend items={series.map((s) => ({ label: s.label, series: s.series, value: s.values.reduce((a, b) => a + b, 0) }))} />
        <p className="stats-foot">
          {num.format(written)} mot{written > 1 ? "s" : ""} écrit{written > 1 ? "s" : ""} · {formatTime(minutes)} d'écriture sur la période
        </p>
      </div>
    </section>
  );
}

interface Series {
  label: string;
  series: number;
  values: number[];
}

const BAR_H = 168;
const AXIS_W = 40;

/** Days in columns: stacked by kind of element, or side by side to compare two measures. */
function BarChart({ dates, series, stacked, empty }: { dates: Date[]; series: Series[]; stacked: boolean; empty: string | null }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = dates.length;
  const totals = dates.map((_, i) => (stacked ? series.reduce((s, x) => s + x.values[i], 0) : Math.max(...series.map((x) => x.values[i]))));
  const top = niceMax(Math.max(0, ...totals));
  const plotW = Math.max(0, width - AXIS_W);
  const slot = n > 0 ? plotW / n : 0;
  const barW = Math.max(3, Math.min(36, slot * (n > 10 ? 0.62 : 0.42)));
  const y = (v: number) => BAR_H - (v / top) * BAR_H;
  const ticks = [0, top / 2, top];
  const labelEvery = n <= 7 ? 1 : 7;

  /** A bar whose end away from the baseline is rounded. */
  const bar = (x: number, y0: number, y1: number, w: number, round: boolean) => {
    const h = y0 - y1;
    if (h <= 0) return "";
    const r = round ? Math.min(4, w / 2, h) : 0;
    return `M${x} ${y0} V${y1 + r} Q${x} ${y1} ${x + r} ${y1} H${x + w - r} Q${x + w} ${y1} ${x + w} ${y1 + r} V${y0} Z`;
  };

  const shown = hover;
  return (
    <div className="stats-chart" ref={ref} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={BAR_H + 28} role="img" aria-label={`Mots écrits par jour, ${series.map((s) => s.label).join(", ")}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={AXIS_W} x2={width} y1={y(t) + 0.5} y2={y(t) + 0.5} className={t === 0 ? "stats-baseline" : "stats-grid"} />
              <text x={AXIS_W - 8} y={y(t) + 4} className="stats-tick" textAnchor="end">
                {num.format(t)}
              </text>
            </g>
          ))}
          {dates.map((d, i) => {
            const cx = AXIS_W + slot * i + slot / 2;
            let marks: ReactNode;
            if (stacked) {
              let acc = 0;
              const last = series.reduce((k, s, j) => (s.values[i] > 0 ? j : k), -1);
              marks = series.map((s, j) => {
                const v = s.values[i];
                if (v <= 0) return null;
                const y0 = y(acc) - (acc > 0 ? 2 : 0);
                acc += v;
                return <path key={j} d={bar(cx - barW / 2, y0, y(acc), barW, j === last)} className={`series-${s.series}`} />;
              });
            } else {
              const w = Math.max(2, (barW - 2) / series.length);
              marks = series.map((s, j) => (
                <path key={j} d={bar(cx - barW / 2 + j * (w + 2), y(0), y(s.values[i]), w, true)} className={`series-${s.series}`} />
              ));
            }
            return (
              <g key={i} className={shown === i ? "stats-col on" : "stats-col"}>
                <rect x={AXIS_W + slot * i} y={0} width={slot} height={BAR_H} className="stats-hit" onMouseEnter={() => setHover(i)} />
                {marks}
                {i % labelEvery === 0 && (
                  <text x={cx} y={BAR_H + 20} className="stats-tick" textAnchor="middle">
                    {shortDay.format(d)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {empty && <p className="stats-chart-empty">{empty}</p>}
      {shown !== null && width > 0 && (
        <div className="stats-tooltip" style={{ left: Math.min(Math.max(AXIS_W + slot * shown + slot / 2, 90), width - 90), top: 0 }}>
          <strong>{longDay.format(dates[shown])}</strong>
          {series.map((s) => (
            <span key={s.label} className={`series-${s.series}`}>
              {s.label}
              <b>{num.format(s.values[shown])}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const TOP = 8;

/** Who speaks the most; a row opens on the scenes where the character speaks. */
function CharacterTable({ characters, totalDialogue }: { characters: ReturnType<typeof characterStats>; totalDialogue: number }) {
  const { openScene, session } = useProject();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const scenes = useScenes(session);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const shown = all ? characters : characters.slice(0, TOP);
  return (
    <section className="stats-section" aria-labelledby="stats-characters">
      <h2 id="stats-characters">Principaux personnages</h2>
      <p className="stats-lead">Les répliques et les mots de dialogue de chaque personnage.</p>
      <div className="stats-table">
        <div className="stats-row stats-row-head stats-cols-5" role="row">
          <span>Personnage</span>
          <span>Répliques</span>
          <span>Scènes</span>
          <span>Mots</span>
          <span>Part du dialogue</span>
        </div>
        {shown.length === 0 && <p className="stats-table-empty">Aucun personnage ne parle encore.</p>}
        {shown.map((c) => (
          <Fragment key={c.name}>
            <button
              type="button"
              className="stats-row stats-cols-5"
              aria-expanded={open === c.name}
              onClick={() => setOpen(open === c.name ? null : c.name)}
            >
              <span className="stats-row-name">
                <ChevronRight aria-hidden="true" className="stats-chevron" />
                {prettyName(c.name)}
              </span>
              <span>{num.format(c.lines)}</span>
              <span>{num.format(c.scenes.length)}</span>
              <span>{num.format(c.words)}</span>
              <span>{totalDialogue > 0 ? shareLabel(Math.round((c.words / totalDialogue) * 1000) / 10) : "–"}</span>
            </button>
            {open === c.name && (
              <ul className="stats-sub">
                {c.scenes.map((id) => {
                  const s = byId.get(id);
                  return s ? (
                    <li key={id}>
                      <button type="button" onClick={() => openScene(id)}>
                        <span className="auto-num">{sceneLabel(s.index + 1)}</span>
                        <span className="stats-slug">{s.heading || "(sans en-tête)"}</span>
                        <span className="muted">{formatEighths(s.eighths)} p.</span>
                      </button>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </Fragment>
        ))}
      </div>
      {characters.length > TOP && (
        <button type="button" className="btn small stats-more" onClick={() => setAll(!all)}>
          {all ? "Afficher moins" : "Afficher plus"}
        </button>
      )}
    </section>
  );
}

/** The places of the film, by time on screen. */
function PlaceTable({ places }: { places: ReturnType<typeof placeStats> }) {
  const { openScene, session } = useProject();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const scenes = useScenes(session);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const shown = all ? places : places.slice(0, TOP);
  return (
    <section className="stats-section" aria-labelledby="stats-places">
      <h2 id="stats-places">Lieux</h2>
      <div className="stats-table">
        <div className="stats-row stats-row-head stats-cols-3" role="row">
          <span>Lieu</span>
          <span>Scènes</span>
          <span>Longueur</span>
        </div>
        {shown.length === 0 && <p className="stats-table-empty">Aucun en-tête de scène ne nomme de lieu.</p>}
        {shown.map((p) => (
          <Fragment key={p.name}>
            <button type="button" className="stats-row stats-cols-3" aria-expanded={open === p.name} onClick={() => setOpen(open === p.name ? null : p.name)}>
              <span className="stats-row-name">
                <ChevronRight aria-hidden="true" className="stats-chevron" />
                <span className="stats-slug">{p.name}</span>
              </span>
              <span>{num.format(p.scenes.length)}</span>
              <span>{formatEighths(p.eighths)} p.</span>
            </button>
            {open === p.name && (
              <ul className="stats-sub">
                {p.scenes.map((id) => {
                  const s = byId.get(id);
                  return s ? (
                    <li key={id}>
                      <button type="button" onClick={() => openScene(id)}>
                        <span className="auto-num">{sceneLabel(s.index + 1)}</span>
                        <span className="stats-slug">{s.heading}</span>
                        <span className="muted">{formatEighths(s.eighths)} p.</span>
                      </button>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </Fragment>
        ))}
      </div>
      {places.length > TOP && (
        <button type="button" className="btn small stats-more" onClick={() => setAll(!all)}>
          {all ? "Afficher moins" : "Afficher plus"}
        </button>
      )}
    </section>
  );
}

function ShareTable({ title, shares }: { title: string; shares: Share[] }) {
  const p = percents(shares.map((s) => s.eighths));
  return (
    <section className="stats-section">
      <h2>{title}</h2>
      <div className="stats-table">
        <div className="stats-row stats-row-head stats-cols-3" role="row">
          <span>Mention</span>
          <span>Scènes</span>
          <span>Part du film</span>
        </div>
        {shares.length === 0 && <p className="stats-table-empty">Pas encore de scène.</p>}
        {shares.map((s, i) => (
          <div key={s.label} className="stats-row stats-cols-3">
            <span className="stats-slug">{s.label}</span>
            <span>{num.format(s.scenes)}</span>
            <span className="stats-share">
              <span className="stats-share-bar" aria-hidden="true">
                <span style={{ width: `${p[i]}%` }} />
              </span>
              {shareLabel(p[i])}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const LINE_H = 150;

/** Pages or scenes of each frozen version, and of the screenplay as it is now. */
function VersionsChart({ currentPages, currentScenes }: { currentPages: number; currentScenes: number }) {
  const versions = useLive(listVersions, ["script_version"]);
  const [measure, setMeasure] = useState<"pages" | "scenes">("pages");
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const points = [
    ...(versions ?? []).slice().reverse().map((v) => ({ name: v.name, date: versionDate.format(new Date(v.createdAt)), value: measure === "pages" ? v.pages : v.scenes })),
    { name: "Actuelle", date: "Aujourd'hui", value: measure === "pages" ? currentPages : currentScenes },
  ];
  const top = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const plotW = Math.max(0, width - AXIS_W - 24);
  const x = (i: number) => AXIS_W + 12 + (points.length > 1 ? (plotW * i) / (points.length - 1) : plotW / 2);
  const y = (v: number) => 8 + (LINE_H - 8) - (v / top) * (LINE_H - 8);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(p.value)}`).join(" ");
  const label = measure === "pages" ? "Pages" : "Scènes";

  return (
    <section className="stats-section" aria-labelledby="stats-versions">
      <h2 id="stats-versions">Versions</h2>
      <p className="stats-lead">La longueur du scénario à chaque version figée.</p>
      <div className="stats-controls">
        <span />
        <Segmented
          label="Mesure"
          options={[
            { id: "pages", label: "Pages" },
            { id: "scenes", label: "Scènes" },
          ]}
          value={measure}
          onChange={setMeasure}
        />
      </div>
      <div className="stats-card">
        <div className="stats-card-head">
          <h3>{label}</h3>
          <span className="stats-big">{num.format(points[points.length - 1].value)}</span>
        </div>
        <div className="stats-chart" ref={ref} onMouseLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={width} height={LINE_H + 30} role="img" aria-label={`${label} par version`}>
              {[0, top / 2, top].map((t) => (
                <g key={t}>
                  <line x1={AXIS_W} x2={width} y1={y(t) + 0.5} y2={y(t) + 0.5} className={t === 0 ? "stats-baseline" : "stats-grid"} />
                  <text x={AXIS_W - 8} y={y(t) + 4} className="stats-tick" textAnchor="end">
                    {num.format(t)}
                  </text>
                </g>
              ))}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={8} y2={LINE_H} className="stats-crosshair" />}
              <path d={path} className="stats-line series-1" />
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3.5} className="stats-point series-1" />
                  <rect
                    x={x(i) - Math.max(12, plotW / Math.max(1, points.length - 1) / 2)}
                    y={0}
                    width={Math.max(24, plotW / Math.max(1, points.length - 1))}
                    height={LINE_H}
                    className="stats-hit"
                    onMouseEnter={() => setHover(i)}
                  />
                  {(points.length <= 8 || i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 6) === 0) && (
                    <text x={x(i)} y={LINE_H + 22} className="stats-tick" textAnchor="middle">
                      {p.name}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          )}
          {points.length === 1 && <p className="stats-chart-empty">Figez des versions depuis la vue Versions pour suivre ici l'évolution du scénario.</p>}
          {hover !== null && width > 0 && (
            <div className="stats-tooltip" style={{ left: Math.min(Math.max(x(hover), 90), width - 90), top: 0 }}>
              <strong>{points[hover].name}</strong>
              <span className="muted">{points[hover].date}</span>
              <span className="series-1">
                {label}
                <b>{num.format(points[hover].value)}</b>
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
