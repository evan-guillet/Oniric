import { Diamond, Pencil, Plus, X } from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { rankBetween } from "../../../../core/ordering";
import { TagInput } from "../../../../ui-kit/Form";
import { useProject } from "../../../project/ui/projectContext";
import { headingPlace, prettyName } from "../../bible/domain/appearances";
import { useScenes, type SceneInfo } from "../../screenplay/application/scriptSession";
import { formatEighths, formatMinutes } from "../../screenplay/domain/duration";
import { moveScene, type ActGroup, type SequenceGroup } from "../domain/outline";
import {
  actPlace,
  addAct,
  addSequence,
  arrange,
  CARD_COLORS,
  deleteAct,
  deleteSequence,
  loadStory,
  SCENE_STATUSES,
  sequencePlace,
  STORY_TABLES,
  storyOutline,
  updateAct,
  updateSceneMeta,
  updateSequence,
  type SceneMeta,
  type Story,
} from "../application/story";

type Zoom = "acts" | "sequences" | "all";
type FilterKind = "character" | "location" | "plotline" | "tag" | "status";
type Drag = { kind: "scene"; id: string } | { kind: "sequence"; id: string } | { kind: "act"; id: string };

const statusLabel = (s: string | null) => SCENE_STATUSES.find((x) => x.id === s)?.label ?? "";

