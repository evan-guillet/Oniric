import { ChevronRight } from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
 */
export const SceneList = memo(function SceneList({
  scenes,
  groups,
  current,
  onSelect,
  foldKey,
}: {
  scenes: SceneRow[];
  groups: ListGroup[];
  current: number;
  onSelect: (index: number) => void;
  foldKey: string;
}) {
  const { t } = useTranslation();
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
      <li key={i} className={i === current ? "on" : ""}>
        <button type="button" onClick={() => onSelect(i)} aria-current={i === current ? "location" : undefined}>
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
      <li key={p.id} className={`outline-part part-${kind}${here ? " here" : ""}`}>
        <button
          type="button"
          className="outline-head"
          aria-expanded={open}
          onClick={() => toggle(p.id)}
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
    <nav className="scene-list" aria-labelledby="scenes-title">
      <h2 id="scenes-title">{t("workspace.scenes")}</h2>
      <ol className={flat ? undefined : "outlined"}>
        {flat
          ? scenes.map((_s, i) => scene(i))
          : groups.flatMap((g) => (g.act ? [part("act", g.act, g.sequences.flatMap((s) => s.scenes), sequences(g))] : sequences(g)))}
      </ol>
    </nav>
  );
});
