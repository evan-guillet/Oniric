import { BookOpen, ChartColumn, ChevronRight, History, Layers, NotebookPen, PenLine, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { db, query } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { useWritingPrefs } from "../../../core/writingPrefs";
import { dateFormat, numberFormat, plural, t } from "../../../core/i18n";
import { loadEntries } from "../../script/bible/application/bible";
import { sceneTexts } from "../../script/bible/application/sceneTexts";
import { detect, triage } from "../../script/bible/domain/appearances";
import { listVersions } from "../../script/screenplay/application/versions";
import { useScenes, useSessionState, type SceneInfo } from "../../script/screenplay/application/scriptSession";
import { formatMinutes } from "../../script/screenplay/domain/duration";
import type { ElementType } from "../../script/screenplay/domain/formats";
import { characterName } from "../../script/screenplay/ui/editor/schema";
import { readJournal } from "../../script/stats/application/journal";
import { characterStats, dayKey, periodDays, placeStats, totalWords, wordCounts, type Journal, type StatScene } from "../../script/stats/domain/stats";
import { Progress, Tile } from "../../script/stats/ui/StatsView";
import { loadStory, SCENE_STATUSES, STORY_TABLES, storyOutline, type Story } from "../../script/views/application/story";
import { numberedTitles, sceneLabel } from "../../script/views/domain/outline";
import { useFields } from "../../script/workshop/application/workshop";
import { STEPS, type StepStatus } from "../../script/workshop/domain/steps";
import { useProject, type ViewId } from "./projectContext";

const num = { format: (n: number) => numberFormat().format(n) };
const longDay = { format: (d: Date) => dateFormat({ weekday: "long", day: "numeric", month: "long" }).format(d) };
const shortDay = { format: (d: Date) => dateFormat({ day: "numeric", month: "short" }).format(d) };

/** Where the scene the cursor was last in is remembered, per project on this computer. */
export const lastSceneKey = (projectId: string) => `oniric.dashboard.scene.${projectId}`;

/** The first page of the project: where the writing stopped, what is waiting, how far the film is. */
export function DashboardView() {
  const { project, session } = useProject();
  useSessionState(session);
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);

  const statScenes = useMemo(
    (): StatScene[] =>
      scenes.map((s) => {
        const blocks: StatScene["blocks"] = [];
        s.node.forEach((b) => blocks.push({ type: b.type.name as ElementType, text: b.textContent }));
        return { id: s.id, index: s.index, heading: s.heading, eighths: s.eighths, blocks };
      }),
    [scenes],
  );
  const words = useMemo(() => totalWords(wordCounts(statScenes.flatMap((s) => s.blocks))), [statScenes]);

  const snap = session.snapshot;
  const pages = snap?.pagination.pages ?? [];
  const exactPages = pages.length === 0 ? 0 : pages.length - 1 + pages[pages.length - 1].usedRows / (snap?.pagination.linesPerPage ?? 1);

  let lastId: string | null = null;
  try {
    lastId = localStorage.getItem(lastSceneKey(project.id));
  } catch {
    // Not remembered: the first scene.
  }
  const last = scenes.find((s) => s.id === lastId) ?? scenes[0];

  return (
    <div className="view view-main dash-view">
      {last && <Resume scene={last} story={story} scenes={scenes} pageCount={pages.length} />}

      <div className="dash-pair">
        <Waiting scenes={scenes} story={story} />
        <Activity />
      </div>

      <section className="stats-section" aria-labelledby="dash-progress">
        <h2 id="dash-progress">{t("dash.progress")}</h2>
        <div className="stats-card stats-tiles">
          <Tile label={t("dash.pages")} value={num.format(pages.length)} />
          <Tile label={t("dash.duration")} value={formatMinutes(exactPages)} />
          <Tile label={t("dash.scenes")} value={num.format(scenes.length)} />
          <Tile label={t("dash.wordsTile")} value={num.format(words)} />
        </div>
        {story && scenes.length > 0 && (
          <Progress counts={SCENE_STATUSES.map((st) => scenes.filter((s) => story.meta.get(s.id)?.status === st.id).length)} total={scenes.length} />
        )}
      </section>

      <Shortcuts statScenes={statScenes} story={story} />
    </div>
  );
}