/** The board: acts in columns, sequences inside, scene cards inside the sequences (VUE-03 to VUE-09). */
export function BoardView() {
  const { session, notify, prompt, ask, openScene, headerActions } = useProject();
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const [zoom, setZoom] = useState<Zoom>("all");
  const [mode, setMode] = useState<"columns" | "plotlines">("columns");
  const [filter, setFilter] = useState<{ kind: FilterKind; value: string } | null>(null);
  const [highlight, setHighlight] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const groups = useMemo(() => (story ? storyOutline(story, scenes.map((s) => s.id)) : []), [story, scenes]);

  if (!story) return <div className="view pad muted">Chargement…</div>;
  const actColor = (id: string | undefined) => (id ? story.acts.find((a) => a.id === id)?.color : null) ?? null;

  const meta = (id: string): SceneMeta =>
    story.meta.get(id) ?? { id, sequenceId: null, summary: "", status: null, color: null, tags: [], plotlines: [], storyTime: null };

  const matches = (s: SceneInfo) => {
    if (!filter) return true;
    const m = meta(s.id);
    switch (filter.kind) {
      case "character":
        return s.characters.includes(filter.value);
      case "location":
        return headingPlace(s.heading) === filter.value;
      case "plotline":
        return m.plotlines.includes(filter.value);
      case "tag":
        return m.tags.includes(filter.value);
      case "status":
        return (m.status ?? "") === filter.value;
    }
  };

  const options: Record<FilterKind, { value: string; label: string }[]> = {
    character: [...new Set(scenes.flatMap((s) => s.characters))].sort().map((c) => ({ value: c, label: prettyName(c) })),
    location: [...new Set(scenes.map((s) => headingPlace(s.heading)).filter(Boolean))].sort().map((l) => ({ value: l, label: prettyName(l) })),
    plotline: [...new Set([...story.meta.values()].flatMap((m) => m.plotlines))].sort().map((p) => ({ value: p, label: p })),
    tag: [...new Set([...story.meta.values()].flatMap((m) => m.tags))].sort().map((p) => ({ value: p, label: p })),
    status: SCENE_STATUSES.map((s) => ({ value: s.id, label: s.label })),
  };

  const apply = async (next: ActGroup[], label: string, extra?: Parameters<typeof arrange>[3], tables?: Parameters<typeof arrange>[4]) => {
    try {
      const previous = { story, order: session.editor?.sceneIds() ?? [] };
      const before = await arrange(session, story, next, extra, tables);
      if (!before) return;
      notify({
        text: label,
        actions: [
          {
            label: "Annuler",
            onClick: async () => {
              const now = await loadStory();
              await arrange(session, now, storyOutline(previous.story, previous.order));
            },
          },
        ],
      });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const dropScene = (target: string | null, beforeId: string | null) => {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (d?.kind !== "scene" || d.id === beforeId) return;
    void apply(moveScene(groups, d.id, target, beforeId), "Scène déplacée : le scénario est réordonné.");
  };

  const dropSequence = (actId: string | null, beforeSeq: string | null) => {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (d?.kind !== "sequence" || d.id === beforeSeq) return;
    const siblings = story.sequences.filter((s) => s.actId === actId && s.id !== d.id).sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const at = beforeSeq ? siblings.findIndex((s) => s.id === beforeSeq) : siblings.length;
    const rank = rankBetween(at > 0 ? siblings[at - 1].rank : null, at >= 0 && at < siblings.length ? siblings[at].rank : null);
    const moved = { ...story, sequences: story.sequences.map((s) => (s.id === d.id ? { ...s, actId, rank } : s)) };
    const next = storyOutline(moved, scenes.map((s) => s.id));
    void apply(next, "Séquence déplacée : le scénario est réordonné.", [sequencePlace(d.id, actId, rank)], ["sequence"]);
  };

  const dropAct = (beforeAct: string | null) => {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (d?.kind !== "act" || d.id === beforeAct) return;
    const others = story.acts.filter((a) => a.id !== d.id).sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const at = beforeAct ? others.findIndex((a) => a.id === beforeAct) : others.length;
    const rank = rankBetween(at > 0 ? others[at - 1].rank : null, at >= 0 && at < others.length ? others[at].rank : null);
    const moved = { ...story, acts: story.acts.map((a) => (a.id === d.id ? { ...a, rank } : a)) };
    void apply(storyOutline(moved, scenes.map((s) => s.id)), "Acte déplacé : le scénario est réordonné.", [actPlace(d.id, rank)], ["act"]);
  };

  const allow = (key: string) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropTarget !== key) setDropTarget(key);
  };

  const newScene = async (seq: SequenceGroup) => {
    const editor = session.editor;
    if (!editor) return;
    try {
      const order = groups.flatMap((g) => g.sequences);
      const idx = order.indexOf(seq);
      let at = editor.doc.childCount;
      if (seq.scenes.length) at = editor.indexOfScene(seq.scenes[seq.scenes.length - 1]) + 1;
      else {
        const next = order.slice(idx + 1).find((s) => s.scenes.length);
        if (next) at = editor.indexOfScene(next.scenes[0]);
      }
      const id = editor.insertScene(at);
      await session.flush();
      await updateSceneMeta(id, { sequenceId: seq.sequence?.id ?? null, status: "todo" });
      setSelected(id);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const durationOf = (ids: string[]) => ids.reduce((n, id) => n + (byId.get(id)?.eighths ?? 0), 0);
  const beatsOf = (id: string) => story.beats.filter((b) => b.scenes.includes(id)).map((b) => b.title);

  const card = (id: string, seqId: string | null) => {
    const s = byId.get(id);
    if (!s) return null;
    const m = meta(id);
    const ok = matches(s);
    const cls = ["card", selected === id && "on", !ok && !highlight && "dim", ok && highlight && filter && "lit", dropTarget === `c:${id}` && "drop"].filter(Boolean).join(" ");
    return (
      <li
        key={id}
        className={cls}
        draggable
        onDragStart={(e) => {
          drag.current = { kind: "scene", id };
          e.dataTransfer.effectAllowed = "move";
          e.stopPropagation();
        }}
        onDragOver={(e) => {
          if (drag.current?.kind === "scene") allow(`c:${id}`)(e);
        }}
        onDrop={(e) => {
          if (drag.current?.kind !== "scene") return;
          e.preventDefault();
          e.stopPropagation();
          dropScene(seqId, id);
        }}
        style={m.color ? ({ "--scene": m.color } as CSSProperties) : undefined}
      >
        <button type="button" className="card-body" onClick={() => setSelected(id)} onDoubleClick={() => openScene(id)} aria-label={`Scène ${s.index + 1} ${s.heading}`}>
          <span className="card-top">
            <span className="card-num">{s.index + 1}</span>
            <span className="card-heading">{s.heading || "(sans en-tête)"}</span>
            <span className="card-len">{formatEighths(s.eighths)}</span>
          </span>
          {m.summary && <span className="card-summary">{m.summary}</span>}
          {s.characters.length > 0 && <span className="card-chars">{s.characters.map(prettyName).join(", ")}</span>}
          <span className="card-foot">
            {m.status && <span className={`badge st-${m.status}`}>{statusLabel(m.status)}</span>}
            {m.plotlines.map((p) => (
              <span key={p} className="badge plot">
                {p}
              </span>
            ))}
            {m.tags.map((t) => (
              <span key={t} className="badge">
                {t}
              </span>
            ))}
            {beatsOf(id).map((b) => (
              <span key={b} className="badge beat">
                <Diamond aria-hidden="true" />
                {b}
              </span>
            ))}
          </span>
        </button>
      </li>
    );
  };

  const sequenceBlock = (g: ActGroup, seq: SequenceGroup) => {
    const key = seq.sequence?.id ?? `none-${g.act?.id ?? "none"}`;
    const sid = seq.sequence?.id ?? null;
    return (
      <section
        key={key}
        className={`seq ${dropTarget === `s:${key}` ? "drop" : ""}`}
        onDragOver={(e) => {
          if (drag.current?.kind !== "act") allow(`s:${key}`)(e);
        }}
        onDrop={(e) => {
          if (drag.current?.kind === "act") return;
          e.preventDefault();
          e.stopPropagation();
          if (drag.current?.kind === "scene") dropScene(sid, null);
          else if (drag.current?.kind === "sequence") dropSequence(g.act?.id ?? null, sid);
        }}
      >
        <header
          className="seq-head"
          draggable={!!seq.sequence}
          onDragStart={(e) => {
            if (!seq.sequence) return;
            drag.current = { kind: "sequence", id: seq.sequence.id };
            e.dataTransfer.effectAllowed = "move";
            e.stopPropagation();
          }}
        >
          <span className="seq-title">{seq.sequence?.title ?? "Hors séquence"}</span>
          <span className="muted small">
            {seq.scenes.length} sc. · {formatEighths(durationOf(seq.scenes))}
          </span>
          {seq.sequence && (
            <span className="seq-actions">
              <button
                type="button"
                className="btn ghost small"
                aria-label="Renommer la séquence"
                onClick={async () => {
                  const t = await prompt("Renommer la séquence", "Titre", seq.sequence!.title);
                  if (t) await updateSequence(seq.sequence!.id, { title: t });
                }}
              >
                <Pencil aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn ghost small"
                aria-label="Supprimer la séquence"
                onClick={async () => {
                  const c = await ask({
                    title: "Supprimer la séquence ?",
                    text: <p>Ses scènes restent dans le scénario et rejoignent la séquence précédente.</p>,
                    cancel: "Annuler",
                    choices: [{ label: "Supprimer", value: "y", danger: true }],
                  });
                  if (c === "y") await deleteSequence(seq.sequence!.id);
                }}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          )}
        </header>
        {zoom === "all" && (
          <ol className="cards">
            {seq.scenes.map((id) => card(id, sid))}
            <li className="card-add">
              <button type="button" className="btn ghost small" onClick={() => void newScene(seq)}>
                <Plus aria-hidden="true" />
                Scène
              </button>
            </li>
          </ol>
        )}
      </section>
    );
  };

  const totalEighths = scenes.reduce((n, s) => n + s.eighths, 0);

  return (
    <div className="view board-view">
      {headerActions &&
        createPortal(
          <div className="header-tools" role="toolbar" aria-label="Tableau">
            <label>
              Affichage{" "}
              <select value={mode} onChange={(e) => setMode(e.target.value as "columns" | "plotlines")}>
                <option value="columns">Actes et séquences</option>
                <option value="plotlines">Lignes d'intrigue</option>
              </select>
            </label>
            {mode === "columns" && (
              <label>
                Niveau{" "}
                <select value={zoom} onChange={(e) => setZoom(e.target.value as Zoom)}>
                  <option value="acts">Actes seuls</option>
                  <option value="sequences">Actes et séquences</option>
                  <option value="all">Tout</option>
                </select>
              </label>
            )}
            <label>
              Filtre{" "}
              <select
                value={filter ? `${filter.kind}:${filter.value}` : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return setFilter(null);
                  const i = v.indexOf(":");
                  setFilter({ kind: v.slice(0, i) as FilterKind, value: v.slice(i + 1) });
                }}
              >
                <option value="">Aucun</option>
                {(["character", "location", "plotline", "tag", "status"] as FilterKind[]).map((k) =>
                  options[k].length ? (
                    <optgroup key={k} label={{ character: "Personnage", location: "Lieu", plotline: "Intrigue", tag: "Étiquette", status: "Statut" }[k]}>
                      {options[k].map((o) => (
                        <option key={o.value} value={`${k}:${o.value}`}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null,
                )}
              </select>
            </label>
            {filter && (
              <label className="choice">
                <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Colorer au lieu de griser
              </label>
            )}
            <span className="muted small">
              {scenes.length} scènes · ≈ {formatMinutes(totalEighths / 8)}
            </span>
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                const t = await prompt("Nouvel acte", "Titre de l'acte", `Acte ${story.acts.length + 1}`);
                if (t) await addAct(story, t);
              }}
            >
              <Plus aria-hidden="true" />
              Acte
            </button>
          </div>,
          headerActions,
        )}

      {mode === "plotlines" ? (
        <Plotlines scenes={scenes} story={story} selected={selected} onSelect={setSelected} />
      ) : (
        <div className="board" onDragEnd={() => setDropTarget(null)}>
          {groups.map((g) => {
            const ids = g.sequences.flatMap((s) => s.scenes);
            const key = g.act?.id ?? "none";
            return (
              <div
                key={key}
                className={`column ${dropTarget === `a:${key}` ? "drop" : ""}`}
                onDragOver={allow(`a:${key}`)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag.current?.kind === "act") dropAct(g.act?.id ?? null);
                  else if (drag.current?.kind === "sequence") dropSequence(g.act?.id ?? null, null);
                  else if (drag.current?.kind === "scene") dropScene(g.sequences.at(-1)?.sequence?.id ?? null, null);
                }}
                style={actColor(g.act?.id) ? ({ "--act": actColor(g.act?.id)! } as CSSProperties) : undefined}
              >
                <header
                  className="column-head"
                  draggable={!!g.act}
                  onDragStart={(e) => {
                    if (!g.act) return;
                    drag.current = { kind: "act", id: g.act.id };
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <h3 className="act-pill">
                    <span className="act-dot" aria-hidden="true" />
                    {g.act?.title ?? "Sans acte"}
                  </h3>
                  <span className="muted small">
                    {ids.length} sc. · {totalEighths ? Math.round((durationOf(ids) / totalEighths) * 100) : 0} %
                  </span>
                  {g.act && (
                    <span className="seq-actions">
                      <button
                        type="button"
                        className="btn ghost small"
                        aria-label="Renommer l'acte"
                        onClick={async () => {
                          const t = await prompt("Renommer l'acte", "Titre", g.act!.title);
                          if (t) await updateAct(g.act!.id, { title: t });
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn ghost small"
                        aria-label="Supprimer l'acte"
                        onClick={async () => {
                          const c = await ask({
                            title: "Supprimer l'acte ?",
                            text: <p>Ses séquences et ses scènes sont conservées, sans acte.</p>,
                            cancel: "Annuler",
                            choices: [{ label: "Supprimer", value: "y", danger: true }],
                          });
                          if (c === "y") await deleteAct(g.act!.id);
                        }}
                      >
                        <X aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </header>
                {zoom !== "acts" && g.sequences.map((s) => sequenceBlock(g, s))}
                {zoom !== "acts" && (
                  <button
                    type="button"
                    className="btn ghost small add-seq"
                    onClick={async () => {
                      const t = await prompt("Nouvelle séquence", "Titre de la séquence");
                      if (t) await addSequence(story, g.act?.id ?? null, t);
                    }}
                  >
                    <Plus aria-hidden="true" />
                    Séquence
                  </button>
                )}
                {zoom === "acts" && (
                  <ul className="seq-summary">
                    {g.sequences.map((s) => (
                      <li key={s.sequence?.id ?? "none"}>
                        {s.sequence?.title ?? "Hors séquence"} <span className="muted small">({s.scenes.length})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && byId.get(selected) && (
        <CardPanel key={selected} scene={byId.get(selected)!} meta={meta(selected)} story={story} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Plotlines({ scenes, story, selected, onSelect }: { scenes: SceneInfo[]; story: Story; selected: string | null; onSelect: (id: string) => void }) {
  const [by, setBy] = useState<"plotline" | "character">("plotline");
  const rows =
    by === "plotline"
      ? [...new Set([...story.meta.values()].flatMap((m) => m.plotlines))].sort()
      : [...new Set(scenes.flatMap((s) => s.characters))].sort((a, b) => scenes.filter((s) => s.characters.includes(b)).length - scenes.filter((s) => s.characters.includes(a)).length);
  const has = (s: SceneInfo, row: string) => (by === "plotline" ? (story.meta.get(s.id)?.plotlines ?? []).includes(row) : s.characters.includes(row));
  return (
    <div className="plotlines">
      <div className="view-toolbar">
        <label>
          Une ligne par{" "}
          <select value={by} onChange={(e) => setBy(e.target.value as "plotline" | "character")}>
            <option value="plotline">intrigue</option>
            <option value="character">personnage</option>
          </select>
        </label>
        {rows.length === 0 && (
          <span className="muted small">{by === "plotline" ? "Donnez des intrigues aux scènes (A, B, C…) dans leur carte pour les voir s'entrelacer." : "Aucun personnage dans le scénario."}</span>
        )}
      </div>
      <div className="plot-grid" style={{ gridTemplateColumns: `160px repeat(${scenes.length}, 22px)` }}>
        <span />
        {scenes.map((s) => (
          <span key={s.id} className="plot-num" title={s.heading}>
            {s.index + 1}
          </span>
        ))}
        {rows.map((row) => (
          <PlotRow key={row} label={by === "character" ? prettyName(row) : row} scenes={scenes} has={(s) => has(s, row)} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function PlotRow({ label, scenes, has, selected, onSelect }: { label: string; scenes: SceneInfo[]; has: (s: SceneInfo) => boolean; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      <span className="plot-label">{label}</span>
      {scenes.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`plot-cell ${has(s) ? "on" : ""} ${selected === s.id ? "sel" : ""}`}
          title={`${s.index + 1}. ${s.heading}`}
          aria-label={`${label}, scène ${s.index + 1}${has(s) ? "" : " (absent)"}`}
          onClick={() => onSelect(s.id)}
        />
      ))}
    </>
  );
}

function CardPanel({ scene, meta, story, onClose }: { scene: SceneInfo; meta: SceneMeta; story: Story; onClose: () => void }) {
  const { openScene, session, notify, ask } = useProject();
  const [summary, setSummary] = useState(meta.summary);
  const [storyTime, setStoryTime] = useState(meta.storyTime ?? "");
  const save = (patch: Partial<SceneMeta>) => updateSceneMeta(scene.id, patch).catch((e) => notify({ text: describeError(e), tone: "error" }));
  const plotSuggestions = [...new Set(["A", "B", "C", ...[...story.meta.values()].flatMap((m) => m.plotlines)])];
  const tagSuggestions = [...new Set([...story.meta.values()].flatMap((m) => m.tags))];
  return (
    <aside className="card-panel" aria-label="Carte de scène">
      <header>
        <h2>
          {scene.index + 1}. {scene.heading || "(sans en-tête)"}
        </h2>
        <button type="button" className="btn ghost small" onClick={onClose} aria-label="Fermer la carte">
          <X aria-hidden="true" />
        </button>
      </header>
      <p className="muted small">
        {formatEighths(scene.eighths)} de page · p. {scene.page}
        {scene.characters.length > 0 && ` · ${scene.characters.map(prettyName).join(", ")}`}
      </p>
      <label className="fld wide">
        <span className="fld-label">Résumé</span>
        <textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} onBlur={() => summary !== meta.summary && void save({ summary })} />
      </label>
      <label className="fld wide">
        <span className="fld-label">Statut d'écriture</span>
        <select value={meta.status ?? ""} onChange={(e) => void save({ status: (e.target.value || null) as SceneMeta["status"] })}>
          <option value="">—</option>
          {SCENE_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div className="fld wide">
        <span className="fld-label">Couleur</span>
        <div className="swatches">
          <button type="button" className={`swatch none ${meta.color ? "" : "on"}`} aria-label="Sans couleur" onClick={() => void save({ color: null })} />
          {CARD_COLORS.map((c) => (
            <button key={c} type="button" className={`swatch ${meta.color === c ? "on" : ""}`} style={{ background: c }} aria-label={`Couleur ${c}`} onClick={() => void save({ color: c })} />
          ))}
        </div>
      </div>
      <TagInput label="Intrigues" value={meta.plotlines} suggestions={plotSuggestions} onChange={(plotlines) => void save({ plotlines })} help="A, B, C… ou un nom d'intrigue." />
      <TagInput label="Étiquettes" value={meta.tags} suggestions={tagSuggestions} onChange={(tags) => void save({ tags })} />
      <label className="fld wide">
        <span className="fld-label">Moment dans l'histoire</span>
        <input value={storyTime} placeholder="jour 3, 22 h · 1944…" onChange={(e) => setStoryTime(e.target.value)} onBlur={() => storyTime !== (meta.storyTime ?? "") && void save({ storyTime: storyTime || null })} />
      </label>
      <div className="panel-actions">
        <button type="button" className="btn primary small" onClick={() => openScene(scene.id)}>
          Ouvrir dans le scénario
        </button>
        <button
          type="button"
          className="btn ghost small danger"
          onClick={async () => {
            const c = await ask({
              title: "Couper la scène ?",
              text: <p>La scène quitte le scénario mais reste dans la corbeille des scènes coupées (vue Versions), d'où elle peut être réintégrée.</p>,
              cancel: "Annuler",
              choices: [{ label: "Couper la scène", value: "y", danger: true }],
            });
            if (c === "y") {
              session.editor?.removeScene(scene.id);
              onClose();
            }
          }}
        >
          Couper la scène
        </button>
      </div>
    </aside>
  );
}
