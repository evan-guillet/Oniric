import { ChevronRight, Trash2 } from "lucide-react";
import { memo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu } from "../../../../ui-kit/MoreMenu";
import { formatEighths } from "../domain/duration";

export interface SceneRow {
  heading: string;
  page: number;
  eighths: number;
}

/** An act or a sequence of the outline: its automatic number (« Act. I », « Séq. A ») and its title. */
export interface PartLabel {
  id: string;
  num: string;
  title: string;
}

/** The outline as the list shows it; scenes are indexes in the screenplay. */
export interface ListGroup {
  act: PartLabel | null;
  sequences: { sequence: PartLabel | null; scenes: number[] }[];
}

/** What a right click in the list is on. */
export type ListTarget = { kind: "act" | "seq"; part: PartLabel } | { kind: "scene"; index: number };

const REMOVE_LABEL = { act: "Supprimer l'acte…", seq: "Supprimer la séquence…", scene: "Supprimer la scène…" };

function savedFolds(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * The scenes of the screenplay, under their acts and sequences when the story has some.
 * Acts and sequences fold; the folds are remembered per project on this computer.
 * A right click on an act, a sequence or a scene offers to delete it; `onRemove` asks before doing so.
 */
export const SceneList = memo(function SceneList({
  scenes,
  groups,
  current,
  onSelect,
  foldKey,
  onRemove,
}: {
  scenes: SceneRow[];
  groups: ListGroup[];
  current: number;
  onSelect: (index: number) => void;
  foldKey: string;
  onRemove: (target: ListTarget) => void;
}) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ x: number; y: number; target: ListTarget; key: string } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const openMenu = (e: MouseEvent<HTMLButtonElement>, target: ListTarget, key: string) => {
    e.preventDefault();
    anchor.current = e.currentTarget;
    // From the keyboard the event has no pointer: the menu opens under the row.
    const r = e.currentTarget.getBoundingClientRect();
    const keyboard = e.clientX === 0 && e.clientY === 0;
    setMenu({ x: keyboard ? r.left + 24 : e.clientX, y: keyboard ? r.bottom : e.clientY, target, key });
  };
  const [folded, setFoldedState] = useState(() => savedFolds(foldKey));
  const toggle = (id: string) => {
    const next = new Set(folded);
    if (!next.delete(id)) next.add(id);
    setFoldedState(next);
    try {
      localStorage.setItem(foldKey, JSON.stringify([...next]));
    } catch {
      // Not remembered: the fold still applies until the project is closed.
    }
  };

  const scene = (i: number) => {
    const s = scenes[i];
    if (!s) return null;
    return (
      <li key={i} className={[i === current && "on", menu?.key === `s${i}` && "menu-on"].filter(Boolean).join(" ")}>
        <button
          type="button"
          onClick={() => onSelect(i)}
          onContextMenu={(e) => openMenu(e, { kind: "scene", index: i }, `s${i}`)}
          aria-current={i === current ? "location" : undefined}
        >
          <span className="scene-num">{i + 1}</span>
          <span className="scene-heading">{s.heading || t("workspace.noHeading")}</span>
          <span className="scene-meta">
            {t("workspace.scenePage", { page: s.page })} · {formatEighths(s.eighths)}
          </span>
        </button>
      </li>
    );
  };

  const part = (kind: "act" | "seq", p: PartLabel, indexes: number[], children: ReactNode) => {
    const open = !folded.has(p.id);
    const here = indexes.includes(current);
    const first = indexes.length ? indexes[0] + 1 : null;
    return (
      <li key={p.id} className={`outline-part part-${kind}${here ? " here" : ""}${menu?.key === p.id ? " menu-on" : ""}`}>
        <button
          type="button"
          className="outline-head"
          aria-expanded={open}
          onClick={() => toggle(p.id)}
          onContextMenu={(e) => openMenu(e, { kind, part: p }, p.id)}
          title={first ? `${indexes.length} scène${indexes.length > 1 ? "s" : ""}, dès la scène ${first}` : "Aucune scène"}
        >
          <ChevronRight className="outline-chevron" aria-hidden="true" />
          <span className="outline-num">{p.num}</span>
          <span className="outline-title">{p.title}</span>
          <span className="outline-count">{indexes.length}</span>
        </button>
        {open && <ol>{children}</ol>}
      </li>
    );
  };

  const flat = groups.every((g) => !g.act && g.sequences.every((s) => !s.sequence));
  const sequences = (g: ListGroup) =>
    g.sequences.flatMap((s) => (s.sequence ? [part("seq", s.sequence, s.scenes, s.scenes.map(scene))] : s.scenes.map(scene)));

  return (
    <nav className="scene-list" aria-label={t("workspace.scenes")}>
      <ol className={flat ? undefined : "outlined"}>
        {flat
          ? scenes.map((_s, i) => scene(i))
          : groups.flatMap((g) => (g.act ? [part("act", g.act, g.sequences.flatMap((s) => s.scenes), sequences(g))] : sequences(g)))}
      </ol>
      {menu && (
        <ContextMenu
          at={menu}
          anchor={anchor}
          onClose={() => setMenu(null)}
          items={[{ label: REMOVE_LABEL[menu.target.kind], icon: Trash2, danger: true, onClick: () => onRemove(menu.target) }]}
        />
      )}
    </nav>
  );
});
