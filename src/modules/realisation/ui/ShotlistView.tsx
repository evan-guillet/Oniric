import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  GripVertical,
  LayoutGrid,
  Plus,
  Table2,
  Trash2,
  ArrowDown,
  ArrowUp,
  LayoutPanelTop,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { describeError } from "../../../core/errors";
import { plural, t } from "../../../core/i18n";
import { useLive } from "../../../core/db/live";
import { CheckList } from "../../../ui-kit/CheckList";
import { confirmRemoval } from "../../../ui-kit/Dialog";
import { MoreMenu } from "../../../ui-kit/MoreMenu";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useProject } from "../../project/ui/projectContext";
import { useScenes, type SceneInfo } from "../../script/screenplay/application/scriptSession";
import { MediaImage } from "../../shared/media";
import { STORY_TABLES, loadStory, storyOutline } from "../../script/views/application/story";
import { numberedParts } from "../../script/views/domain/outline";
import {
  addShot,
  byScene,
  deleteShot,
  duplicateShot,
  reorderShots,
  setShootOrder,
  updateShot,
  useNumbering,
  useRatio,
  useShots,
  ratioValue,
  type Shot,
  type ShotPatch,
} from "../application/shots";
import {
  formatMinutes,
  formatSeconds,
  parseMinutes,
  parseSeconds,
  shotNumber,
  SHOT_CHOICES,
  type ChoiceField,
} from "../domain/shots";
import { choiceLabel, InlineText, requestScene, shotTotals, useSceneChoice } from "./common";

/** The fields of a shot the table can show, in its order [DEC-02, DEC-04]. */
export const SHOT_COLUMNS = [
  "size",
  "angle",
  "movement",
  "support",
  "lens",
  "camera",
  "frameRate",
  "sound",
  "characters",
  "action",
  "dialogue",
  "duration",
  "setup",
  "lighting",
  "effects",
  "notes",
] as const;
export type ShotColumn = (typeof SHOT_COLUMNS)[number];

export const HIDDEN_KEY = "oniric.shotlist.hidden";
export const DEFAULT_HIDDEN: ShotColumn[] = ["support", "camera", "frameRate", "sound", "lighting", "effects"];
/** The order the shots are listed in, set in the settings with the shown fields. */
export const ORDER_KEY = "oniric.shotlist.order";
/** Whether opening a scene folds the rest of the breakdown, as set in the settings: it does unless told otherwise. */
export const FOCUS_KEY = "oniric.shotlist.focus";

const CHOICE_COLUMNS = new Set<string>(Object.keys(SHOT_CHOICES));
const isChoice = (c: ShotColumn): c is ChoiceField => CHOICE_COLUMNS.has(c);
const LONG = new Set<ShotColumn>(["action", "dialogue", "notes", "lighting", "effects"]);

/** The width of each column of the table, to fit the page: the long texts share what is left, no narrower than LONG_MIN. */
const WIDTH: Partial<Record<ShotColumn, number>> = {
  size: 124,
  angle: 124,
  movement: 136,
  support: 116,
  sound: 104,
  lens: 76,
  camera: 112,
  frameRate: 76,
  duration: 80,
  setup: 104,
  characters: 140,
};
const LONG_MIN = 144;
const GRIP = 34;
const NUM = 52;
const MORE = 36;

export const columnLabel = (c: ShotColumn) => t(`shotlist.columns.${c}`);

type Shape = "table" | "cards";
export type ShotOrder = "edit" | "shoot";

/** The shots of a scene in the order of the edit, then as they will be shot: unnumbered ones last, in edit order. */
export function inShootOrder(shots: Shot[]): Shot[] {
  return [...shots].sort((a, b) => {
    if (a.shootOrder !== null && b.shootOrder !== null) return a.shootOrder - b.shootOrder;
    if (a.shootOrder !== null) return -1;
    if (b.shootOrder !== null) return 1;
    return a.rank < b.rank ? -1 : 1;
  });
}

function moved(list: Shot[], from: string, to: string, after: boolean): Shot[] {
  const item = list.find((s) => s.id === from);
  if (!item || from === to) return list;
  const rest = list.filter((s) => s.id !== from);
  const at = rest.findIndex((s) => s.id === to);
  rest.splice(after ? at + 1 : at, 0, item);
  return rest;
}

const isEmpty = (s: Shot) => !s.action && !s.dialogue && !s.notes && !s.frameImage && s.characters.length === 0;