/** The scene the writing stopped in, opened again in one click. */
function Resume({ scene, story, scenes, pageCount }: { scene: SceneInfo; story: Story | undefined; scenes: SceneInfo[]; pageCount: number }) {
  const { openScene } = useProject();
  const empty = scenes.length <= 1 && scene.text.trim() === "";
  const parts = useMemo(() => {
    if (!story) return [];
    const groups = storyOutline(story, scenes.map((s) => s.id));
    const titles = numberedTitles(groups);
    for (const g of groups)
      for (const sq of g.sequences)
        if (sq.scenes.includes(scene.id)) return [g.act && titles.get(g.act.id), sq.sequence && titles.get(sq.sequence.id)].filter((t): t is string => !!t);
    return [];
  }, [story, scenes, scene.id]);
  const summary = story?.meta.get(scene.id)?.summary.trim();
  // Without a summary, the first lines after the heading say what the scene is.
  const excerpt = summary || scene.text.split("\n").slice(scene.heading ? 1 : 0).filter((l) => l.trim()).join(" ");

  return (
    <section className="stats-section" aria-labelledby="dash-resume">
      <h2 id="dash-resume">{empty ? t("dash.start") : t("dash.resume")}</h2>
      <div className="stats-card dash-resume">
        <div className="dash-resume-text">
          {empty ? (
            <p className="dash-resume-excerpt">{t("dash.emptyScript")}</p>
          ) : (
            <>
              <p className="dash-resume-where">
                <span className="auto-num">{sceneLabel(scene.index + 1)}</span>
                {parts.map((p) => (
                  <span key={p}>{p}</span>
                ))}
              </p>
              <h3 className="dash-resume-slug">{scene.heading || t("dash.noHeading")}</h3>
              {excerpt && <p className="dash-resume-excerpt">{excerpt}</p>}
            </>
          )}
        </div>
        <div className="dash-resume-side">
          <button type="button" className="btn primary" onClick={() => openScene(scene.id)}>
            <PenLine aria-hidden="true" />
            {empty ? t("dash.writeFirst") : t("dash.openScene")}
          </button>
          {!empty && (
            <span className="dash-resume-page">
              {t("dash.pageOf", { page: num.format(scene.page), total: num.format(pageCount) })}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

interface OpenNote {
  id: string;
  sceneId: string | null;
  quote: string;
  body: string;
}

async function loadOpenNotes(): Promise<OpenNote[]> {
  const rows = await query(db.selectFrom("note").select(["id", "scene_id", "quote", "body"]).where("deleted_at", "is", null).where("resolved", "=", 0).orderBy("created_at", "desc"));
  return rows.map((r) => ({ id: r.id, sceneId: r.scene_id, quote: r.quote, body: r.body }));
}

const SHOWN = 3;

/** What is waiting for the author: open notes, scenes to rewrite, names of the screenplay without an entry. */
function Waiting({ scenes, story }: { scenes: SceneInfo[]; story: Story | undefined }) {
  const { openScene, go } = useProject();
  const notes = useLive(loadOpenNotes, ["note"]);
  const entries = useLive(loadEntries, ["bible_entry"]);
  const texts = useMemo(() => sceneTexts(scenes), [scenes]);
  const unnamed = useMemo(() => {
    if (!entries) return 0;
    const refs = entries.map((e) => ({ id: e.id, type: e.type, name: e.name, aliases: e.aliases }));
    return triage(detect(texts, refs), refs).filter((c) => c.doubt === null).length;
  }, [texts, entries]);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const rewrite = story ? scenes.filter((s) => story.meta.get(s.id)?.status === "rewrite") : [];
  const open = (notes ?? []).filter((n) => !n.sceneId || byId.has(n.sceneId));
  const loading = !notes || !story || !entries;
  const nothing = !loading && open.length === 0 && rewrite.length === 0 && unnamed === 0;

  return (
    <section className="stats-section" aria-labelledby="dash-waiting">
      <h2 id="dash-waiting">{t("dash.waiting")}</h2>
      <div className="stats-table dash-list">
        {loading && <p className="stats-table-empty">{t("dash.loading")}</p>}
        {nothing && (
          <p className="dash-clear">
            <span className="stats-dot stats-p-done" aria-hidden="true" />
            {t("dash.clear")}
          </p>
        )}
        {open.length > 0 && (
          <Group title={t("dash.openNotes")} count={open.length}>
            {open.slice(0, SHOWN).map((n) => {
              const s = n.sceneId ? byId.get(n.sceneId) : undefined;
              return (
                <li key={n.id}>
                  <button type="button" className="dash-row" onClick={() => (s ? openScene(s.id) : go("script"))}>
                    <span className="stats-dot stats-p-draft" aria-hidden="true" />
                    <span className="dash-row-text">{n.quote ? t("dash.quote", { quote: n.quote }) : n.body || t("dash.emptyNote")}</span>
                    {s && <span className="dash-row-meta">{sceneLabel(s.index + 1)}</span>}
                  </button>
                </li>
              );
            })}
            {open.length > SHOWN && <li className="dash-more">{plural("dash.others", open.length - SHOWN)}</li>}
          </Group>
        )}
        {rewrite.length > 0 && (
          <Group title={t("dash.rewrite")} count={rewrite.length}>
            {rewrite.slice(0, SHOWN).map((s) => (
              <li key={s.id}>
                <button type="button" className="dash-row" onClick={() => openScene(s.id)}>
                  <span className="stats-dot stats-p-rewrite" aria-hidden="true" />
                  <span className="dash-row-text stats-slug">{s.heading || t("dash.noHeading")}</span>
                  <span className="dash-row-meta">{sceneLabel(s.index + 1)}</span>
                </button>
              </li>
            ))}
            {rewrite.length > SHOWN && <li className="dash-more">{plural("dash.others", rewrite.length - SHOWN)}</li>}
          </Group>
        )}
        {unnamed > 0 && (
          <Group title={t("dash.unnamedTitle")} count={unnamed}>
            <li>
              <button type="button" className="dash-row" onClick={() => go("bible")}>
                <span className="stats-dot dash-dot-detected" aria-hidden="true" />
                <span className="dash-row-text">
                  {plural("dash.unnamed", unnamed)}
                </span>
                <ChevronRight aria-hidden="true" className="dash-row-go" />
              </button>
            </li>
          </Group>
        )}
      </div>
    </section>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="dash-group">
      <h3 className="dash-group-head">
        {title}
        <span className="dash-group-count">{num.format(count)}</span>
      </h3>
      <ul>{children}</ul>
    </div>
  );
}

const DAYS = 28;
const CHART_H = 96;

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

const dayWords = (journal: Journal | undefined, d: Date) => {
  const day = journal?.[dayKey(d)];
  return day ? totalWords(day.added) : 0;
};

/** Days in a row with words written, up to today (or yesterday, when today has none yet). */
function streak(journal: Journal | undefined, today: Date): number {
  let n = 0;
  for (let i = dayWords(journal, today) > 0 ? 0 : 1; ; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (dayWords(journal, d) === 0) return n;
    n++;
  }
}

function formatTime(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return t("dash.minutes", { m });
  return t("dash.hours", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

/** The words written in the Scénario these last four weeks, from the writing journal. */
function Activity() {
  const journal = useLive(readJournal, ["project_setting"]);
  const goal = useWritingPrefs().dailyGoal;
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const today = new Date();
  const days = periodDays(today, DAYS, 0);
  const values = days.map((d) => dayWords(journal, d));
  const minutes = (d: Date) => journal?.[dayKey(d)]?.minutes ?? 0;
  const week = days.slice(-7);
  const max = Math.max(1, goal, ...values);
  const empty = values.every((v) => v === 0);

  const slot = width / DAYS;
  const barW = Math.max(3, Math.min(14, slot * 0.6));
  const h = (v: number) => (v > 0 ? Math.max(3, (v / max) * (CHART_H - 4)) : 2);
  const shown = hover ?? null;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <section className="stats-section" aria-labelledby="dash-activity">
      <h2 id="dash-activity">{t("dash.activity")}</h2>
      <div className="stats-card dash-activity">
        <dl className="dash-figures">
          <div>
            <dt>{t("dash.today")}</dt>
            <dd>
              {goal > 0 ? (
                <>
                  {num.format(values[DAYS - 1])} <span className="dash-goal-of">/ {plural("dash.words", goal)}</span>
                </>
              ) : (
                plural("dash.words", values[DAYS - 1])
              )}
            </dd>
          </div>
          <div>
            <dt>{t("dash.week")}</dt>
            <dd>{plural("dash.words", values.slice(-7).reduce((a, b) => a + b, 0))}</dd>
          </div>
          <div>
            <dt>{t("dash.weekTime")}</dt>
            <dd>{formatTime(week.reduce((n, d) => n + minutes(d), 0))}</dd>
          </div>
          <div>
            <dt>{t("dash.streak")}</dt>
            <dd>{num.format(streak(journal, today))}</dd>
          </div>
        </dl>
        <div className="dash-chart" ref={ref} onMouseLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={width} height={CHART_H + 22} role="img" aria-label={t("dash.chartLabel", { total: num.format(total) })}>
              <line x1={0} x2={width} y1={CHART_H + 0.5} y2={CHART_H + 0.5} className="dash-baseline" />
              {goal > 0 && <line x1={0} x2={width} y1={Math.round(CHART_H - h(goal)) + 0.5} y2={Math.round(CHART_H - h(goal)) + 0.5} className="dash-goal" />}
              {days.map((d, i) => {
                const x = slot * i + (slot - barW) / 2;
                const bh = h(values[i]);
                return (
                  <g key={i} className={["dash-col", values[i] > 0 ? "has" : "", goal > 0 && values[i] >= goal ? "met" : "", shown === i ? "on" : "", i === DAYS - 1 ? "today" : ""].join(" ")}>
                    <rect x={slot * i} y={0} width={slot} height={CHART_H + 22} className="dash-hit" onMouseEnter={() => setHover(i)} />
                    <rect x={x} y={CHART_H - bh} width={barW} height={bh} rx={Math.min(3, barW / 2)} className="dash-bar" />
                    {(i % 7 === 0 || i === DAYS - 1) && (
                      <text x={i === DAYS - 1 ? width : slot * i + slot / 2} y={CHART_H + 17} className="dash-tick" textAnchor={i === DAYS - 1 ? "end" : "middle"}>
                        {i === DAYS - 1 ? t("dash.today") : shortDay.format(d)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
          {empty && journal !== undefined && <p className="dash-chart-empty">{t("dash.chartEmpty")}</p>}
        </div>
        <p className="dash-readout" aria-live="polite">
          {shown === null ? (
            <>
              {plural("dash.written", total)}
              {goal > 0 && <> · {t("dash.goalMet", { days: plural("dash.days", values.filter((v) => v >= goal).length), goal: plural("dash.words", goal) })}</>}
            </>
          ) : (
            <>
              <strong>{longDay.format(days[shown])}</strong> · {plural("dash.words", values[shown])}
              {minutes(days[shown]) > 0 && <> · {t("dash.writingTime", { time: formatTime(minutes(days[shown])) })}</>}
            </>
          )}
        </p>
      </div>
    </section>
  );
}

interface Shortcut {
  view: ViewId;
  label: string;
  icon: LucideIcon;
  detail: string;
  steps?: StepStatus[];
}


/** The other views of the script, each with what it holds. */
function Shortcuts({ statScenes, story }: { statScenes: StatScene[]; story: Story | undefined }) {
  const { go } = useProject();
  const fields = useFields();
  const entries = useLive(async () => (await loadEntries()).filter((e) => !e.archivedAt).length, ["bible_entry"]);
  const versions = useLive(listVersions, ["script_version"]);
  const characters = useMemo(() => characterStats(statScenes, characterName).length, [statScenes]);
  const places = useMemo(() => placeStats(statScenes).length, [statScenes]);

  const ready = STEPS.filter((s) => s.ready);
  const steps = ready.map((s) => (fields?.get(`step.${s.n}.status`) as StepStatus | undefined) ?? "empty");
  const done = steps.filter((s) => s === "done").length;
  const acts = story?.acts.length ?? 0;
  const sequences = story?.sequences.length ?? 0;
  const lastVersion = versions?.[0];

  const rows: Shortcut[] = [
    { view: "workshop", label: t("nav.views.workshop"), icon: NotebookPen, detail: t("dash.stepsDone", { done, total: ready.length }), steps },
    { view: "bible", label: t("nav.views.bible"), icon: BookOpen, detail: entries === undefined ? "…" : entries === 0 ? t("dash.noEntry") : plural("dash.entries", entries) },
    {
      view: "structure",
      label: t("nav.views.structure"),
      icon: Layers,
      detail: acts + sequences === 0 ? t("dash.noAct") : [acts > 0 && plural("dash.acts", acts), sequences > 0 && plural("dash.sequences", sequences)].filter(Boolean).join(" · "),
    },
    {
      view: "versions",
      label: t("nav.views.versions"),
      icon: History,
      detail: !versions
        ? "…"
        : lastVersion
          ? t("dash.versionsLast", {
              versions: plural("dash.versions", versions.length),
              date: dateFormat({ day: "numeric", month: "long" }).format(new Date(lastVersion.createdAt)),
            })
          : t("dash.noVersion"),
    },
    { view: "stats", label: t("nav.views.stats"), icon: ChartColumn, detail: `${plural("dash.speakers", characters)} · ${plural("dash.places", places)}` },
  ];

  return (
    <section className="stats-section" aria-labelledby="dash-views">
      <h2 id="dash-views">{t("dash.project")}</h2>
      <ul className="stats-table dash-views">
        {rows.map((r) => (
          <li key={r.view}>
            <button type="button" className="dash-view-row" onClick={() => go(r.view)}>
              <r.icon aria-hidden="true" className="dash-view-icon" />
              <span className="dash-view-label">{r.label}</span>
              <span className="dash-view-detail">{r.detail}</span>
              {r.steps && (
                <span className="steps-bar dash-steps" aria-hidden="true">
                  {r.steps.map((s, i) => (
                    <span key={i} className={s} />
                  ))}
                </span>
              )}
              <ChevronRight aria-hidden="true" className="dash-row-go" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
