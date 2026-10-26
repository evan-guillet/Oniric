import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Diamond, FolderInput, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { rankBetween } from "../../../../core/ordering";
import { Dialog } from "../../../../ui-kit/Dialog";
import { TagInput } from "../../../../ui-kit/Form";
import { MoreMenu } from "../../../../ui-kit/MoreMenu";
import { useProject } from "../../../project/ui/projectContext";
import { headingPlace, prettyName } from "../../bible/domain/appearances";
import { useScenes, type SceneInfo } from "../../screenplay/application/scriptSession";
import { formatEighths } from "../../screenplay/domain/duration";
import { moveScene, numberedParts, numberedTitles, sceneLabel, type ActGroup, type SequenceGroup } from "../domain/outline";
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
import { CanvasSurface } from "./CanvasSurface";

type FilterKind = "character" | "location" | "plotline" | "tag" | "status";
type Drag = { kind: "scene"; id: string } | { kind: "sequence"; id: string } | { kind: "act"; id: string };
/** The act (and sequence) the board is zoomed into, by fold key; null for the whole story. */

const statusLabel = (s: string | null) => SCENE_STATUSES.find((x) => x.id === s)?.label ?? "";
const actKey = (g: ActGroup) => `a:${g.act?.id ?? "none"}`;
const seqKey = (g: ActGroup, seq: SequenceGroup) => `s:${seq.sequence?.id ?? `none-${g.act?.id ?? "none"}`}`;

/** The left-edge handle: only it starts a drag, so a click on the card stays a click. */
function Grip({ label, onDragStart }: { label: string; onDragStart: (e: DragEvent<HTMLElement>) => void }) {
  return (
    <span className="grip" draggable title={label} onDragStart={onDragStart} onClick={(e) => e.stopPropagation()}>
      <GripVertical aria-hidden="true" />
    </span>
  );
}

/** The chevron at the left of a canvas header: folds the act or sequence down to its header. */
function HeadFold({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <button type="button" className="head-fold" aria-label={`${open ? "Plier" : "Déplier"} ${label}`} title={open ? "Plier" : "Déplier"} aria-expanded={open} onClick={onClick}>
      <Icon aria-hidden="true" />
    </button>
  );
}

/** A « + » on a canvas wire: adds an act, a sequence or a scene right there, before the card the wire leads to. */
function WireAdd({ dir, label, onClick }: { dir: "down" | "trunk"; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`cv-insert ${dir}`} aria-label={label} title={label} onClick={onClick}>
      <span className="cv-insert-dot">
        <Plus aria-hidden="true" />
      </span>
    </button>
  );
}

/** The « + » at the right of an act or sequence header: a new sequence in the act, a new scene in the sequence. */
function HeadAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="head-add" aria-label={label} title={label} onClick={onClick}>
      <Plus aria-hidden="true" />
    </button>
  );
}

/** A wire drawn by the node it belongs to: the elbow coming in, the trunk carrying on, the elbow down to the scenes. */
function Wire({ kind }: { kind: "in" | "on" | "out" }) {
  return <i className={`cv-wire ${kind}`} aria-hidden="true" />;
}

/** An empty card the shape of the ones beside it, at the end of their line: adds one more. */
function Ghost({ label, className = "", children, ...rest }: { label: string; className?: string; children?: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button type="button" className={`cv-ghost ${className}`} {...rest}>
      {children}
      <span className="cv-ghost-icon">
        <Plus aria-hidden="true" />
      </span>
      {label}
    </button>
  );
}

/**
 * The board (VUE-03 to VUE-09): the story as a tree on a free canvas.
 */
