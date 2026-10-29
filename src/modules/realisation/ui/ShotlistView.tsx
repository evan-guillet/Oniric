import {
  Copy,
  Eye,
  GripVertical,
  Images,
  LayoutGrid,
  ListTree,
  Plus,
  ScrollText,
  Table2,
  Trash2,
  ArrowDown,
  ArrowUp,
  LayoutPanelTop,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../core/db/live";
import { describeError } from "../../../core/errors";
import { t } from "../../../core/i18n";
import { CheckList } from "../../../ui-kit/CheckList";
import { confirmRemoval } from "../../../ui-kit/Dialog";
import { MoreMenu } from "../../../ui-kit/MoreMenu";
import { Segmented } from "../../../ui-kit/Segmented";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useProject } from "../../project/ui/projectContext";
import { useScenes, type SceneInfo } from "../../script/screenplay/application/scriptSession";
import { MediaImage } from "../../shared/media";
import { boardsFor } from "../application/moodboards";
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
  writeNumbering,
  ratioValue,
  type Shot,
  type ShotPatch,
} from "../application/shots";
import {
  coverable,
  coverage,
  formatMinutes,
  formatSeconds,
  parseMinutes,
  parseSeconds,
  shotNumber,
  SHOT_CHOICES,
  uncovered,
  type ChoiceField,
  type ShotNumbering,
} from "../domain/shots";
import { choiceLabel, InlineText, requestBoard, requestScene, SceneRail, sceneElements, shotTotals, useSceneChoice } from "./common";

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

const CHOICE_COLUMNS = new Set<string>(Object.keys(SHOT_CHOICES));
const isChoice = (c: ShotColumn): c is ChoiceField => CHOICE_COLUMNS.has(c);
const LONG = new Set<ShotColumn>(["action", "dialogue", "notes", "lighting", "effects"]);

export const columnLabel = (c: ShotColumn) => t(`shotlist.columns.${c}`);

type Panel = "scenes" | "text" | "display";
type Shape = "table" | "cards";
type Order = "edit" | "shoot";

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

