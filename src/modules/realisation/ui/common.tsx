import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../../core/i18n";
import type { SceneInfo } from "../../script/screenplay/application/scriptSession";
import { useStoredState } from "../../../ui-kit/useStoredState";
import type { SceneElement } from "../domain/shots";
import type { ChoiceField } from "../domain/shots";
import { formatMinutes, formatSeconds } from "../domain/shots";
import type { Shot } from "../application/shots";

/** The scene another view asked to open here (the Découpage from a moodboard, the Storyboard from the Découpage). */
let requested: string | null = null;

export function requestScene(id: string): void {
  requested = id;
}

/** The moodboard another view asked to open (a scene's or an entry's board), taken once by the Moodboards. */
let boardRequested: string | null = null;

export function requestBoard(id: string): void {
  boardRequested = id;
}

export function takeBoardRequest(): string | null {
  const id = boardRequested;
  boardRequested = null;
  return id;
}

/**
 * The scene the Découpage and the Storyboard show, the same in both and kept per project on this computer;
 * the first scene when it is gone.
 */
export function useSceneChoice(projectId: string, scenes: SceneInfo[]): [SceneInfo | null, (id: string) => void] {
  const [stored, setStored] = useStoredState<string | null>(`oniric.realisation.scene.${projectId}`, null);
  const [id, setId] = useState<string | null>(() => requested ?? stored);
  useEffect(() => {
    if (requested) {
      setStored(requested);
      requested = null;
    }
  }, [setStored]);
  const choose = (next: string) => {
    setId(next);
    setStored(next);
  };
  return [scenes.find((s) => s.id === id) ?? scenes[0] ?? null, choose];
}

/** The elements of a scene, heading included, as the coverage reads them. */
export function sceneElements(scene: SceneInfo): SceneElement[] {
  const out: SceneElement[] = [];
  scene.node.forEach((b) => out.push({ type: b.type.name, text: b.textContent }));
  return out;
}

export const choiceLabel = (field: ChoiceField, id: string) => t(`shot.${field}.${id}`);

/** « 5 plans · 2 min 30 à l'écran · 3 h de tournage » */
export function shotTotals(shots: Shot[]): string {
  const screen = shots.reduce((n, s) => n + (s.duration ?? 0), 0);
  const setup = shots.reduce((n, s) => n + (s.setup ?? 0), 0);
  return [
    t("shotlist.shots", { count: shots.length }),
    screen ? t("shotlist.onScreen", { time: formatSeconds(screen) }) : null,
    setup ? t("shotlist.toShoot", { time: formatMinutes(setup) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The scenes of the screenplay, one button each, the chosen one marked; `meta` is the line under the heading. */
export function SceneRail({
  scenes,
  current,
  onSelect,
  meta,
}: {
  scenes: SceneInfo[];
  current: string | null;
  onSelect: (id: string) => void;
  meta: (scene: SceneInfo) => ReactNode;
}) {
  return (
    <nav className="scene-list rz-scenes" aria-label={t("shotlist.scenes")}>
      <ol>
        {scenes.map((s) => (
          <li key={s.id} className={s.id === current ? "on" : undefined}>
            <button type="button" onClick={() => onSelect(s.id)} aria-current={s.id === current ? "location" : undefined}>
              <span className="scene-num">{s.index + 1}</span>
              <span className="scene-heading">{s.heading || t("workspace.noHeading")}</span>
              <span className="scene-meta">{meta(s)}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A field written in place, saved when it is left or with Enter; Escape puts back what it held. */
export function InlineText({
  value,
  onCommit,
  label,
  placeholder,
  multiline,
  className,
  format,
  parse,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  /** How a value that is not being written shows. */
  format?: (v: string) => string;
  /** Turns what was typed into the value to keep, or null to refuse it. */
  parse?: (v: string) => string | null;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const shown = draft ?? (format ? format(value) : value);
  const commit = () => {
    if (draft === null || cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const next = parse ? parse(draft) : draft;
    setDraft(null);
    if (next !== null && next !== value) onCommit(next);
  };
  const common = {
    className: `rz-inline ${className ?? ""}`,
    value: shown,
    "aria-label": label,
    placeholder,
    onFocus: () => setDraft(value),
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        cancelled.current = true;
        e.currentTarget.blur();
        e.stopPropagation();
      } else if (e.key === "Enter" && (!multiline || e.ctrlKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
  };
  return multiline ? <textarea rows={1} {...common} /> : <input type="text" {...common} />;
}
