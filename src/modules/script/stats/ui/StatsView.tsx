import { ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useLive } from "../../../../core/db/live";
import { useProject } from "../../../project/ui/projectContext";
import { loadEntries } from "../../bible/application/bible";
import { prettyName } from "../../bible/domain/appearances";
import { useScenes, useSessionState } from "../../screenplay/application/scriptSession";
import { formatEighths, formatMinutes } from "../../screenplay/domain/duration";
import type { ElementType } from "../../screenplay/domain/formats";
import { characterName } from "../../screenplay/ui/editor/schema";
import { loadStory, SCENE_STATUSES, STORY_TABLES } from "../../views/application/story";
import { sceneLabel } from "../../views/domain/outline";
import {
  characterStats,
  headingShares,
  percents,
  placeStats,
  WORD_GROUPS,
  wordCounts,
  type Share,
  type StatScene,
} from "../domain/stats";

const num = new Intl.NumberFormat("fr-FR");
const pct = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

const shareLabel = (p: number) => (p > 0 && p < 0.1 ? "< 0,1 %" : `${pct.format(p)} %`);

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

      <section className="stats-section" aria-labelledby="stats-words">
        <h2 id="stats-words">Répartition du texte</h2>
        <p className="stats-lead">Les mots du scénario selon le type d'élément.</p>
        <div className="stats-card stats-split">
          <SplitBar values={WORD_GROUPS.map((g) => words[g.id])} />
          <Legend items={WORD_GROUPS.map((g, i) => ({ label: g.label, series: i + 1, value: words[g.id] }))} />
        </div>
      </section>

      <CharacterTable characters={characters} totalDialogue={characters.reduce((n, c) => n + c.words, 0)} />

      <PlaceTable places={places} />
      <ShareTable title="Intérieur et extérieur" shares={headingShares(statScenes, "intExt")} />
      <ShareTable title="Moments de la journée" shares={headingShares(statScenes, "time")} />
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