/** The technical breakdown: each scene's shots, in a table or in cards, with what of the text they cover [DEC-01 to DEC-07]. */
export function ShotlistView() {
  const { project, session, headerActions, ask, notify, go } = useProject();
  const scenes = useScenes(session);
  const shots = useShots();
  const numbering = useNumbering();
  const ratio = useRatio();
  const [scene, chooseScene] = useSceneChoice(project.id, scenes);
  const [panel, setPanel] = useStoredState<Panel>("oniric.shotlist.panel", "scenes");
  const [shape, setShape] = useStoredState<Shape>("oniric.shotlist.shape", "table");
  const [hidden, setHidden] = useStoredState<ShotColumn[]>(HIDDEN_KEY, DEFAULT_HIDDEN);
  const [order, setOrder] = useState<Order>("edit");
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    over?: string;
    after?: boolean;
  } | null>(null);
  const main = useRef<HTMLElement>(null);

  const perScene = useMemo(() => byScene(shots ?? []), [shots]);
  const list = useMemo(() => (scene ? (perScene.get(scene.id) ?? []) : []), [perScene, scene]);
  const numbers = useMemo(() => new Map(list.map((s, i) => [s.id, shotNumber(scene ? scene.index + 1 : 0, i, numbering)])), [list, scene, numbering]);
  const shown = order === "shoot" ? inShootOrder(list) : list;
  const columns = SHOT_COLUMNS.filter((c) => !hidden.includes(c));
  const elements = useMemo(() => (scene ? sceneElements(scene) : []), [scene]);
  const missing = uncovered(elements, list);
  const boards = useLive(() => (scene ? boardsFor(scene.id) : Promise.resolve([])), ["moodboard", "moodboard_link"], [scene?.id]);

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

  const add = async (after: Shot | null = null) => {
    if (!scene) return;
    try {
      await session.flush();
      const id = await addShot(scene.id, list, after);
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
    const i = shown.findIndex((x) => x.id === s.id);
    const j = i + by;
    if (j < 0 || j >= shown.length) return;
    reorder(moved(shown, s.id, shown[j].id, by > 0));
  };

  const toggleCover = (text: string) => {
    const s = list.find((x) => x.id === selected);
    if (!s) return;
    const key = text.trim();
    const covers = s.covers.includes(key) ? s.covers.filter((c) => c !== key) : [...s.covers, key];
    void updateShot(s.id, { covers }, "Passage couvert").catch(fail);
  };

  const dragProps = (s: Shot) => ({
    "data-shot": s.id,
    draggable: drag?.id === s.id,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", s.id);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!drag || drag.id === s.id) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const after = shape === "table" ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
      if (drag.over !== s.id || drag.after !== after) setDrag({ ...drag, over: s.id, after });
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (drag?.over) reorder(moved(shown, drag.id, drag.over, !!drag.after));
      setDrag(null);
    },
    onDragEnd: () => setDrag(null),
  });

  const dropClass = (s: Shot) => (drag?.over === s.id ? (drag.after ? "drop-after" : "drop-before") : "");

  const menu = (s: Shot) => [
    {
      label: t("shotlist.insertAfter"),
      icon: Plus,
      onClick: () => void add(s),
    },
    {
      label: t("shotlist.duplicate"),
      icon: Copy,
      onClick: () => void duplicateShot(s, list).catch(fail),
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
        if (scene) requestScene(scene.id);
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

  const header = headerActions
    ? createPortal(
        <div className="header-tools">
          <Segmented
            label={t("shotlist.panel")}
            value={panel}
            onChange={setPanel}
            options={[
              {
                id: "scenes",
                label: t("shotlist.panels.scenes"),
                icon: ListTree,
              },
              {
                id: "text",
                label: t("shotlist.panels.text"),
                icon: ScrollText,
                hint: t("shotlist.panels.textHint"),
              },
              { id: "display", label: t("shotlist.panels.display"), icon: Eye },
            ]}
          />
          <Segmented
            label={t("shotlist.shape")}
            compact
            value={shape}
            onChange={setShape}
            options={[
              { id: "table", label: t("shotlist.shapes.table"), icon: Table2 },
              {
                id: "cards",
                label: t("shotlist.shapes.cards"),
                icon: LayoutGrid,
              },
            ]}
          />
          <button type="button" className="btn primary" disabled={!scene} onClick={() => void add()}>
            <Plus aria-hidden="true" />
            {t("shotlist.add")}
          </button>
        </div>,
        headerActions,
      )
    : null;

  if (scenes.length === 0) {
    return (
      <div className="view view-pad">
        {header}
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

  return (
    <div className="view split rz-split">
      {header}
      <main ref={main} className="rz-main" aria-label={t("nav.views.shotlist")}>
        {scene && (
          <header className="rz-scene-head">
            <div className="rz-scene-title">
              <span className="rz-scene-num">{t("shotlist.sceneNum", { n: scene.index + 1 })}</span>
              <h2 className="rz-slug">{scene.heading || t("workspace.noHeading")}</h2>
            </div>
            <div className="rz-scene-facts">
              <span className="muted">{shotTotals(list)}</span>
              {list.some((s) => s.covers.length > 0) &&
                (missing > 0 ? (
                  <button type="button" className="badge warn rz-cover-badge" onClick={() => setPanel("text")}>
                    {t("shotlist.uncovered", { count: missing })}
                  </button>
                ) : (
                  <span className="badge ok">{t("shotlist.allCovered")}</span>
                ))}
              {(boards ?? []).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="chip rz-board-chip"
                  title={t("shotlist.openBoard")}
                  onClick={() => {
                    requestBoard(b.id);
                    go("moodboard");
                  }}
                >
                  <Images aria-hidden="true" />
                  {b.name}
                </button>
              ))}
              <span className="spacer" />
              {list.length > 1 && (
                <Segmented
                  label={t("shotlist.order")}
                  value={order}
                  onChange={setOrder}
                  options={[
                    {
                      id: "edit",
                      label: t("shotlist.orders.edit"),
                      hint: t("shotlist.orders.editHint"),
                    },
                    {
                      id: "shoot",
                      label: t("shotlist.orders.shoot"),
                      hint: t("shotlist.orders.shootHint"),
                    },
                  ]}
                />
              )}
            </div>
          </header>
        )}
        {list.length === 0 ? (
          <div className="rz-empty">
            <p>{t("shotlist.noShot")}</p>
            <p className="muted">{t("shotlist.noShotHint")}</p>
            <button type="button" className="btn" onClick={() => void add()}>
              <Plus aria-hidden="true" />
              {t("shotlist.addFirst")}
            </button>
          </div>
        ) : shape === "table" ? (
          <div className="rz-table-wrap">
            <div className="rz-table-scroll">
              <table className="rz-table">
                <thead>
                  <tr>
                    <th className="rz-col-grip" aria-label={t("shotlist.move")} />
                    <th className="rz-col-num">{t("shotlist.columns.number")}</th>
                    {order === "shoot" && <th className="rz-col-num">{t("shotlist.columns.shoot")}</th>}
                    {columns.map((c) => (
                      <th key={c} className={`rz-col-${c}`}>
                        {columnLabel(c)}
                      </th>
                    ))}
                    <th className="rz-col-more" aria-label={t("shotlist.actions")} />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s, i) => (
                    <tr
                      key={s.id}
                      {...dragProps(s)}
                      className={[selected === s.id && "on", dropClass(s)].filter(Boolean).join(" ") || undefined}
                      onFocusCapture={() => setSelected(s.id)}
                      onClick={() => setSelected(s.id)}
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
                          <ShotField shot={s} column={c} scene={scene} first={ci === 0} onPatch={(p) => patch(s, p)} />
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
                </tbody>
              </table>
            </div>
            <button type="button" className="rz-add-row" onClick={() => void add()}>
              <Plus aria-hidden="true" />
              {t("shotlist.add")}
            </button>
          </div>
        ) : (
          <ol className="rz-cards">
            {shown.map((s, i) => (
              <li
                key={s.id}
                {...dragProps(s)}
                className={["rz-card", selected === s.id && "on", dropClass(s)].filter(Boolean).join(" ")}
                onFocusCapture={() => setSelected(s.id)}
                onClick={() => setSelected(s.id)}
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
                      <ShotField shot={s} column={c} scene={scene} first={ci === 0} onPatch={(p) => patch(s, p)} />
                    </label>
                  ))}
                </div>
              </li>
            ))}
            <li className="rz-card-add">
              <button type="button" onClick={() => void add()}>
                <Plus aria-hidden="true" />
                {t("shotlist.add")}
              </button>
            </li>
          </ol>
        )}
      </main>
      <aside className="view-side rz-side" aria-label={t(`shotlist.panels.${panel}`)}>
        {panel === "scenes" && (
          <SceneRail
            scenes={scenes}
            current={scene?.id ?? null}
            onSelect={(id) => {
              chooseScene(id);
              setSelected(null);
            }}
            meta={(sc) => <SceneMeta scene={sc} shots={perScene.get(sc.id) ?? []} />}
          />
        )}
        {panel === "text" && scene && (
          <CoveragePanel scene={scene} shots={list} numbers={numbers} selected={list.find((s) => s.id === selected) ?? null} onToggle={toggleCover} />
        )}
        {panel === "display" && (
          <DisplayPanel hidden={hidden} onHidden={setHidden} numbering={numbering} onNumbering={(v) => void writeNumbering(v).catch(fail)} />
        )}
      </aside>
    </div>
  );
}