/** A line of the breakdown above shots: an act, a sequence or a scene, each folding what follows it. */
type Head =
  | { kind: "act" | "seq"; id: string; num: string; title: string; level: number; scenes: string[] }
  | { kind: "scene"; id: string; scene: SceneInfo; level: number };

/** The technical breakdown: every scene of the script down the page, under its act and sequence, with its shots in a table or in cards [DEC-01 to DEC-07]. */
export function ShotlistView() {
  const { project, session, ask, notify, go } = useProject();
  const scenes = useScenes(session);
  const shots = useShots();
  const numbering = useNumbering();
  const ratio = useRatio();
  const story = useLive(loadStory, [...STORY_TABLES]);
  const [current, chooseScene] = useSceneChoice(project.id, scenes);
  const [shape, setShape] = useStoredState<Shape>("oniric.shotlist.shape", "table");
  const [hidden] = useStoredState<ShotColumn[]>(HIDDEN_KEY, DEFAULT_HIDDEN);
  const [order] = useStoredState<ShotOrder>(ORDER_KEY, "edit");
  const [focus] = useStoredState(FOCUS_KEY, true);
  const [foldList, setFoldList] = useStoredState<string[]>(`oniric.shotlist.folds.${project.id}`, []);
  const folded = useMemo(() => new Set(foldList), [foldList]);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    over?: string;
    after?: boolean;
  } | null>(null);
  const main = useRef<HTMLElement>(null);

  const perScene = useMemo(() => byScene(shots ?? []), [shots]);
  const listOf = (sceneId: string) => perScene.get(sceneId) ?? [];
  const shownOf = (sceneId: string) => (order === "shoot" ? inShootOrder(listOf(sceneId)) : listOf(sceneId));
  const numbers = useMemo(() => {
    const m = new Map<string, string>();
    for (const sc of scenes) (perScene.get(sc.id) ?? []).forEach((s, i) => m.set(s.id, shotNumber(sc.index + 1, i, numbering)));
    return m;
  }, [scenes, perScene, numbering]);
  const columns = SHOT_COLUMNS.filter((c) => !hidden.includes(c));

  // The acts and sequences of the story around the scenes, as the Scénario lists them; the scenes alone until it loads.
  const groups = useMemo(
    () => (story ? storyOutline(story, scenes.map((s) => s.id)) : [{ act: null, sequences: [{ sequence: null, scenes: scenes.map((s) => s.id) }] }]),
    [story, scenes],
  );
  const heads = useMemo(() => {
    const parts = numberedParts(groups);
    const sceneOf = new Map(scenes.map((s) => [s.id, s]));
    const out: Head[] = [];
    for (const g of groups) {
      if (g.act) out.push({ kind: "act", id: g.act.id, ...parts.get(g.act.id)!, level: 0, scenes: g.sequences.flatMap((q) => q.scenes) });
      if (g.act && folded.has(g.act.id)) continue;
      for (const q of g.sequences) {
        const level = g.act ? 1 : 0;
        if (q.sequence) out.push({ kind: "seq", id: q.sequence.id, ...parts.get(q.sequence.id)!, level, scenes: q.scenes });
        if (q.sequence && folded.has(q.sequence.id)) continue;
        for (const id of q.scenes) {
          const scene = sceneOf.get(id);
          if (scene) out.push({ kind: "scene", id, scene, level: level + (q.sequence ? 1 : 0) });
        }
      }
    }
    return out;
  }, [groups, scenes, folded]);
  const foldable = useMemo(
    () => [
      ...groups.flatMap((g) => [g.act?.id, ...g.sequences.map((q) => q.sequence?.id)].filter((x): x is string => !!x)),
      ...scenes.map((s) => s.id),
    ],
    [groups, scenes],
  );

  const toggle = (id: string) => setFoldList(folded.has(id) ? foldList.filter((x) => x !== id) : [...foldList, id]);

  // Opening a scene folds every other scene, sequence and act, and makes it the scene worked on; its line stays in view.
  const [reveal, setReveal] = useState<string | null>(null);
  const openScene = (id: string) => {
    const g = groups.find((x) => x.sequences.some((q) => q.scenes.includes(id)));
    const q = g?.sequences.find((x) => x.scenes.includes(id));
    const keep = new Set([id, g?.act?.id, q?.sequence?.id]);
    setFoldList(foldable.filter((x) => !keep.has(x)));
    chooseScene(id);
    setReveal(id);
  };
  useLayoutEffect(() => {
    if (!reveal) return;
    main.current?.querySelector(`[data-scene="${reveal}"]`)?.scrollIntoView({ block: "nearest" });
    setReveal(null);
  }, [reveal, heads]);

  // Opened from the Storyboard or a moodboard, the page starts at the scene it was on.
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (arrived.current || !story || !current) return;
    arrived.current = true;
    if (current.index > 0) main.current?.querySelector(`[data-scene="${current.id}"]`)?.scrollIntoView({ block: "start" });
  }, [story, current]);

  // The lines of the acts, sequences and scenes stay the width of the page while the table scrolls sideways.
  const hasScenes = scenes.length > 0;
  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const fit = new ResizeObserver(() => el.style.setProperty("--page", `${el.clientWidth}px`));
    fit.observe(el);
    return () => fit.disconnect();
  }, [hasScenes]);

  // A new shot gets the focus in its first field once it is listed.
  useLayoutEffect(() => {
    if (!focusId) return;
    const el = main.current?.querySelector<HTMLElement>(`[data-shot="${focusId}"] .rz-first`);
    if (el) {
      el.focus();
      setFocusId(null);
    }
  }, [focusId, shots]);

  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const patch = (s: Shot, p: ShotPatch) => void updateShot(s.id, p).catch(fail);

  const add = async (sceneId: string, after: Shot | null = null) => {
    try {
      await session.flush();
      const id = await addShot(sceneId, listOf(sceneId), after);
      chooseScene(sceneId);
      setSelected(id);
      setFocusId(id);
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (s: Shot) => {
    const n = numbers.get(s.id) ?? "";
    if (
      !isEmpty(s) &&
      !(await confirmRemoval(ask, {
        title: t("shotlist.deleteTitle", { n }),
        text: t("shotlist.deleteText"),
      }))
    )
      return;
    try {
      await deleteShot(s.id);
      if (selected === s.id) setSelected(null);
    } catch (e) {
      fail(e);
    }
  };

  const reorder = (next: Shot[]) => void (order === "shoot" ? setShootOrder(next) : reorderShots(next)).catch(fail);
  const step = (s: Shot, by: -1 | 1) => {
    const shown = shownOf(s.sceneId);
    const i = shown.findIndex((x) => x.id === s.id);
    const j = i + by;
    if (j < 0 || j >= shown.length) return;
    reorder(moved(shown, s.id, shown[j].id, by > 0));
  };

  // A shot moves within its scene only.
  const dragProps = (s: Shot) => ({
    "data-shot": s.id,
    draggable: drag?.id === s.id,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", s.id);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!drag || drag.id === s.id || !listOf(s.sceneId).some((x) => x.id === drag.id)) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const after = shape === "table" ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
      if (drag.over !== s.id || drag.after !== after) setDrag({ ...drag, over: s.id, after });
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (drag?.over) reorder(moved(shownOf(s.sceneId), drag.id, drag.over, !!drag.after));
      setDrag(null);
    },
    onDragEnd: () => setDrag(null),
  });

  const dropClass = (s: Shot) => (drag?.over === s.id ? (drag.after ? "drop-after" : "drop-before") : "");

  const menu = (s: Shot) => [
    {
      label: t("shotlist.insertAfter"),
      icon: Plus,
      onClick: () => void add(s.sceneId, s),
    },
    {
      label: t("shotlist.duplicate"),
      icon: Copy,
      onClick: () => void duplicateShot(s, listOf(s.sceneId)).catch(fail),
    },
    { label: t("shotlist.moveUp"), icon: ArrowUp, onClick: () => step(s, -1) },
    {
      label: t("shotlist.moveDown"),
      icon: ArrowDown,
      onClick: () => step(s, 1),
    },
    {
      label: t("shotlist.openFrame"),
      icon: LayoutPanelTop,
      onClick: () => {
        requestScene(s.sceneId);
        go("storyboard");
      },
    },
    {
      label: t("shotlist.delete"),
      icon: Trash2,
      danger: true,
      onClick: () => void remove(s),
    },
  ];

  // The scene of the shot worked on is the one the Storyboard opens on.
  const pick = (s: Shot) => {
    setSelected(s.id);
    if (s.sceneId !== current?.id) chooseScene(s.sceneId);
  };

  /** The folding line of an act, a sequence or a scene. */
  const headLine = (h: Head) => {
    const open = !folded.has(h.id);
    const here = h.kind === "scene" ? h.id === current?.id : !!current && h.scenes.includes(current.id);
    return (
      <div className={`rz-head rz-head-${h.kind}${here ? " here" : ""}`} style={{ "--level": h.level } as CSSProperties}>
        <button
          type="button"
          className="rz-fold"
          aria-expanded={open}
          onClick={() => (focus && h.kind === "scene" && !open ? openScene(h.id) : toggle(h.id))}
        >
          <ChevronRight className="rz-chevron" aria-hidden="true" />
          {h.kind === "scene" ? (
            <>
              <span className="rz-head-num">{h.scene.index + 1}</span>
              <span className="rz-head-title">{h.scene.heading || t("workspace.noHeading")}</span>
            </>
          ) : (
            <>
              <span className="rz-head-num">{h.num}</span>
              <span className="rz-head-title">{h.title}</span>
            </>
          )}
        </button>
        <span className="rz-head-meta">
          {h.kind === "scene" ? <SceneMeta shots={listOf(h.id)} /> : plural("sceneList.count", h.scenes.length)}
        </span>
      </div>
    );
  };

  // Table or cards, in a bar at the bottom of the page as the tools of the canvases; then unfold and fold all.
  const dock = (
    <div className="rz-dock" role="toolbar" aria-label={t("shotlist.shape")}>
      {(
        [
          ["table", Table2],
          ["cards", LayoutGrid],
        ] as const
      ).map(([id, Icon]) => (
        <button key={id} type="button" className={shape === id ? "on" : undefined} aria-pressed={shape === id} onClick={() => setShape(id)}>
          <Icon aria-hidden="true" />
          <span>{t(`shotlist.shapes.${id}`)}</span>
        </button>
      ))}
      <span className="mb-bar-sep" aria-hidden="true" />
      <button
        type="button"
        className="rz-dock-icon"
        aria-label={t("sceneList.unfold")}
        title={t("sceneList.unfold")}
        disabled={foldList.length === 0}
        onClick={() => setFoldList([])}
      >
        <ChevronsUpDown aria-hidden="true" />
      </button>
      <button
        type="button"
        className="rz-dock-icon"
        aria-label={t("sceneList.fold")}
        title={t("sceneList.fold")}
        disabled={foldable.every((id) => folded.has(id))}
        onClick={() => setFoldList(foldable)}
      >
        <ChevronsDownUp aria-hidden="true" />
      </button>
    </div>
  );

  if (scenes.length === 0) {
    return (
      <div className="view view-pad">
        <div className="empty-state">
          <h2>{t("shotlist.emptyTitle")}</h2>
          <p className="muted">{t("shotlist.emptyText")}</p>
          <button type="button" className="btn" onClick={() => go("script")}>
            {t("shotlist.toScript")}
          </button>
        </div>
      </div>
    );
  }

  const width = columns.length + (order === "shoot" ? 4 : 3);
  const tableMin = columns.reduce((n, c) => n + (WIDTH[c] ?? LONG_MIN), GRIP + NUM * (order === "shoot" ? 2 : 1) + MORE);

  const tableRows = (h: Head) => {
    const head = (
      <tr className={`rz-head-row rz-head-row-${h.kind}`}>
        <th colSpan={width} scope="rowgroup">
          {headLine(h)}
        </th>
      </tr>
    );
    if (h.kind !== "scene" || folded.has(h.id)) return <tbody key={h.id}>{head}</tbody>;
    return (
      <tbody key={h.id} data-scene={h.id} className="rz-scene" style={{ "--level": h.level } as CSSProperties}>
        {head}
        {shownOf(h.id).map((s, i) => (
          <tr
            key={s.id}
            {...dragProps(s)}
            className={[selected === s.id && "on", dropClass(s)].filter(Boolean).join(" ") || undefined}
            onFocusCapture={() => pick(s)}
            onClick={() => pick(s)}
          >
            <td className="rz-col-grip">
              <span className="grip" aria-hidden="true" onPointerDown={() => setDrag({ id: s.id })} onPointerUp={() => setDrag(null)}>
                <GripVertical />
              </span>
            </td>
            <td className="rz-col-num">
              <span className="rz-num">{numbers.get(s.id)}</span>
            </td>
            {order === "shoot" && <td className="rz-col-num rz-shoot">{i + 1}</td>}
            {columns.map((c, ci) => (
              <td key={c} className={`rz-col-${c}`}>
                <ShotField shot={s} column={c} scene={h.scene} first={ci === 0} clamp onPatch={(p) => patch(s, p)} />
              </td>
            ))}
            <td className="rz-col-more">
              <MoreMenu
                label={t("shotlist.shotMenu", {
                  n: numbers.get(s.id),
                })}
                items={menu(s)}
              />
            </td>
          </tr>
        ))}
        <tr className="rz-add-line">
          <td colSpan={width}>
            <button type="button" className="rz-add-row" onClick={() => void add(h.id)}>
              <Plus aria-hidden="true" />
              {t("shotlist.add")}
            </button>
          </td>
        </tr>
      </tbody>
    );
  };

  const cardBlock = (h: Head) => {
    if (h.kind !== "scene" || folded.has(h.id)) return <div key={h.id}>{headLine(h)}</div>;
    return (
      <section key={h.id} data-scene={h.id} className="rz-scene">
        {headLine(h)}
        <ol className="rz-cards" style={{ "--level": h.level } as CSSProperties}>
          {shownOf(h.id).map((s, i) => (
            <li
              key={s.id}
              {...dragProps(s)}
              className={["rz-card", selected === s.id && "on", dropClass(s)].filter(Boolean).join(" ")}
              onFocusCapture={() => pick(s)}
              onClick={() => pick(s)}
            >
              <header className="rz-card-head">
                <span className="grip" aria-hidden="true" onPointerDown={() => setDrag({ id: s.id })} onPointerUp={() => setDrag(null)}>
                  <GripVertical />
                </span>
                <span className="rz-num">{numbers.get(s.id)}</span>
                {order === "shoot" && <span className="badge">{t("shotlist.shootN", { n: i + 1 })}</span>}
                <span className="spacer" />
                {(s.duration || s.setup) && (
                  <span className="muted rz-card-time">{[formatSeconds(s.duration), formatMinutes(s.setup)].filter(Boolean).join(" · ")}</span>
                )}
                <MoreMenu label={t("shotlist.shotMenu", { n: numbers.get(s.id) })} items={menu(s)} />
              </header>
              {s.frameImage && (
                <div className="rz-card-frame" style={{ aspectRatio: String(ratioValue(ratio)) }}>
                  <MediaImage path={s.frameImage} alt={t("storyboard.frameOf", { n: numbers.get(s.id) })} />
                </div>
              )}
              <div className="rz-card-fields">
                {columns.map((c, ci) => (
                  <label key={c} className={LONG.has(c) || c === "characters" ? "rz-field wide" : "rz-field"}>
                    <span>{columnLabel(c)}</span>
                    <ShotField shot={s} column={c} scene={h.scene} first={ci === 0} onPatch={(p) => patch(s, p)} />
                  </label>
                ))}
              </div>
            </li>
          ))}
          <li className={listOf(h.id).length ? "rz-card-add" : "rz-card-add alone"}>
            <button type="button" onClick={() => void add(h.id)}>
              <Plus aria-hidden="true" />
              {t("shotlist.add")}
            </button>
          </li>
        </ol>
      </section>
    );
  };

  return (
    <div className="view rz-view">
      <main ref={main} className={shape === "table" ? "rz-main flush" : "rz-main"} aria-label={t("nav.views.shotlist")}>
        {shape === "table" ? (
          <table className="rz-table" style={{ minWidth: tableMin }}>
            <colgroup>
              <col style={{ width: GRIP }} />
              <col style={{ width: NUM }} />
              {order === "shoot" && <col style={{ width: NUM }} />}
              {columns.map((c) => (
                <col key={c} style={{ width: WIDTH[c] }} />
              ))}
              <col style={{ width: MORE }} />
            </colgroup>
            <thead>
              <tr>
                <th className="rz-col-grip" aria-label={t("shotlist.move")} />
                <th className="rz-col-num">{t("shotlist.columns.number")}</th>
                {order === "shoot" && <th className="rz-col-num">{t("shotlist.columns.shoot")}</th>}
                {columns.map((c) => (
                  <th key={c} className={`rz-col-${c}`} title={columnLabel(c)}>
                    {columnLabel(c)}
                  </th>
                ))}
                <th className="rz-col-more" aria-label={t("shotlist.actions")} />
              </tr>
            </thead>
            {heads.map(tableRows)}
          </table>
        ) : (
          <div className="rz-outline">{heads.map(cardBlock)}</div>
        )}
      </main>
      {dock}
    </div>
  );
}

