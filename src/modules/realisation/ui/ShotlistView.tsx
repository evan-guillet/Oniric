import {
  Copy,
  GripVertical,
  Plus,
  Trash2,
  ArrowDown,
  ArrowUp,
  Brush,
  ImageOff,
  ImagePlus,
  Images,
  Maximize2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { describeError } from "../../../core/errors";
import { plural, t } from "../../../core/i18n";
import { CheckList } from "../../../ui-kit/CheckList";
import { confirmRemoval } from "../../../ui-kit/Dialog";
import { FloatingMenu, MoreMenu, type MoreItem } from "../../../ui-kit/MoreMenu";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useProject } from "../../project/ui/projectContext";
import { useScenes, type SceneInfo } from "../../script/screenplay/application/scriptSession";
import { pickImage, storeImage } from "../../shared/media";
import {
  addShot,
  byScene,
  deleteShot,
  duplicateShot,
  reorderShots,
  setShootOrder,
  updateShot,
  useAbbreviations,
  useNumbering,
  useRatio,
  useShots,
  ratioValue,
  type Abbreviations,
  type Shot,
  type ShotPatch,
} from "../application/shots";
import {
  formatMinutes,
  formatSeconds,
  parseMinutes,
  parseSeconds,
  shotNumber,
  MOVEMENT_FAMILIES,
  SHOT_CHOICES,
  SHOT_MOVEMENTS,
  type ChoiceField,
} from "../domain/shots";
import { choiceLabel, InlineText, ScenePicker, shotTotals, useSceneChoice } from "./common";
import { DrawDialog } from "./DrawDialog";
import { BoardImagePicker, FrameThumb, FrameViewer, ratioName } from "./FrameViewer";