function SceneMeta({ scene, shots }: { scene: SceneInfo; shots: Shot[] }) {
  if (shots.length === 0) return <>{t("shotlist.noShotShort")}</>;
  const missing = uncovered(sceneElements(scene), shots);
  return (
    <>
      {shotTotals(shots)}
      {missing > 0 && <span className="rz-meta-warn"> · {t("shotlist.uncovered", { count: missing })}</span>}
    </>
  );
}

/** One field of a shot, as a cell of the table or a line of its card. */
function ShotField({
  shot,
  column,
  scene,
  first,
  onPatch,
}: {
  shot: Shot;
  column: ShotColumn;
  scene: SceneInfo | null;
  first: boolean;
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

/** The text of the scene, each passage with the shots that cover it; with a shot chosen, a click covers or uncovers [DEC-03]. */
function CoveragePanel({
  scene,
  shots,
  numbers,
  selected,
  onToggle,
}: {
  scene: SceneInfo;
  shots: Shot[];
  numbers: Map<string, string>;
  selected: Shot | null;
  onToggle: (text: string) => void;
}) {
  const elements = coverable(sceneElements(scene));
  const covered = coverage(sceneElements(scene), shots);
  const active = shots.some((s) => s.covers.length > 0);
  const key = (text: string) => text.trim().replace(/\s+/g, " ");
  return (
    <div className="rz-coverage">
      <p className="rz-coverage-lead">
        {selected ? (
          <>
            {t("shotlist.coverFor")} <strong>{numbers.get(selected.id)}</strong>
          </>
        ) : (
          <span className="muted">{t("shotlist.coverHint")}</span>
        )}
      </p>
      {elements.length === 0 ? (
        <p className="muted">{t("shotlist.noText")}</p>
      ) : (
        <ol className="rz-passages">
          {elements.map((e, i) => {
            const by = covered[i].map((si) => numbers.get(shots[si].id) ?? "");
            const mine = !!selected && selected.covers.some((c) => key(c) === key(e.text));
            return (
              <li key={i}>
                <button
                  type="button"
                  className={["rz-passage", `el-${e.type}`, mine && "on", active && by.length === 0 && "missing"].filter(Boolean).join(" ")}
                  aria-pressed={selected ? mine : undefined}
                  disabled={!selected}
                  onClick={() => onToggle(e.text)}
                >
                  <span className="rz-passage-text">{e.text}</span>
                  <span className="rz-passage-by">
                    {by.length > 0 ? (
                      by.map((n) => (
                        <span key={n} className="rz-by">
                          {n}
                        </span>
                      ))
                    ) : active ? (
                      <span className="rz-by-missing">{t("shotlist.notCovered")}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function DisplayPanel({
  hidden,
  onHidden,
  numbering,
  onNumbering,
}: {
  hidden: ShotColumn[];
  onHidden: (v: ShotColumn[]) => void;
  numbering: ShotNumbering;
  onNumbering: (v: ShotNumbering) => void;
}) {
  return (
    <div className="rz-display">
      <p className="check-list-title">{t("shotlist.numbering")}</p>
      <div className="check-list" role="radiogroup" aria-label={t("shotlist.numbering")}>
        {(["dash", "letter"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={numbering === v} onClick={() => onNumbering(v)}>
            <span className="check-box radio" aria-hidden="true" />
            <span className="more-item">
              {t(`shotlist.numberings.${v}`)}
              <span className="more-item-hint">{t(`shotlist.numberings.${v}Hint`)}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="check-list-title">{t("shotlist.shownColumns")}</p>
      <CheckList
        label={t("shotlist.shownColumns")}
        items={SHOT_COLUMNS.map((c) => ({
          id: c,
          label: columnLabel(c),
          checked: !hidden.includes(c),
        }))}
        onToggle={(c) => onHidden(hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c])}
      />
    </div>
  );
}
