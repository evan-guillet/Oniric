import { ChevronDown } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../core/db/live";
import { t } from "../../../core/i18n";
import type { SceneInfo } from "../../script/screenplay/application/scriptSession";
import { SceneList, type ListGroup } from "../../script/screenplay/ui/SceneList";
import { STORY_TABLES, loadStory, storyOutline } from "../../script/views/application/story";
import { numberedParts } from "../../script/views/domain/outline";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { formatMinutes, formatSeconds, type ChoiceField } from "../domain/shots";
import type { Shot } from "../application/shots";

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

/** The scene the Découpage shows, kept per project on this computer; the first scene when it is gone. */
export function useSceneChoice(projectId: string, scenes: SceneInfo[]): [SceneInfo | null, (id: string) => void] {
  const [stored, setStored] = useStoredState<string | null>(`oniric.realisation.scene.${projectId}`, null);
  const [id, setId] = useState<string | null>(stored);
  const choose = (next: string) => {
    setId(next);
    setStored(next);
  };
  return [scenes.find((s) => s.id === id) ?? scenes[0] ?? null, choose];
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

/** The scenes of the screenplay under their acts and sequences, as the Scénario lists them, the chosen one marked and
 *  kept in view; `meta` is the line under each heading. The folds are the same in every view of the Réalisation. */
function SceneTree({
  projectId,
  scenes,
  current,
  onSelect,
  meta,
  focus,
}: {
  projectId: string;
  scenes: SceneInfo[];
  current: string | null;
  onSelect: (id: string) => void;
  meta: (scene: SceneInfo) => ReactNode;
  /** The scene chosen takes the focus, again once the acts and sequences have loaded around it. */
  focus?: boolean;
}) {
  const story = useLive(loadStory, [...STORY_TABLES]);
  const groups = useMemo<ListGroup[]>(() => {
    const index = new Map(scenes.map((s, i) => [s.id, i]));
    // The scenes alone until the story loads.
    if (!story) return [{ act: null, sequences: [{ sequence: null, scenes: scenes.map((_s, i) => i) }] }];
    const outlined = storyOutline(story, scenes.map((s) => s.id));
    const parts = numberedParts(outlined);
    const label = (id: string) => ({ id, ...parts.get(id)! });
    return outlined.map((g) => ({
      act: g.act ? label(g.act.id) : null,
      sequences: g.sequences.map((q) => ({
        sequence: q.sequence ? label(q.sequence.id) : null,
        scenes: q.scenes.map((id) => index.get(id)).filter((i): i is number => i !== undefined),
      })),
    }));
  }, [story, scenes]);
  const rows = useMemo(() => scenes.map((s) => ({ heading: s.heading, page: s.page, eighths: s.eighths })), [scenes]);
  const at = scenes.findIndex((s) => s.id === current);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const on = box.current?.querySelector<HTMLElement>(".scene-list li.on");
    on?.scrollIntoView({ block: "nearest" });
    if (focus) (on?.querySelector("button") ?? box.current?.querySelector<HTMLElement>(".scene-list button"))?.focus({ preventScroll: true });
  }, [current, story, focus]);
  return (
    <div ref={box} className="scene-tree">
      <SceneList
        scenes={rows}
        groups={groups}
        current={at}
        onSelect={(i) => onSelect(scenes[i].id)}
        foldKey={`oniric.realisation.tree.${projectId}`}
        meta={(i) => meta(scenes[i])}
      />
    </div>
  );
}

/**
 * The scene line of the Découpage as a button: a click drops the tree of acts, sequences and scenes under it, the
 * scene worked on in view and in the focus; ↑ ↓ go through the rows, Escape or a click outside closes.
 */
export function ScenePicker({
  projectId,
  scenes,
  current,
  onSelect,
  meta,
  children,
}: {
  projectId: string;
  scenes: SceneInfo[];
  current: string | null;
  onSelect: (id: string) => void;
  meta: (scene: SceneInfo) => ReactNode;
  children: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; height: number } | null>(null);
  const close = (refocus: boolean) => {
    setAt(null);
    if (refocus) button.current?.focus();
  };
  useLayoutEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setAt(null);
    };
    const onResize = () => setAt(null);
    // Escape wherever the focus is, even after a click on the empty part of the menu.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setAt(null);
      button.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onResize);
    };
  }, [at]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`rz-fold rz-scene-pick${at ? " on" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={!!at}
        title={t("shotlist.chooseScene")}
        onClick={(e) => {
          if (at) return close(false);
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ top: r.bottom + 4, left: r.left, height: window.innerHeight - r.bottom - 20 });
        }}
      >
        {children}
        <ChevronDown className="rz-scene-chevron" aria-hidden="true" />
      </button>
      {at &&
        createPortal(
          <div
            ref={menu}
            role="dialog"
            aria-label={t("shotlist.chooseScene")}
            className="rz-scene-menu"
            style={{ top: at.top, left: at.left, maxHeight: Math.max(240, Math.min(at.height, 640)) }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                const all = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
                const i = all.indexOf(document.activeElement as HTMLButtonElement);
                all[Math.max(0, Math.min(all.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
                e.preventDefault();
              } else if (e.key === "Tab") {
                close(false);
              }
            }}
          >
            <SceneTree
              projectId={projectId}
              scenes={scenes}
              current={current}
              meta={meta}
              focus
              onSelect={(id) => {
                close(true);
                onSelect(id);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

/** A field written in place, saved when it is left or with Enter; Escape puts back what it held. A clamped one shows
    its first two lines at rest and unfolds whole to be written. */
export function InlineText({
  value,
  onCommit,
  label,
  placeholder,
  multiline,
  clamp,
  className,
  format,
  parse,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  clamp?: boolean;
  className?: string;
  /** How a value that is not being written shows. */
  format?: (v: string) => string;
  /** Turns what was typed into the value to keep, or null to refuse it. */
  parse?: (v: string) => string | null;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const opening = useRef(false);
  // The clamped text gave way to the field: the focus follows, the caret at the end.
  useLayoutEffect(() => {
    const el = area.current;
    if (!opening.current || !el) return;
    opening.current = false;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [draft]);
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
  if (multiline && clamp && draft === null) {
    return (
      <div
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        tabIndex={0}
        className={`rz-inline rz-clamp ${className ?? ""}`}
        onFocus={() => {
          opening.current = true;
          setDraft(value);
        }}
      >
        {shown ? <span className="rz-clamp-text">{shown}</span> : <span className="rz-placeholder">{placeholder}</span>}
      </div>
    );
  }
  return multiline ? <textarea ref={area} rows={1} {...common} /> : <input type="text" {...common} />;
}