export function BoardView() {
  const { project, session, notify, prompt, ask, openScene, headerActions } = useProject();
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const [filter, setFilter] = useState<{ kind: FilterKind; value: string } | null>(null);
  const [highlight, setHighlight] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Acts and sequences folded on the canvas, by fold key; remembered per project on this computer.
  const foldKey = `oniric.board.folds.${project.id}`;
  const [folded, setFoldedState] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(foldKey) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const setFolded = (next: Set<string>) => {
    setFoldedState(next);
    try {
      localStorage.setItem(foldKey, JSON.stringify([...next]));
    } catch {
      // Not remembered, still applied.
    }
  };
  const toggleFold = (key: string) => {
    const next = new Set(folded);
    if (!next.delete(key)) next.add(key);
    setFolded(next);
  };
  const drag = useRef<Drag | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // The act, sequence or scene whose « Déplacer vers… » dialog is open.
  const [moving, setMoving] = useState<Drag | null>(null);

  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const groups = useMemo(() => (story ? storyOutline(story, scenes.map((s) => s.id)) : []), [story, scenes]);
  const titles = useMemo(() => numberedTitles(groups), [groups]);
  const actTitle = (g: ActGroup) => (g.act && titles.get(g.act.id)) || "Sans acte";
  // On the board the number sits grey above the title.
  const parts = useMemo(() => numberedParts(groups), [groups]);
  const numbered = (id: string | undefined, fallback: string) => {
    const n = id ? parts.get(id) : undefined;
    if (!n) return <span className="named">{fallback}</span>;
    return (
      <>
        <span className="auto-num">{n.num}</span>
        {n.title && <span className="named">{n.title}</span>}
      </>
    );
  };
  if (!story) return <div className="view pad muted">Chargement…</div>;
  const newSequence = async (g: ActGroup, beforeId: string | null = null) => {
    const t = await prompt("Nouvelle séquence", "Titre de la séquence");
    if (t) await addSequence(story, g.act?.id ?? null, t, "", beforeId);
  };
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

  /** The sequence `id` into the act `actId`, just before the sequence `beforeSeq` or at the end. */
  const placeSequence = (id: string, actId: string | null, beforeSeq: string | null) => {
    if (id === beforeSeq) return;
    const siblings = story.sequences.filter((s) => s.actId === actId && s.id !== id).sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const at = beforeSeq ? siblings.findIndex((s) => s.id === beforeSeq) : siblings.length;
    const rank = rankBetween(at > 0 ? siblings[at - 1].rank : null, at >= 0 && at < siblings.length ? siblings[at].rank : null);
    const moved = { ...story, sequences: story.sequences.map((s) => (s.id === id ? { ...s, actId, rank } : s)) };
    const next = storyOutline(moved, scenes.map((s) => s.id));
    void apply(next, "Séquence déplacée : le scénario est réordonné.", [sequencePlace(id, actId, rank)], ["sequence"]);
  };

  /** The act `id` just before the act `beforeAct`, or at the end. */
  const placeAct = (id: string, beforeAct: string | null) => {
    if (id === beforeAct) return;
    const others = story.acts.filter((a) => a.id !== id).sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const at = beforeAct ? others.findIndex((a) => a.id === beforeAct) : others.length;
    const rank = rankBetween(at > 0 ? others[at - 1].rank : null, at >= 0 && at < others.length ? others[at].rank : null);
    const moved = { ...story, acts: story.acts.map((a) => (a.id === id ? { ...a, rank } : a)) };
    void apply(storyOutline(moved, scenes.map((s) => s.id)), "Acte déplacé : le scénario est réordonné.", [actPlace(id, rank)], ["act"]);
  };

  const dropSequence = (actId: string | null, beforeSeq: string | null) => {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (d?.kind === "sequence") placeSequence(d.id, actId, beforeSeq);
  };

  const dropAct = (beforeAct: string | null) => {
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (d?.kind === "act") placeAct(d.id, beforeAct);
  };

  const startDrag = (d: Drag, ghost: string) => (e: DragEvent<HTMLElement>) => {
    drag.current = d;
    e.dataTransfer.effectAllowed = "move";
    const el = e.currentTarget.closest(ghost);
    if (el) {
      const r = el.getBoundingClientRect();
      e.dataTransfer.setDragImage(el, e.clientX - r.left, e.clientY - r.top);
    }
    e.stopPropagation();
  };

  const allow = (key: string) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropTarget !== key) setDropTarget(key);
  };

  /** A new scene at the end of `seq`, or just before the scene `beforeId`. */
  const newScene = async (seq: SequenceGroup, beforeId: string | null = null) => {
    const editor = session.editor;
    if (!editor) return;
    try {
      const order = groups.flatMap((g) => g.sequences);
      const idx = order.indexOf(seq);
      let at = editor.doc.childCount;
      if (beforeId) at = editor.indexOfScene(beforeId);
      else if (seq.scenes.length) at = editor.indexOfScene(seq.scenes[seq.scenes.length - 1]) + 1;
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

  const renameScene = async (s: SceneInfo) => {
    const t = await prompt("Renommer la scène", "En-tête", s.heading);
    if (t !== null) session.editor?.setSceneHeading(s.id, t.trim());
  };
  // The scene leaves the screenplay for the bin of cut scenes (Versions view), where it can be restored.
  const removeScene = async (id: string) => {
    const c = await ask({
      title: "Supprimer la scène ?",
      text: <p>La scène quitte le scénario mais reste dans la corbeille des scènes coupées (vue Versions), d'où elle peut être réintégrée.</p>,
      cancel: "Annuler",
      choices: [{ label: "Supprimer", value: "y", danger: true }],
    });
    if (c !== "y") return;
    session.editor?.removeScene(id);
    if (selected === id) setSelected(null);
  };

  const durationOf = (ids: string[]) => ids.reduce((n, id) => n + (byId.get(id)?.eighths ?? 0), 0);
  const beatsOf = (id: string) => story.beats.filter((b) => b.scenes.includes(id)).map((b) => b.title);

  const card = (id: string, seqId: string | null, before?: ReactNode) => {
    const s = byId.get(id);
    if (!s) return null;
    const m = meta(id);
    const ok = matches(s);
    const cls = ["card", selected === id && "on", !ok && !highlight && "dim", ok && highlight && filter && "lit", dropTarget === `c:${id}` && "drop"].filter(Boolean).join(" ");
    return (
      <li
        key={id}
        className={cls}
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
        {before}
        <Grip label="Glisser pour déplacer la scène" onDragStart={startDrag({ kind: "scene", id }, ".card")} />
        <button type="button" className="card-body" onClick={() => setSelected(id)} onDoubleClick={() => openScene(id)} aria-label={`Scène ${s.index + 1} ${s.heading}`}>
          <span className="card-top">
            <span className="card-num">{sceneLabel(s.index + 1)}</span>
            <span className="card-heading">{s.heading || "(sans en-tête)"}</span>
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
            {beatsOf(id).map((b, i) => (
              <span key={`${i}-${b}`} className="badge beat">
                <Diamond aria-hidden="true" />
                {b}
              </span>
            ))}
          </span>
        </button>
        <MoreMenu
          label="Actions de la scène"
          className="card-more"
          items={[
            { label: "Renommer", icon: Pencil, onClick: () => void renameScene(s) },
            { label: "Déplacer vers…", icon: FolderInput, onClick: () => setMoving({ kind: "scene", id }) },
            { label: "Supprimer", icon: Trash2, danger: true, onClick: () => void removeScene(id) },
          ]}
        />
      </li>
    );
  };

  const seqDrop = (g: ActGroup, seq: SequenceGroup) => {
    const key = seq.sequence?.id ?? `none-${g.act?.id ?? "none"}`;
    const sid = seq.sequence?.id ?? null;
    return {
      onDragOver: (e: DragEvent) => {
        if (drag.current?.kind !== "act") allow(`s:${key}`)(e);
      },
      onDrop: (e: DragEvent) => {
        if (drag.current?.kind === "act") return;
        e.preventDefault();
        e.stopPropagation();
        if (drag.current?.kind === "scene") dropScene(sid, null);
        else if (drag.current?.kind === "sequence") dropSequence(g.act?.id ?? null, sid);
      },
    };
  };

  const seqHead = (seq: SequenceGroup, fold: string) => (
    <header className="seq-head">
      {seq.sequence && <Grip label="Glisser pour déplacer la séquence" onDragStart={startDrag({ kind: "sequence", id: seq.sequence.id }, ".seq-head")} />}
      {fold && <HeadFold open={!folded.has(fold)} label="la séquence" onClick={() => toggleFold(fold)} />}
      <div className="head-label">
        <span className="seq-title">{numbered(seq.sequence?.id, "Hors séquence")}</span>
        <span className="muted small">{seq.scenes.length} sc.</span>
      </div>
      {seq.sequence && (
        <MoreMenu
          label="Actions de la séquence"
          items={[
            {
              label: "Renommer",
              icon: Pencil,
              onClick: async () => {
                const t = await prompt("Renommer la séquence", "Titre", seq.sequence!.title);
                if (t) await updateSequence(seq.sequence!.id, { title: t });
              },
            },
            { label: "Déplacer vers…", icon: FolderInput, onClick: () => setMoving({ kind: "sequence", id: seq.sequence!.id }) },
            {
              label: "Supprimer",
              icon: Trash2,
              danger: true,
              onClick: async () => {
                const c = await ask({
                  title: "Supprimer la séquence ?",
                  text: <p>Ses scènes restent dans le scénario et rejoignent la séquence précédente.</p>,
                  cancel: "Annuler",
                  choices: [{ label: "Supprimer", value: "y", danger: true }],
                });
                if (c === "y") await deleteSequence(seq.sequence!.id);
              },
            },
          ]}
        />
      )}
      <HeadAdd label="Nouvelle scène" onClick={() => void newScene(seq)} />
    </header>
  );

  const sceneCards = (seq: SequenceGroup) => (
    <ol className="cards cv-cards">
      {seq.scenes.map((id) => card(id, seq.sequence?.id ?? null, <WireAdd dir="down" label="Insérer une scène ici" onClick={() => void newScene(seq, id)} />))}
      <li className="card-add">
        <Ghost label="Nouvelle scène" onClick={() => void newScene(seq)} />
      </li>
    </ol>
  );

  const totalEighths = scenes.reduce((n, s) => n + s.eighths, 0);

  /** Where `id` goes once moved: the whole list it joins, every act, sequence or scene named. */
  const moveDialog = (m: Drag) => {
    const close = () => setMoving(null);
    const named = (id: string) => ({ num: parts.get(id)?.num ?? "", title: parts.get(id)?.title ?? "" });
    const label = (id: string) => [named(id).num, named(id).title].filter(Boolean).join(" · ");
    if (m.kind === "scene") {
      const s = byId.get(m.id);
      const home = groups.flatMap((g) => g.sequences).find((q) => q.scenes.includes(m.id));
      if (!s || !home) return null;
      const seqs = new Map(groups.flatMap((g) => g.sequences).flatMap((q) => (q.sequence ? [[q.sequence.id, q] as const] : [])));
      const sceneName = (id: string) => {
        const x = byId.get(id);
        return x ? `${sceneLabel(x.index + 1)} · ${x.heading || "(sans en-tête)"}` : "";
      };
      return (
        <MoveDialog
          title={`Déplacer la scène ${s.index + 1}`}
          subject={s.heading || "(sans en-tête)"}
          groups={groups
            .filter((g) => g.sequences.some((q) => q.sequence))
            .map((g) => ({
              label: actTitle(g),
              targets: g.sequences.flatMap((q) => (q.sequence ? [{ id: q.sequence.id, ...named(q.sequence.id), meta: `${q.scenes.length} sc.` }] : [])),
            }))}
          current={home.sequence?.id ?? null}
          currentBefore={home.scenes[home.scenes.indexOf(m.id) + 1] ?? ""}
          positions={(t) => places((seqs.get(t)?.scenes ?? []).filter((x) => x !== m.id), sceneName)}
          onMove={(t, before) => {
            close();
            void apply(moveScene(groups, m.id, t, before), "Scène déplacée : le scénario est réordonné.");
          }}
          onClose={close}
        />
      );
    }
    const acts = groups.flatMap((g) => (g.act ? [g] : []));
    if (m.kind === "sequence") {
      const home = acts.find((g) => g.sequences.some((q) => q.sequence?.id === m.id));
      const seqIds = (g: ActGroup) => g.sequences.flatMap((q) => (q.sequence ? [q.sequence.id] : []));
      const mine = home ? seqIds(home) : [];
      return (
        <MoveDialog
          title={`Déplacer la séquence ${named(m.id).num.replace(/^Séq\. /, "")}`}
          subject={named(m.id).title}
          groups={[{ targets: acts.map((g) => ({ id: g.act!.id, ...named(g.act!.id), meta: `${seqIds(g).length} séq.` })) }]}
          current={home?.act?.id ?? null}
          currentBefore={mine[mine.indexOf(m.id) + 1] ?? ""}
          positions={(t) => places(seqIds(acts.find((g) => g.act!.id === t)!).filter((x) => x !== m.id), label)}
          onMove={(t, before) => {
            close();
            placeSequence(m.id, t, before);
          }}
          onClose={close}
        />
      );
    }
    const order = acts.map((g) => g.act!.id);
    return (
      <MoveDialog
        title={`Déplacer l'acte ${named(m.id).num.replace(/^Act\. /, "")}`}
        subject={named(m.id).title}
        groups={[{ targets: [{ id: "", num: "", title: project.title }] }]}
        current=""
        currentBefore={order[order.indexOf(m.id) + 1] ?? ""}
        positions={() => places(order.filter((x) => x !== m.id), label)}
        onMove={(_, before) => {
          close();
          placeAct(m.id, before);
        }}
        onClose={close}
      />
    );
  };

  const actDrop = (g: ActGroup, into: SequenceGroup | undefined) => {
    const key = g.act?.id ?? "none";
    return {
      onDragOver: allow(`a:${key}`),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (drag.current?.kind === "act") dropAct(g.act?.id ?? null);
        else if (drag.current?.kind === "sequence") dropSequence(g.act?.id ?? null, null);
        else if (drag.current?.kind === "scene") dropScene(into?.sequence?.id ?? null, null);
      },
    };
  };
  const actStyle = (g: ActGroup) => (actColor(g.act?.id) ? ({ "--act": actColor(g.act?.id)! } as CSSProperties) : undefined);

  const actHead = (g: ActGroup, fold?: string) => {
    const ids = g.sequences.flatMap((s) => s.scenes);
    return (
      <header className="column-head">
        {g.act && <Grip label="Glisser pour déplacer l'acte" onDragStart={startDrag({ kind: "act", id: g.act.id }, ".column-head")} />}
        {fold && <HeadFold open={!folded.has(fold)} label="l'acte" onClick={() => toggleFold(fold)} />}
        <h3 className="act-title">
          <div className="head-label">
            <span className="act-name">{numbered(g.act?.id, "Sans acte")}</span>
            <span className="muted small">
              {ids.length} sc. · {totalEighths ? Math.round((durationOf(ids) / totalEighths) * 100) : 0} %
            </span>
          </div>
        </h3>
        {g.act && (
          <MoreMenu
            label="Actions de l'acte"
            items={[
              {
                label: "Renommer",
                icon: Pencil,
                onClick: async () => {
                  const t = await prompt("Renommer l'acte", "Titre", g.act!.title);
                  if (t) await updateAct(g.act!.id, { title: t });
                },
              },
              { label: "Déplacer…", icon: FolderInput, onClick: () => setMoving({ kind: "act", id: g.act!.id }) },
              {
                label: "Supprimer",
                icon: Trash2,
                danger: true,
                onClick: async () => {
                  const c = await ask({
                    title: "Supprimer l'acte ?",
                    text: <p>Ses séquences et ses scènes sont conservées, sans acte.</p>,
                    cancel: "Annuler",
                    choices: [{ label: "Supprimer", value: "y", danger: true }],
                  });
                  if (c === "y") await deleteAct(g.act!.id);
                },
              },
            ]}
          />
        )}
        <HeadAdd label="Nouvelle séquence" onClick={() => void newSequence(g)} />
      </header>
    );
  };

  const newAct = async (beforeId: string | null = null) => {
    const t = await prompt("Nouvel acte", "Titre de l'acte", `Acte ${story.acts.length + 1}`);
    if (t) await addAct(story, t, beforeId);
  };

  /*
   * The canvas: the film at the top left, a trunk down to each act, each act a trunk down to each of its sequences,
   * each sequence heading a row of its scenes. Arrows follow the story's order.
   */
  const cvSeq = (g: ActGroup, seq: SequenceGroup) => {
    const key = seq.sequence?.id ?? `none-${g.act?.id ?? "none"}`;
    const fold = seqKey(g, seq);
    const closed = folded.has(fold);
    return (
      <li key={key} className="cv-seq" {...seqDrop(g, seq)}>
        <div className={`cv-node seq ${closed ? "folded" : ""} ${dropTarget === `s:${key}` ? "drop" : ""}`}>
          <Wire kind="in" />
          <Wire kind="on" />
          {!closed && <Wire kind="out" />}
          {seq.sequence && <WireAdd dir="trunk" label="Insérer une séquence ici" onClick={() => void newSequence(g, seq.sequence!.id)} />}
          {seqHead(seq, fold)}
        </div>
        {!closed && sceneCards(seq)}
      </li>
    );
  };

  const cvAct = (g: ActGroup) => {
    const key = g.act?.id ?? "none";
    const fold = actKey(g);
    const closed = folded.has(fold);
    return (
      <li key={key} className="cv-act" style={actStyle(g)}>
        <div className={`cv-node cv-act-node ${closed ? "folded" : ""} ${dropTarget === `a:${key}` ? "drop" : ""}`} {...actDrop(g, g.sequences.at(-1))}>
          <Wire kind="in" />
          <Wire kind="on" />
          {g.act && <WireAdd dir="trunk" label="Insérer un acte ici" onClick={() => void newAct(g.act!.id)} />}
          {actHead(g, fold)}
        </div>
        {!closed && (
          <ol className="cv-seqs">
            {g.sequences.map((s) => cvSeq(g, s))}
            <li className="cv-seq cv-add">
              <Ghost label="Nouvelle séquence" className="cv-node" onClick={() => void newSequence(g)}>
                <Wire kind="in" />
              </Ghost>
            </li>
          </ol>
        )}
      </li>
    );
  };

  // Every act and sequence on view, folded or not.
  const allFolds = groups.flatMap((g) => [actKey(g), ...g.sequences.map((s) => seqKey(g, s))]);
  const foldTools = (
    <>
      <button type="button" aria-label="Tout déplier" title="Tout déplier" disabled={folded.size === 0} onClick={() => setFolded(new Set())}>
        <ChevronsUpDown aria-hidden="true" />
      </button>
      <button type="button" aria-label="Tout plier" title="Tout plier" disabled={allFolds.every((k) => folded.has(k))} onClick={() => setFolded(new Set(allFolds))}>
        <ChevronsDownUp aria-hidden="true" />
      </button>
    </>
  );

  const canvas = () => {
    const acts = groups.filter((g) => g.act).length;
    return (
      <div className="cv-tree">
        <div className="cv-node cv-film">
          <span className="cv-film-title">{project.title}</span>
          <span className="muted small">
            {acts} acte{acts > 1 ? "s" : ""} · {scenes.length} sc.
          </span>
        </div>
        <ol className="cv-acts">
          {groups.map((g) => cvAct(g))}
          <li className="cv-act cv-add">
            <Ghost
              label="Nouvel acte"
              className={`cv-node ${dropTarget === "a:end" ? "drop" : ""}`}
              onDragOver={(e) => {
                if (drag.current?.kind === "act") allow("a:end")(e);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropAct(null);
              }}
              onClick={() => void newAct()}
            >
              <Wire kind="in" />
            </Ghost>
          </li>
        </ol>
      </div>
    );
  };

  return (
    <div className="view board-view">
      {headerActions &&
        createPortal(
          <div className="header-tools" role="toolbar" aria-label="Tableau">
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
          </div>,
          headerActions,
        )}

      <CanvasSurface tools={foldTools} onDragEnd={() => setDropTarget(null)}>
        {canvas()}
      </CanvasSurface>

      {moving && moveDialog(moving)}

      {selected && byId.get(selected) && (
        <CardPanel key={selected} scene={byId.get(selected)!} meta={meta(selected)} story={story} onClose={() => setSelected(null)} onRemove={() => void removeScene(selected)} />
      )}
    </div>
  );
}