function SceneMeta({ shots }: { shots: Shot[] }) {
  return <>{shots.length === 0 ? t("shotlist.noShotShort") : shotTotals(shots)}</>;
}

/** One field of a shot, as a cell of the table or a line of its card. */
function ShotField({
  shot,
  column,
  scene,
  first,
  clamp,
  onPatch,
}: {
  shot: Shot;
  column: ShotColumn;
  scene: SceneInfo | null;
  first: boolean;
  /** In the table, a long text shows its first lines until it is written in. */
  clamp?: boolean;
  onPatch: (p: ShotPatch) => void;
}) {
  const label = columnLabel(column);
  const cls = first ? "rz-first" : undefined;
  if (isChoice(column)) {
    return (
      <Select
        className={`rz-cell-select ${cls ?? ""}`}
        aria-label={label}
        value={shot[column] ?? ""}
        onChange={(e) => onPatch({ [column]: e.target.value || null })}
      >
        <option value="">—</option>
        {SHOT_CHOICES[column].map((id) => (
          <option key={id} value={id}>
            {choiceLabel(column, id)}
          </option>
        ))}
      </Select>
    );
  }
  if (column === "characters")
    return <CharacterPicker shot={shot} scene={scene} className={cls} onChange={(characters) => onPatch({ characters })} />;
  if (column === "duration") {
    return (
      <InlineText
        className={`rz-num-input ${cls ?? ""}`}
        label={label}
        value={shot.duration === null ? "" : String(shot.duration)}
        format={(v) => formatSeconds(v ? Number(v) : null)}
        parse={(v) => {
          if (!v.trim()) return "";
          const s = parseSeconds(v);
          return s === null ? null : String(s);
        }}
        onCommit={(v) => onPatch({ duration: v ? Number(v) : null })}
      />
    );
  }
  if (column === "setup") {
    return (
      <InlineText
        className={`rz-num-input ${cls ?? ""}`}
        label={label}
        value={shot.setup === null ? "" : String(shot.setup)}
        format={(v) => formatMinutes(v ? Number(v) : null)}
        parse={(v) => {
          if (!v.trim()) return "";
          const m = parseMinutes(v);
          return m === null ? null : String(m);
        }}
        onCommit={(v) => onPatch({ setup: v ? Number(v) : null })}
      />
    );
  }
  const key = column as "lens" | "camera" | "frameRate" | "action" | "dialogue" | "lighting" | "effects" | "notes";
  return (
    <InlineText
      className={cls}
      label={label}
      multiline={LONG.has(column)}
      clamp={clamp}
      placeholder={t(`shotlist.placeholders.${column}`, { defaultValue: "" }) || undefined}
      value={shot[key]}
      onCommit={(v) => onPatch({ [key]: v })}
    />
  );
}