/** The fields of a shot the table can show, in its order [DEC-02, DEC-04]. */
export const SHOT_COLUMNS = [
  "frame",
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
/** Table or cards, as set in the settings. */
export const SHAPE_KEY = "oniric.shotlist.shape";

const CHOICE_COLUMNS = new Set<string>(Object.keys(SHOT_CHOICES));
const isChoice = (c: ShotColumn): c is ChoiceField => CHOICE_COLUMNS.has(c);
/** The movements listed under their family, folded, rather than on their own. */
const FAMILY_OF = new Set<string>(Object.values(MOVEMENT_FAMILIES).flat());
const LONG = new Set<ShotColumn>(["action", "dialogue", "notes", "lighting", "effects"]);

/** The width of each column of the table, to fit the page: the long texts share what is left, no narrower than LONG_MIN. */
const WIDTH: Partial<Record<ShotColumn, number>> = {
  frame: 104,
  size: 124,
  angle: 124,
  movement: 168,
  support: 116,
  sound: 104,
  lens: 100,
  camera: 112,
  frameRate: 76,
  duration: 80,
  setup: 104,
  characters: 140,
};
const LONG_MIN = 288;

/** The focal lengths offered for the lens, those of a series of primes; any other is written in. */
const LENSES = ["14", "16", "18", "21", "24", "25", "28", "32", "35", "40", "50", "65", "75", "85", "100", "135"].map((f) => `${f}\u00a0mm`);
const OTHER = "\u0000other";
/** « 50mm », « 50 MM » and « 50 mm » are the same lens. */
const lensKey = (v: string) => v.replace(/\s+/g, "").toLowerCase();
const GRIP = 34;
const NUM = 52;
const MORE = 36;

export const columnLabel = (c: ShotColumn) => t(`shotlist.columns.${c}`);

/** A column at least as wide as its name, which is never cut nor sent to the line. */
let measure: CanvasRenderingContext2D | null = null;
function nameWidth(c: ShotColumn): number {
  measure ??= document.createElement("canvas").getContext("2d");
  if (!measure) return 0;
  measure.font = `500 11.5px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(measure.measureText(columnLabel(c)).width) + 18;
}
const columnWidth = (c: ShotColumn) => {
  const w = WIDTH[c];
  return w === undefined ? undefined : Math.max(w, nameWidth(c));
};

export type ShotShape = "table" | "cards";
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

/** Lower case and without accents, so « eclair » finds « Éclair ». */
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Everything a search can find in a shot: its texts, its characters and the names of its choices. */
const shotText = (s: Shot) =>
  plain(
    [
      s.action,
      s.dialogue,
      s.notes,
      s.lighting,
      s.effects,
      s.lens,
      s.camera,
      s.frameRate,
      ...s.characters,
      ...(Object.keys(SHOT_CHOICES) as ChoiceField[]).map((f) => (s[f] ? choiceLabel(f, s[f]) : "")),
    ].join("\n"),
  );

/** A scene of the breakdown and the line above its shots. */
type Head = { id: string; scene: SceneInfo };

/** The technical breakdown: the shots of one scene, in a table or in cards, chosen in the tree of acts, sequences and scenes on the right; a search lists every scene it finds [DEC-01 to DEC-07]. */
export function ShotlistView() {
  const { project, session, ask, notify, go } = useProject();
  const scenes = useScenes(session);
  const shots = useShots();
  const numbering = useNumbering();
  const abbr = useAbbreviations();
  const ratio = useRatio();
  const [current, chooseScene] = useSceneChoice(project.id, scenes);
  const [shape] = useStoredState<ShotShape>(SHAPE_KEY, "table");
  const [hidden] = useStoredState<ShotColumn[]>(HIDDEN_KEY, DEFAULT_HIDDEN);
  const [order] = useStoredState<ShotOrder>(ORDER_KEY, "edit");
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    over?: string;
    after?: boolean;
  } | null>(null);
  const main = useRef<HTMLElement>(null);
  // The frame shown in large, and the frame being drawn or taken from a moodboard.
  const [viewing, setViewing] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<Shot | null>(null);
  const [picking, setPicking] = useState<Shot | null>(null);
  // The menu of an empty frame: draw it, import an image or take one from a moodboard.
  const [filling, setFilling] = useState<{ shot: Shot; top: number; left: number } | null>(null);
  const fillAnchor = useRef<HTMLElement | null>(null);

  const perScene = useMemo(() => byScene(shots ?? []), [shots]);
  const listOf = (sceneId: string) => perScene.get(sceneId) ?? [];
  const shownOf = (sceneId: string) => (order === "shoot" ? inShootOrder(listOf(sceneId)) : listOf(sceneId));

  // While searching, the scenes whose heading or shots hold the text, with only those shots unless the heading holds it.
  const [query, setQuery] = useState("");
  const needle = plain(query.trim());
  const found = useMemo(() => {
    if (!needle) return null;
    const m = new Map<string, Set<string>>();
    for (const sc of scenes) {
      const all = perScene.get(sc.id) ?? [];
      const hits = String(sc.index + 1) === needle || plain(sc.heading).includes(needle) ? all : all.filter((s) => shotText(s).includes(needle));
      if (hits.length || plain(sc.heading).includes(needle)) m.set(sc.id, new Set(hits.map((s) => s.id)));
    }
    return m;
  }, [needle, scenes, perScene]);
  const seenOf = (sceneId: string) => {
    const shown = shownOf(sceneId);
    const hits = found?.get(sceneId);
    return hits ? shown.filter((s) => hits.has(s.id)) : shown;
  };
  const numbers = useMemo(() => {
    const m = new Map<string, string>();
    for (const sc of scenes) (perScene.get(sc.id) ?? []).forEach((s, i) => m.set(s.id, shotNumber(sc.index + 1, i, numbering)));
    return m;
  }, [scenes, perScene, numbering]);
  const columns = SHOT_COLUMNS.filter((c) => !hidden.includes(c));
  // The first field written in: the frame is a button, not a field.
  const firstField = columns.find((c) => c !== "frame");
  const frameRatio = ratioValue(ratio);

  // The scene chosen, or while searching every scene the search finds.
  const heads = useMemo<Head[]>(
    () => (found ? scenes.filter((sc) => found.has(sc.id)) : current ? [current] : []).map((scene) => ({ id: scene.id, scene })),
    [found, scenes, current],
  );

  // The frames the viewer goes through with ↑ and ↓: those drawn among the shots shown, scene after scene.
  const framed = heads.flatMap((h) => seenOf(h.id)).filter((s) => s.frameImage);
  const viewIndex = viewing ? framed.findIndex((s) => s.id === viewing) : -1;
  const closeViewer = () => {
    const id = viewing;
    setViewing(null);
    // Back on the line of the shot last seen.
    requestAnimationFrame(() => main.current?.querySelector<HTMLElement>(`[data-shot="${id}"] .rz-thumb`)?.focus());
  };

  // Another scene starts from the top of its shots.
  useLayoutEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [current?.id]);

  // Ctrl+F shows the search, unless a dialog is open; it goes away once left empty.
  const searchField = useRef<HTMLInputElement>(null);
  const [finding, setFinding] = useState(false);
  useLayoutEffect(() => {
    if (finding) searchField.current?.focus();
  }, [finding]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      setFinding(true);
      searchField.current?.focus();
      searchField.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // A search starts from the top of what it finds.
  useLayoutEffect(() => {
    if (needle && main.current) main.current.scrollTop = 0;
  }, [needle]);

  // The line of the scene stays the width of the page while the table scrolls sideways, and so do the grip and number of each shot.
  const hasScenes = scenes.length > 0;
  const [sideways, setSideways] = useState(false);
  // Wider than the page, the table is dragged sideways from the empty space below it.
  const [pans, setPans] = useState(false);
  const pan = useRef<{ x: number; left: number } | null>(null);
  const [panning, setPanning] = useState(false);
  useEffect(() => {
    const el = main.current;
    if (!el) return;
    const fit = new ResizeObserver(() => {
      el.style.setProperty("--page", `${el.clientWidth}px`);
      setPans(el.scrollWidth > el.clientWidth);
    });
    fit.observe(el);
    const table = el.querySelector("table");
    if (table) fit.observe(table);
    // Once it has, the frozen columns show their edge.
    const scrolled = () => setSideways(el.scrollLeft > 0);
    el.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      fit.disconnect();
      el.removeEventListener("scroll", scrolled);
    };
  }, [hasScenes, shape]);

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
  const patch = (s: Shot, p: ShotPatch, label?: string) => void updateShot(s.id, p, label).catch(fail);

  const openFrame = (s: Shot, el?: HTMLElement) => {
    setSelected(s.id);
    if (s.frameImage) {
      setViewing(s.id);
    } else if (el) {
      const r = el.getBoundingClientRect();
      fillAnchor.current = el;
      setFilling({ shot: s, top: r.bottom + 4, left: r.left });
    }
  };
  const importInto = async (s: Shot) => {
    try {
      const [path] = await pickImage();
      if (path) await updateShot(s.id, { frameImage: path }, "Image de la case");
    } catch (e) {
      fail(e);
    }
  };
  const clearImage = async (s: Shot) => {
    const n = numbers.get(s.id) ?? "";
    if (!(await confirmRemoval(ask, { title: t("storyboard.clearTitle", { n }), text: t("storyboard.clearText"), label: t("common.removeAction") }))) return;
    patch(s, { frameImage: null }, "Image retirée de la case");
  };

  const frameItems = (s: Shot): MoreItem[] => [
    { label: t(s.frameImage ? "storyboard.drawOver" : "storyboard.drawIt"), icon: Brush, onClick: () => setDrawing(s) },
    { label: t(s.frameImage ? "storyboard.changeImage" : "storyboard.import"), icon: ImagePlus, onClick: () => void importInto(s) },
    { label: t("storyboard.fromBoard"), icon: Images, onClick: () => setPicking(s) },
    ...(s.frameImage ? [{ label: t("storyboard.clear"), icon: ImageOff, onClick: () => void clearImage(s) }] : []),
  ];

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

  const menu = (s: Shot): MoreItem[] => [
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
    ...(s.frameImage ? [{ label: t("shotlist.openFrame"), icon: Maximize2, onClick: () => openFrame(s) }] : []),
    ...frameItems(s),
    {
      label: t("shotlist.delete"),
      icon: Trash2,
      danger: true,
      onClick: () => void remove(s),
    },
  ];

  // The scene of the shot worked on is the one the Découpage opens on next time.
  const pick = (s: Shot) => {
    setSelected(s.id);
    if (s.sceneId !== current?.id) chooseScene(s.sceneId);
  };

  /**
   * The line of a scene above its shots: it drops the tree of the screenplay to go to another scene; among the scenes
   * a search found, it ends the search and opens that scene alone.
   */
  const headLine = (h: Head) => {
    const inner = (
      <>
        <span className="rz-head-num">{h.scene.index + 1}</span>
        <span className="rz-head-title">{h.scene.heading || t("workspace.noHeading")}</span>
      </>
    );
    return (
      <div className={`rz-head rz-head-scene${h.id === current?.id ? " here" : ""}`}>
        {found ? (
          <button
            type="button"
            className="rz-fold"
            onClick={() => {
              setQuery("");
              setFinding(false);
              chooseScene(h.id);
            }}
          >
            {inner}
          </button>
        ) : (
          <ScenePicker projectId={project.id} scenes={scenes} current={current?.id ?? null} onSelect={chooseScene} meta={(sc) => <SceneMeta shots={listOf(sc.id)} />}>
            {inner}
          </ScenePicker>
        )}
        <span className="rz-head-meta">
          <SceneMeta shots={listOf(h.id)} />
        </span>
      </div>
    );
  };

  // The search, over the top of the page while it is open.
  const search = (finding || query) && (
    <div className="rz-find" role="search">
      <input
        ref={searchField}
        type="search"
        className="rz-search"
        value={query}
        placeholder={t("shotlist.search")}
        aria-label={t("shotlist.searchLabel")}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => {
          if (!query) setFinding(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          if (query) setQuery("");
          else {
            setFinding(false);
            main.current?.focus();
          }
        }}
      />
      {found && (
        <span className="rz-search-count" aria-live="polite">
          {plural("sceneList.count", found.size)}
        </span>
      )}
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
  const tableMin = columns.reduce((n, c) => n + (columnWidth(c) ?? Math.max(LONG_MIN, nameWidth(c))), GRIP + NUM * (order === "shoot" ? 2 : 1) + MORE);

  const tableRows = (h: Head) => {
    const head = (
      <tr className="rz-head-row">
        <th colSpan={width} scope="rowgroup">
          {headLine(h)}
        </th>
      </tr>
    );
    const shown = shownOf(h.id);
    return (
      <tbody key={h.id} data-scene={h.id} className="rz-scene">
        {head}
        {seenOf(h.id).map((s) => (
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
            {order === "shoot" && <td className="rz-col-num rz-shoot">{shown.indexOf(s) + 1}</td>}
            {columns.map((c) => (
              <td key={c} className={`rz-col-${c}`}>
                {c === "frame" ? (
                  <FrameThumb shot={s} n={numbers.get(s.id) ?? ""} ratio={frameRatio} onOpen={(el) => openFrame(s, el)} />
                ) : (
                  <ShotField shot={s} column={c} scene={h.scene} first={c === firstField} abbr={abbr} clamp onPatch={(p) => patch(s, p)} />
                )}
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
    const shown = shownOf(h.id);
    return (
      <section key={h.id} data-scene={h.id} className="rz-scene">
        {headLine(h)}
        <ol className="rz-cards">
          {seenOf(h.id).map((s) => (
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
                {order === "shoot" && <span className="badge">{t("shotlist.shootN", { n: shown.indexOf(s) + 1 })}</span>}
                <span className="spacer" />
                {(s.duration || s.setup) && (
                  <span className="muted rz-card-time">{[formatSeconds(s.duration), formatMinutes(s.setup)].filter(Boolean).join(" · ")}</span>
                )}
                <MoreMenu label={t("shotlist.shotMenu", { n: numbers.get(s.id) })} items={menu(s)} />
              </header>
              {columns.includes("frame") && <FrameThumb shot={s} n={numbers.get(s.id) ?? ""} ratio={frameRatio} wide onOpen={(el) => openFrame(s, el)} />}
              <div className="rz-card-fields">
                {columns
                  .filter((c) => c !== "frame")
                  .map((c) => (
                    <label key={c} className={LONG.has(c) || c === "characters" ? "rz-field wide" : "rz-field"}>
                      <span>{columnLabel(c)}</span>
                      <ShotField shot={s} column={c} scene={h.scene} first={c === firstField} abbr={abbr} onPatch={(p) => patch(s, p)} />
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
      <main
        ref={main}
        tabIndex={-1}
        className={["rz-main", shape === "table" && "flush", sideways && "scrolled", shape === "table" && pans && "pans", panning && "panning"]
          .filter(Boolean)
          .join(" ")}
        aria-label={t("nav.views.shotlist")}
        onPointerDown={(e) => {
          const el = e.currentTarget;
          if (shape !== "table" || !pans || e.button !== 0 || e.target !== el) return;
          // The scroll bars keep their own handling.
          const box = el.getBoundingClientRect();
          if (e.clientX - box.left >= el.clientWidth || e.clientY - box.top >= el.clientHeight) return;
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          pan.current = { x: e.clientX, left: el.scrollLeft };
          setPanning(true);
        }}
        onPointerMove={(e) => {
          if (pan.current) e.currentTarget.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
        }}
        onPointerUp={() => {
          pan.current = null;
          setPanning(false);
        }}
        onPointerCancel={() => {
          pan.current = null;
          setPanning(false);
        }}
      >
        {shape === "table" ? (
          <table className="rz-table" style={{ minWidth: tableMin, "--grip-w": `${GRIP}px`, "--num-w": `${NUM}px` } as CSSProperties}>
            <colgroup>
              <col style={{ width: GRIP }} />
              <col style={{ width: NUM }} />
              {order === "shoot" && <col style={{ width: NUM }} />}
              {columns.map((c) => (
                <col key={c} style={{ width: columnWidth(c) }} />
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
        {found?.size === 0 && <p className="rz-none">{t("shotlist.noMatch", { query: query.trim() })}</p>}
      </main>
      {search}
      {viewIndex >= 0 && (
        <FrameViewer
          shots={framed}
          index={viewIndex}
          numberOf={(s) => numbers.get(s.id) ?? ""}
          ratio={frameRatio}
          onMove={(i) => {
            setViewing(framed[i].id);
            setSelected(framed[i].id);
          }}
          onClose={closeViewer}
        />
      )}
      {filling && (
        <FloatingMenu
          items={frameItems(filling.shot)}
          anchor={fillAnchor}
          style={{ top: filling.top, left: filling.left }}
          onClose={() => setFilling(null)}
        />
      )}
      {drawing && (
        <DrawDialog
          ratio={frameRatio}
          ratioLabel={ratioName(ratio)}
          background={drawing.frameImage}
          title={t("storyboard.draw.title", { n: numbers.get(drawing.id) ?? "" })}
          onClose={() => setDrawing(null)}
          onSave={async (png) => {
            try {
              const path = await storeImage(png, "storyboard", `${project.title} ${numbers.get(drawing.id) ?? ""}`);
              await updateShot(drawing.id, { frameImage: path }, "Case dessinée");
            } catch (e) {
              fail(e);
            }
          }}
        />
      )}
      {picking && <BoardImagePicker onPick={(path) => patch(picking, { frameImage: path }, "Image de la case")} onClose={() => setPicking(null)} />}
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
  abbr,
  clamp,
  onPatch,
}: {
  shot: Shot;
  column: ShotColumn;
  scene: SceneInfo | null;
  first: boolean;
  abbr: Abbreviations;
  /** In the table, a long text shows its first lines until it is written in. */
  clamp?: boolean;
  onPatch: (p: ShotPatch) => void;
}) {
  const label = columnLabel(column);
  const cls = first ? "rz-first" : undefined;
  if (column === "frame") return null;
  if (isChoice(column)) {
    const value = shot[column] ?? "";
    // Abbreviated, the cell keeps the whole name for the pointer.
    const short = value ? abbr[`${column}.${value}`] : undefined;
    return (
      <Select
        className={`rz-cell-select ${cls ?? ""}`}
        aria-label={label}
        display={short}
        title={short ? choiceLabel(column, value) : undefined}
        value={value}
        onChange={(e) => onPatch({ [column]: e.target.value || null })}
      >
        <option value=""><span className="rz-placeholder">—</span></option>
        {column === "movement" ? (
          <>
            {SHOT_MOVEMENTS.filter((id) => !FAMILY_OF.has(id)).map((id) => (
              <option key={id} value={id}>
                {choiceLabel(column, id)}
              </option>
            ))}
            {Object.entries(MOVEMENT_FAMILIES).map(([family, ids]) => (
              <optgroup key={family} label={choiceLabel(column, family)}>
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {choiceLabel(column, id)}
                  </option>
                ))}
              </optgroup>
            ))}
          </>
        ) : (
          SHOT_CHOICES[column].map((id) => (
            <option key={id} value={id}>
              {choiceLabel(column, id)}
            </option>
          ))
        )}
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
        placeholder="—"
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
        placeholder="—"
        onCommit={(v) => onPatch({ setup: v ? Number(v) : null })}
      />
    );
  }
  if (column === "lens") return <LensField value={shot.lens} label={label} className={cls} onCommit={(lens) => onPatch({ lens })} />;
  const key = column as "camera" | "frameRate" | "action" | "dialogue" | "lighting" | "effects" | "notes";
  return (
    <InlineText
      className={cls}
      label={label}
      multiline={LONG.has(column)}
      clamp={clamp}
      placeholder="—"
      value={shot[key]}
      onCommit={(v) => onPatch({ [key]: v })}
    />
  );
}

/** The lens: a focal length from the list, or one written in from its last line. */
function LensField({ value, label, className, onCommit }: { value: string; label: string; className?: string; onCommit: (v: string) => void }) {
  const [writing, setWriting] = useState(false);
  const cancelled = useRef(false);
  const listed = LENSES.find((l) => lensKey(l) === lensKey(value));
  if (writing) {
    return (
      <input
        autoFocus
        className={`rz-inline ${className ?? ""}`}
        aria-label={label}
        defaultValue={listed ? "" : value}
        placeholder={t("shotlist.lensOther")}
        onBlur={(e) => {
          setWriting(false);
          const next = e.currentTarget.value.trim();
          if (!cancelled.current && next && next !== value) onCommit(next);
          cancelled.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancelled.current = true;
            e.stopPropagation();
            e.currentTarget.blur();
          } else if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
    );
  }
  return (
    <Select
      className={`rz-cell-select ${className ?? ""}`}
      aria-label={label}
      value={listed ?? value}
      onChange={(e) => (e.target.value === OTHER ? setWriting(true) : onCommit(e.target.value))}
    >
      <option value=""><span className="rz-placeholder">—</span></option>
      {LENSES.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
      {value && !listed && <option value={value}>{value}</option>}
      <option value={OTHER}>{t("shotlist.lensOther")}</option>
    </Select>
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