/** The places among `ids` (in order, the moved one left out): first, after each, the last being the end (""). */
function places(ids: string[], label: (id: string) => string) {
  if (!ids.length) return [{ value: "", label: "Seule à cet endroit" }];
  return [{ value: ids[0], label: "En premier" }, ...ids.map((id, i) => ({ value: ids[i + 1] ?? "", label: `Après ${label(id)}` }))];
}

type MoveTarget = { id: string; num: string; title: string; meta?: string };

/**
 * « Déplacer vers… »: every place it can go, grouped as on the board, then where in it. Opens on where it is now;
 * the move is offered once something changes.
 */
function MoveDialog({
  title,
  subject,
  groups,
  current,
  currentBefore,
  positions,
  onMove,
  onClose,
}: {
  title: string;
  subject: string;
  groups: { label?: string; targets: MoveTarget[] }[];
  current: string | null;
  /** The value of `positions(current)` that is where it is now. */
  currentBefore: string;
  positions: (target: string) => { value: string; label: string }[];
  onMove: (target: string, before: string | null) => void;
  onClose: () => void;
}) {
  const first = groups.flatMap((g) => g.targets)[0]?.id ?? "";
  const [target, setTarget] = useState(current ?? first);
  const [before, setBefore] = useState(current === null ? "" : currentBefore);
  const name = useId();
  const listId = useId();
  const many = groups.reduce((n, g) => n + g.targets.length, 0) > 1;
  const unchanged = target === current && before === currentBefore;
  const pick = (t: string) => {
    setTarget(t);
    setBefore(t === current ? currentBefore : "");
  };
  return (
    <Dialog
      title={title}
      wide={many}
      className="move-dialog"
      onCancel={onClose}
      actions={[
        { label: "Annuler", onClick: onClose },
        { label: "Déplacer", primary: true, disabled: unchanged, onClick: () => onMove(target, before || null) },
      ]}
    >
      {subject && <p className="move-subject">{subject}</p>}
      {many && (
        <div className="fld">
          <span className="fld-label" id={listId}>
            Vers
          </span>
          <div className="move-list" role="radiogroup" aria-labelledby={listId}>
            {groups.map((g, i) => (
              <div key={g.label ?? i} className="move-group" role="group" aria-label={g.label}>
                {g.label && <div className="move-group-label">{g.label}</div>}
                {g.targets.map((t) => (
                  <label key={t.id} className="move-opt">
                    <input type="radio" name={name} checked={target === t.id} onChange={() => pick(t.id)} data-autofocus={target === t.id ? "" : undefined} />
                    <span className="move-num">{t.num}</span>
                    <span className="move-title">{t.title}</span>
                    <span className="move-meta">{t.id === current ? "Ici" : t.meta}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <label className="fld move-place">
        <span className="fld-label">Position</span>
        <select value={before} onChange={(e) => setBefore(e.target.value)}>
          {positions(target).map((p) => (
            <option key={p.value || "end"} value={p.value}>
              {p.value === currentBefore && target === current ? `${p.label} (actuelle)` : p.label}
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}

function CardPanel({ scene, meta, story, onClose, onRemove }: { scene: SceneInfo; meta: SceneMeta; story: Story; onClose: () => void; onRemove: () => void }) {
  const { openScene, session, notify } = useProject();
  const [heading, setHeading] = useState(scene.heading);
  useEffect(() => setHeading(scene.heading), [scene.heading]);
  const [summary, setSummary] = useState(meta.summary);
  const [storyTime, setStoryTime] = useState(meta.storyTime ?? "");
  const save = (patch: Partial<SceneMeta>) => updateSceneMeta(scene.id, patch).catch((e) => notify({ text: describeError(e), tone: "error" }));
  const plotSuggestions = [...new Set(["A", "B", "C", ...[...story.meta.values()].flatMap((m) => m.plotlines)])];
  const tagSuggestions = [...new Set([...story.meta.values()].flatMap((m) => m.tags))];
  return (
    <aside className="card-panel" aria-label="Carte de scène">
      <header>
        <h2 className="auto-num">{sceneLabel(scene.index + 1)}</h2>
        <button type="button" className="btn ghost small" onClick={onClose} aria-label="Fermer la carte">
          <X aria-hidden="true" />
        </button>
      </header>
      <p className="muted small">
        {formatEighths(scene.eighths)} de page · p. {scene.page}
        {scene.characters.length > 0 && ` · ${scene.characters.map(prettyName).join(", ")}`}
      </p>
      <label className="fld wide">
        <span className="fld-label">En-tête</span>
        <input
          className="heading-input"
          value={heading}
          placeholder="INT. LIEU – JOUR"
          onChange={(e) => setHeading(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={() => heading.trim() !== scene.heading && session.editor?.setSceneHeading(scene.id, heading.trim())}
        />
      </label>
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
        <button type="button" className="btn ghost small danger" onClick={onRemove}>
          Supprimer la scène
        </button>
      </div>
    </aside>
  );
}