/** The characters in the frame [DEC-02]: those of the scene to tick, and any other already set. */
function CharacterPicker({
  shot,
  scene,
  className,
  onChange,
}: {
  shot: Shot;
  scene: SceneInfo | null;
  className?: string;
  onChange: (v: string[]) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<CSSProperties | null>(null);
  const names = [...new Set([...(scene?.characters ?? []), ...shot.characters])];
  useEffect(() => {
    if (!at) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!pop.current?.contains(target) && !button.current?.contains(target)) setAt(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAt(null);
        button.current?.focus();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key, true);
    const scrolled = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) setAt(null);
    };
    window.addEventListener("scroll", scrolled, true);
    return () => {
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key, true);
    };
  }, [at]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`rz-inline rz-picker ${className ?? ""}`}
        aria-label={columnLabel("characters")}
        aria-haspopup="dialog"
        aria-expanded={!!at}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(
            at
              ? null
              : {
                  top: r.bottom + 4,
                  left: r.left,
                  minWidth: Math.max(200, r.width),
                },
          );
        }}
      >
        {shot.characters.length ? shot.characters.join(", ") : <span className="rz-placeholder">{t("shotlist.placeholders.characters")}</span>}
      </button>
      {at &&
        createPortal(
          <div ref={pop} className="project-menu more-menu rz-pop" style={at} role="dialog" aria-label={columnLabel("characters")}>
            {names.length === 0 ? (
              <p className="muted rz-pop-empty">{t("shotlist.noCharacter")}</p>
            ) : (
              <CheckList
                label={columnLabel("characters")}
                items={names.map((n) => ({
                  id: n,
                  label: n,
                  checked: shot.characters.includes(n),
                }))}
                onToggle={(n) => onChange(shot.characters.includes(n) ? shot.characters.filter((x) => x !== n) : [...shot.characters, n])}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
