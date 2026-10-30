import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Droplet,
  Hand,
  ImagePlus,
  LayoutGrid,
  Link2,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  Palette,
  Pencil,
  Plus,
  Square,
  StickyNote,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLive } from "../../../core/db/live";
import { describeError } from "../../../core/errors";
import { t } from "../../../core/i18n";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { ContextMenu, MoreMenu, type MoreItem } from "../../../ui-kit/MoreMenu";
import { Segmented } from "../../../ui-kit/Segmented";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useProject } from "../../project/ui/projectContext";
import { loadEntries, loadTypes } from "../../script/bible/application/bible";
import { useScenes } from "../../script/screenplay/application/scriptSession";
import { isStorableImage, MediaImage, pickImage, readImage, storeImage } from "../../shared/media";
import {
  addBoard,
  addItems,
  BOARD_KINDS,
  BOARD_TABLES,
  deleteBoard,
  deleteItems,
  loadBoards,
  loadItems,
  setBoardLinks,
  updateBoard,
  updateItems,
  type Board,
  type BoardItem,
  type BoardKind,
  type NewItem,
} from "../application/moodboards";
import { extractPalette, inkOn, mergePalettes, type Swatch } from "../domain/palette";
import { takeBoardRequest } from "./common";

type Panel = "palette" | "links";
type Geometry = Pick<BoardItem, "x" | "y" | "w" | "h">;
type View = { x: number; y: number; k: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
/** A new image is laid out at most this wide or high; it can be resized afterwards. */
const IMAGE_SIDE = 320;
const MIN_SIDE = 20;
/** The grid of the board: what moves and sizes snap to, and the dots of the canvas. */
const GRID = 20;
const snapTo = (v: number) => Math.round(v / GRID) * GRID;
/** How close on screen an edge must come to another one's to line up with it. */
const GUIDE_PX = 8;
/** The size of what a click of a tool lays down; a drag chooses another. */
const PLACED = {
  note: { w: 220, h: 160 },
  text: { w: 280, h: 60 },
  color: { w: 140, h: 140 },
} as const;

/** The colours of the notes; the first, the yellow of the theme, has no code of its own. */
export const NOTE_COLORS = [
  { id: "yellow", hex: null },
  { id: "orange", hex: "#ffd3b0" },
  { id: "red", hex: "#ffc6c0" },
  { id: "pink", hex: "#fbcde6" },
  { id: "violet", hex: "#ded3fc" },
  { id: "blue", hex: "#c8ddfb" },
  { id: "teal", hex: "#c4eaec" },
  { id: "green", hex: "#cbeacc" },
  { id: "gray", hex: "#e4e4e8" },
] as const;
const SWATCHES = [
  { id: "black", hex: "#1f2128" },
  { id: "red", hex: "#e5484d" },
  { id: "orange", hex: "#f08c3a" },
  { id: "yellow", hex: "#f2c94c" },
  { id: "green", hex: "#3fbf74" },
  { id: "blue", hex: "#2a8af4" },
  { id: "violet", hex: "#7c5ce0" },
  { id: "pink", hex: "#ec6fae" },
  { id: "white", hex: "#ffffff" },
] as const;

type Tool = "select" | "hand" | keyof typeof PLACED;
/** The keys of the tools, as in drawing tools; I asks for images. */
const SHORTCUTS: Record<string, Tool | "image"> = { v: "select", h: "hand", i: "image", c: "color", t: "text", n: "note" };
type Guide = { axis: "x" | "y"; at: number; from: number; to: number };
type Rect = { x: number; y: number; w: number; h: number };

/** The style of an item of a board, its own colour included; the canvas and the PDF share it. */
export function itemStyle(i: BoardItem, low: number): CSSProperties {
  return {
    left: i.x,
    top: i.y,
    width: i.w,
    height: i.h,
    zIndex: i.z - low + 1,
    ...(i.kind === "color" ? { background: i.color, color: inkOn(i.color ?? "") } : {}),
    ...(i.kind === "note" && i.color ? ({ "--note": i.color } as CSSProperties) : {}),
  };
}

/** A line of a rectangle along one axis: where it is, and whether it is an edge or the middle. */
type Line = { at: number; mid: boolean };

/** The three lines of a rectangle along one axis: its start, its middle and its end. */
const linesOf = (r: Rect, axis: "x" | "y"): Line[] => {
  const [a, size] = axis === "x" ? [r.x, r.w] : [r.y, r.h];
  return [
    { at: a, mid: false },
    { at: a + size / 2, mid: true },
    { at: a + size, mid: false },
  ];
};

/** How far apart two rectangles are across `axis`: 0 when they face each other. */
const gapAcross = (a: Rect, b: Rect, axis: "x" | "y") =>
  axis === "x" ? Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h)) : Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));

/**
 * The shift that brings one of `lines` onto a line of `others`, when one comes within `tol`: an edge lines up
 * with an edge, a middle with a middle. The nearest wins; at equal distance, the nearest item.
 */
function alignOn(lines: Line[], others: Rect[], axis: "x" | "y", r: Rect, tol: number): { shift: number; at: number; mid: boolean } | null {
  let best: { shift: number; at: number; mid: boolean; gap: number } | null = null;
  for (const o of others) {
    const gap = gapAcross(r, o, axis);
    for (const l of lines)
      for (const target of linesOf(o, axis)) {
        if (target.mid !== l.mid) continue;
        const shift = target.at - l.at;
        if (Math.abs(shift) > tol) continue;
        const d = best ? Math.abs(shift) - Math.abs(best.shift) : -1;
        if (d < -0.01 || (best && d <= 0.01 && gap < best.gap)) best = { shift, at: target.at, mid: l.mid, gap };
      }
  }
  return best;
}

/** The guide drawn along `at`, from `moved` to every other rectangle that has a line of the same sort there. */
function guideFor(axis: "x" | "y", at: number, mid: boolean, moved: Rect, others: Rect[]): Guide {
  const on = others.filter((o) => linesOf(o, axis).some((l) => l.mid === mid && Math.abs(l.at - at) < 0.5));
  const across = [moved, ...on].flatMap((r) => (axis === "x" ? [r.y, r.y + r.h] : [r.x, r.x + r.w]));
  return { axis, at, from: Math.min(...across), to: Math.max(...across) };
}

/**
 * Where `r` lands once lined up: an edge on another item's edge, or its middle on another's middle, within
 * GUIDE_PX on screen; otherwise on the grid. `pick` says which of its lines count: all three, or only the given ones.
 */
function snapRect(
  r: Rect,
  others: Rect[],
  k: number,
  pick: { x: (r: Rect) => Line[]; y: (r: Rect) => Line[] } = { x: (q) => linesOf(q, "x"), y: (q) => linesOf(q, "y") },
): { dx: number; dy: number; guides: Guide[] } {
  const tol = GUIDE_PX / k;
  const shifts = { x: 0, y: 0 };
  for (const axis of ["x", "y"] as const) {
    const lines = pick[axis](r);
    const hit = alignOn(lines, others, axis, r, tol);
    shifts[axis] = hit ? hit.shift : snapTo(lines[0].at) - lines[0].at;
  }
  // The guides are found where the rectangle lands, both axes moved, so that they reach it and only what it lines up with.
  const landed = { ...r, x: r.x + shifts.x, y: r.y + shifts.y };
  const guides: Guide[] = [];
  for (const axis of ["x", "y"] as const) {
    const hit = alignOn(pick[axis](landed), others, axis, landed, 0.5);
    if (hit) guides.push(guideFor(axis, hit.at, hit.mid, landed, others));
  }
  return { dx: shifts.x, dy: shifts.y, guides };
}

export const kindName = (k: BoardKind) => t(`moodboard.kinds.${k}`);

/** The size an image of the project takes when it lands on a board: its own ratio, at most IMAGE_SIDE. */
async function imageSize(path: string): Promise<{ w: number; h: number }> {
  try {
    const img = new Image();
    img.src = await readImage(path);
    await img.decode();
    const k = Math.min(1, IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    return {
      w: Math.max(MIN_SIDE, img.naturalWidth * k),
      h: Math.max(MIN_SIDE, img.naturalHeight * k),
    };
  } catch {
    return { w: IMAGE_SIDE, h: IMAGE_SIDE * 0.75 };
  }
}

const palettes = new Map<string, Promise<Swatch[]>>();

/** The main colours of an image of the project, read once [MOO-04]. */
function paletteOf(path: string): Promise<Swatch[]> {
  let p = palettes.get(path);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.src = await readImage(path);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, 64, 64);
      return extractPalette(g.getImageData(0, 0, 64, 64).data, 6);
    })().catch(() => []);
    palettes.set(path, p);
  }
  return p;
}

function bounds(items: Geometry[]) {
  if (items.length === 0) return null;
  const x0 = Math.min(...items.map((i) => i.x));
  const y0 = Math.min(...items.map((i) => i.y));
  const x1 = Math.max(...items.map((i) => i.x + i.w));
  const y1 = Math.max(...items.map((i) => i.y + i.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The view that shows all of `items` inside a box of `width` × `height`, with a margin. */
function fitView(items: Geometry[], width: number, height: number, margin = 48, max = 1): View {
  const b = bounds(items);
  if (!b) return { x: margin, y: margin, k: 1 };
  const k = clampZoom(Math.min(max, (width - margin * 2) / Math.max(1, b.w), (height - margin * 2) / Math.max(1, b.h)));
  return {
    k,
    x: (width - b.w * k) / 2 - b.x * k,
    y: (height - b.h * k) / 2 - b.y * k,
  };
}

/**
 * The moodboards: free boards of images, colours, texts and notes, each tied to scenes or entries [MOO-01 to MOO-06].
 * The view opens on all the boards, as cards; one opens on its canvas, its palette and its links in the panel.
 */
export function MoodboardView() {
  const { ask, notify, setTrail } = useProject();
  const boards = useLive(loadBoards, [...BOARD_TABLES]);
  const [boardId, setBoardId] = useState<string | null>(() => takeBoardRequest());
  const [panel, setPanel] = useStoredState<Panel>("oniric.moodboard.tab", "palette");
  const [editing, setEditing] = useState<Board | "new" | null>(null);
  const board = boards?.find((b) => b.id === boardId) ?? null;
  const items = useLive(() => (board ? loadItems(board.id) : Promise.resolve([])), ["moodboard_item"], [board?.id]);
  const fail = useCallback((e: unknown) => notify({ text: describeError(e), tone: "error" }), [notify]);

  // On a board, the header leads back to all of them; on all of them, it counts them.
  const viewLabel = t("nav.views.moodboard");
  const count = boards?.length ?? 0;
  useEffect(() => {
    setTrail(
      board
        ? [{ label: viewLabel, onClick: () => setBoardId(null) }, { label: board.name }]
        : [{ label: viewLabel, count }],
    );
  }, [board?.id, board?.name, count, viewLabel, setTrail]);
  useEffect(() => () => setTrail(null), [setTrail]);

  const remove = async (b: Board) => {
    if (
      !(await confirmRemoval(ask, {
        title: t("moodboard.deleteTitle", { name: b.name }),
        text: t("moodboard.deleteText", { count: b.items }),
      }))
    )
      return;
    try {
      await deleteBoard(b.id);
    } catch (e) {
      fail(e);
    }
  };

  const boardMenu = (b: Board): MoreItem[] => [
    { label: t("moodboard.edit"), icon: Pencil, onClick: () => setEditing(b) },
    {
      label: t("moodboard.delete"),
      icon: Trash2,
      danger: true,
      onClick: () => void remove(b),
    },
  ];

  const editor = editing && (
    <BoardDialog
      board={editing === "new" ? null : editing}
      onClose={() => setEditing(null)}
      onSave={async (name, kind) => {
        try {
          if (editing === "new") setBoardId(await addBoard(boards ?? [], name, kind));
          else await updateBoard(editing.id, { name, kind });
        } catch (e) {
          fail(e);
        }
      }}
    />
  );

  if (boards && boards.length === 0) {
    return (
      <div className="view view-pad">
        <div className="empty-state mb-empty">
          <h2>{t("moodboard.emptyTitle")}</h2>
          <p className="muted">{t("moodboard.emptyText")}</p>
          <ul className="mb-starters">
            {(["general", "light", "costume", "location"] as const).map((k) => (
              <li key={k}>
                <button type="button" className="chip" onClick={() => void addBoard([], kindName(k), k).then(setBoardId, fail)}>
                  <Plus aria-hidden="true" />
                  {kindName(k)}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {editor}
      </div>
    );
  }

  if (!board) {
    return (
      <div className="view view-pad mb-home">
        <ul className="mb-cards">
          {(boards ?? []).map((b) => (
            <li key={b.id} className="mb-card">
              <button type="button" className="mb-card-open" onClick={() => setBoardId(b.id)}>
                <span className={`mb-cover n${Math.min(4, b.cover.length)}`} aria-hidden="true">
                  {b.cover.length === 0 ? <LayoutGrid /> : b.cover.map((p) => <MediaImage key={p} path={p} alt="" />)}
                </span>
                <span className="mb-card-text">
                  <span className="mb-card-name">{b.name}</span>
                  <span className="mb-card-meta">
                    {kindName(b.kind)} · {t("moodboard.itemCount", { count: b.items })}
                  </span>
                </span>
              </button>
              <MoreMenu label={t("moodboard.menu", { name: b.name })} items={boardMenu(b)} />
            </li>
          ))}
          {boards && (
            <li className="mb-card-add">
              <button type="button" onClick={() => setEditing("new")}>
                <Plus aria-hidden="true" />
                {t("moodboard.new")}
              </button>
            </li>
          )}
        </ul>
        {editor}
      </div>
    );
  }

  return (
    <div className="view split rz-split mb-split">
      <main className="mb-main" aria-label={board.name}>
        {items && <BoardCanvas key={board.id} board={board} items={items} onFail={fail} />}
      </main>
      <aside className="view-side rz-side" aria-label={t(`moodboard.panels.${panel}`)}>
        <div className="side-tabs">
          <Segmented
            label={t("moodboard.panel")}
            value={panel}
            onChange={setPanel}
            options={[
              {
                id: "palette",
                label: t("moodboard.panels.palette"),
                icon: Palette,
                hint: t("moodboard.panels.paletteHint"),
              },
              {
                id: "links",
                label: t("moodboard.panels.links"),
                icon: Link2,
                hint: t("moodboard.panels.linksHint"),
              },
            ]}
          />
        </div>
        {panel === "palette" && items && <PalettePanel board={board} items={items} onFail={fail} />}
        {panel === "links" && <LinksPanel board={board} onFail={fail} />}
      </aside>
      {editor}
    </div>
  );
}

/** What an item holds once `patch` is applied: an update replaces all of it. */
const dataWith = (i: BoardItem, patch: Partial<Pick<BoardItem, "path" | "color" | "text">>) => ({
  path: i.path,
  color: i.color,
  text: i.text,
  ...patch,
});

const rectBetween = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
});

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * The canvas of one board, with its bar of tools fixed at the bottom. A tool lays down where one clicks, or the size
 * one drags; moves and sizes snap to the grid and line up with the other items, unless Alt is held. The wheel pans,
 * Ctrl + wheel zooms, the hand (H, or Space held) drags the view.
 */
function BoardCanvas({ board, items, onFail }: { board: Board; items: BoardItem[]; onFail: (e: unknown) => void }) {
  const { ask } = useProject();
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 48, y: 48, k: 1 });
  const fitted = useRef(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ghost, setGhost] = useState<Map<string, Partial<Geometry>>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const [snap, setSnap] = useStoredState("oniric.moodboard.snap", true);
  const [noteColor, setNoteColor] = useStoredState<string | null>("oniric.moodboard.noteColor", null);
  const [swatch, setSwatch] = useStoredState<string>("oniric.moodboard.color", SWATCHES[1].hex);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [preview, setPreview] = useState<Rect | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const gesture = useRef<
    | { kind: "pan"; sx: number; sy: number; view: View }
    | {
        kind: "move";
        sx: number;
        sy: number;
        start: Map<string, Geometry>;
        moved: boolean;
      }
    | {
        kind: "resize";
        id: string;
        sx: number;
        sy: number;
        start: Geometry;
        keep: boolean;
      }
    | { kind: "marquee"; at: { x: number; y: number }; base: Set<string> }
    | { kind: "place"; tool: keyof typeof PLACED; at: { x: number; y: number }; moved: boolean }
    | null
  >(null);
  const colorInput = useRef<HTMLInputElement>(null);
  /** What the colour picker changes: an item, or the colour the tool lays down. */
  const colorTarget = useRef<string | null>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);

  const top = items.reduce((m, i) => Math.max(m, i.z), 0);
  const low = Math.min(0, ...items.map((x) => x.z));
  const shown = useMemo(() => items.map((i) => ({ ...i, ...ghost.get(i.id) })), [items, ghost]);
  const placing = tool === "note" || tool === "text" || tool === "color" ? tool : null;

  // The first look at a board shows all of it.
  useLayoutEffect(() => {
    const el = box.current;
    if (fitted.current || !el) return;
    fitted.current = true;
    if (items.length) setView(fitView(items, el.clientWidth, el.clientHeight));
  }, [items]);

  // Space held is the hand for as long as it is held, as in drawing tools.
  useEffect(() => {
    if (!space) return;
    const up = (e: KeyboardEvent) => e.key === " " && setSpace(false);
    const off = () => setSpace(false);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
    };
  }, [space]);

  const toWorld = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.x) / view.k,
      y: (clientY - r.top - view.y) / view.k,
    };
  };

  /** The middle of what is shown, in the units of the board. */
  const middle = () => {
    const r = box.current!.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  };

  /** What a click of `kind` lays down around `at`, on the grid unless `free`. */
  const rectAt = (kind: keyof typeof PLACED, at: { x: number; y: number }, free: boolean): Rect => {
    const { w, h } = PLACED[kind];
    const x = at.x - w / 2;
    const y = at.y - h / 2;
    return free ? { x, y, w, h } : { x: snapTo(x), y: snapTo(y), w, h };
  };

  /**
   * Where a new thing of `w` × `h` goes: around `at` (the middle of what is shown, or where it was dropped), on the
   * first spot of the grid that covers nothing already there, turning outwards.
   */
  const spot = (w: number, h: number, taken: Geometry[], at = middle()) => {
    const GAP = GRID;
    const place = (v: number) => (snap ? snapTo(v) : v);
    const free = (x: number, y: number) => !taken.some((o) => x < o.x + o.w + GAP && x + w + GAP > o.x && y < o.y + o.h + GAP && y + h + GAP > o.y);
    for (let ring = 0; ring < 40; ring++) {
      const steps = Math.max(1, ring * 8);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = place(at.x - w / 2 + Math.cos(a) * ring * GRID * 2);
        const y = place(at.y - h / 2 + Math.sin(a) * ring * GRID * 2);
        if (free(x, y)) return { x, y };
      }
    }
    return { x: place(at.x - w / 2), y: place(at.y - h / 2) };
  };

  const add = async (news: NewItem[], label?: string) => {
    try {
      const ids = await addItems(board.id, top, news, label);
      setSelected(new Set(ids));
      return ids;
    } catch (e) {
      onFail(e);
      return [];
    }
  };

  const addImages = async (paths: string[], at?: { x: number; y: number }) => {
    const news: NewItem[] = [];
    for (const path of paths) {
      const size = await imageSize(path);
      news.push({
        kind: "image",
        ...spot(size.w, size.h, [...items, ...news], at),
        ...size,
        path,
      });
    }
    await add(news, paths.length > 1 ? "Images ajoutées au moodboard" : "Image ajoutée au moodboard");
  };

  const storeAll = async (files: Blob[], at?: { x: number; y: number }) => {
    const paths: string[] = [];
    for (const f of files) {
      try {
        paths.push(await storeImage(f, "moodboard", f instanceof File ? f.name.replace(/\.[^.]+$/, "") : board.name));
      } catch (e) {
        onFail(e);
      }
    }
    if (paths.length) await addImages(paths, at);
  };

  const pickImages = () => {
    setTool("select");
    void pickImage(true)
      .then((paths) => addImages(paths))
      .catch(onFail);
  };

  /** Lays down what a tool makes, over `r`; a text or a note opens for writing. */
  const placeItem = (kind: keyof typeof PLACED, r: Rect, text = "") => {
    if (kind === "color") {
      void add([{ kind, ...r, color: swatch }], "Couleur ajoutée au moodboard");
      return;
    }
    void add([{ kind, ...r, text, ...(kind === "note" && noteColor ? { color: noteColor } : {}) }]).then(
      ([id]) => id && !text && setEditingId(id),
    );
  };

  const addText = (kind: "text" | "note", text = "", at?: { x: number; y: number }) =>
    placeItem(kind, { ...spot(PLACED[kind].w, PLACED[kind].h, items, at), ...PLACED[kind] }, text);

  // Ctrl + V on the board: an image copied in a browser, or text that becomes a note [MOO-03].
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
      const files = [...(e.clipboardData?.files ?? [])].filter(isStorableImage);
      if (files.length) {
        e.preventDefault();
        void storeAll(files);
        return;
      }
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (text) {
        e.preventDefault();
        addText("note", text);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const zoomAt = (next: number, cx?: number, cy?: number) => {
    const el = box.current;
    if (!el) return;
    const k = clampZoom(next);
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    setView((v) => ({
      k,
      x: px - ((px - v.x) / v.k) * k,
      y: py - ((py - v.y) / v.k) * k,
    }));
  };

  // The wheel pans; Ctrl + wheel zooms around the pointer. Not passive, to keep the page from zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const r = el.getBoundingClientRect();
        setView((v) => {
          const k = clampZoom(v.k * Math.exp(-e.deltaY / 400));
          const px = e.clientX - r.left;
          const py = e.clientY - r.top;
          return {
            k,
            x: px - ((px - v.x) / v.k) * k,
            y: py - ((py - v.y) / v.k) * k,
          };
        });
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const fit = () => {
    const el = box.current;
    if (el) setView(fitView(items, el.clientWidth, el.clientHeight, 48, 1.5));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(".mb-dock, .mb-zoom, textarea")) return;
    const id = target.closest<HTMLElement>("[data-item]")?.dataset.item;
    box.current?.focus({ preventScroll: true });
    const capture = () => {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    if (e.button === 1 || (e.button === 0 && (tool === "hand" || space))) {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view };
      setPanning(true);
      capture();
      return;
    }
    if (e.button !== 0) return;
    const at = toWorld(e.clientX, e.clientY);
    if (placing) {
      gesture.current = { kind: "place", tool: placing, at, moved: false };
      setPreview(rectAt(placing, at, !snap || e.altKey));
      capture();
      return;
    }
    if (!id) {
      // A drag on the empty canvas draws a frame that chooses what it touches; Shift adds to the choice.
      const base = e.shiftKey ? new Set(selected) : new Set<string>();
      setSelected(base);
      gesture.current = { kind: "marquee", at, base };
      capture();
      return;
    }
    const item = shown.find((i) => i.id === id);
    if (!item) return;
    if (target.closest(".mb-handle")) {
      gesture.current = {
        kind: "resize",
        id,
        sx: e.clientX,
        sy: e.clientY,
        start: item,
        keep: item.kind === "image",
      };
    } else {
      const next = new Set(selected);
      if (e.shiftKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else if (!next.has(id)) {
        next.clear();
        next.add(id);
      }
      setSelected(next);
      const start = new Map<string, Geometry>();
      for (const i of shown) if (next.has(i.id)) start.set(i.id, { x: i.x, y: i.y, w: i.w, h: i.h });
      gesture.current = {
        kind: "move",
        sx: e.clientX,
        sy: e.clientY,
        start,
        moved: false,
      };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const free = !snap || e.altKey;
    if (!g) {
      if (placing && !(e.target as HTMLElement).closest(".mb-dock, .mb-zoom")) setPreview(rectAt(placing, toWorld(e.clientX, e.clientY), free));
      else if (preview) setPreview(null);
      return;
    }
    if (g.kind === "pan") {
      setView({ ...g.view, x: g.view.x + e.clientX - g.sx, y: g.view.y + e.clientY - g.sy });
      return;
    }
    if (g.kind === "marquee") {
      const r = rectBetween(g.at, toWorld(e.clientX, e.clientY));
      setMarquee(r);
      setSelected(new Set([...g.base, ...items.filter((i) => overlaps(i, r)).map((i) => i.id)]));
      return;
    }
    if (g.kind === "place") {
      const p = toWorld(e.clientX, e.clientY);
      if (!g.moved && Math.hypot(p.x - g.at.x, p.y - g.at.y) * view.k < 4) return;
      g.moved = true;
      const r = free ? rectBetween(g.at, p) : rectBetween({ x: snapTo(g.at.x), y: snapTo(g.at.y) }, { x: snapTo(p.x), y: snapTo(p.y) });
      setPreview({ ...r, w: Math.max(GRID * 2, r.w), h: Math.max(GRID * 2, r.h) });
      return;
    }
    let dx = (e.clientX - g.sx) / view.k;
    let dy = (e.clientY - g.sy) / view.k;
    if (g.kind === "move") {
      if (!g.moved && Math.hypot(dx * view.k, dy * view.k) < 3) return;
      g.moved = true;
      if (!free) {
        const b = bounds([...g.start.values()])!;
        const fit = snapRect(
          { ...b, x: b.x + dx, y: b.y + dy },
          items.filter((i) => !g.start.has(i.id)),
          view.k,
        );
        dx += fit.dx;
        dy += fit.dy;
        setGuides(fit.guides);
      } else setGuides([]);
      const next = new Map<string, Partial<Geometry>>();
      for (const [id, s] of g.start) next.set(id, { x: s.x + dx, y: s.y + dy });
      setGhost(next);
      return;
    }
    // An image keeps its ratio, unless Shift is held; the rest follows the pointer. The far edges snap.
    const keep = g.keep !== e.shiftKey;
    const ratio = g.start.w / g.start.h;
    let w = Math.max(MIN_SIDE, g.start.w + dx);
    let h = Math.max(MIN_SIDE, g.start.h + dy);
    if (keep) {
      if (w / h > ratio) h = w / ratio;
      else w = h * ratio;
    }
    if (!free) {
      const fit = snapRect(
        { ...g.start, w, h },
        items.filter((i) => i.id !== g.id),
        view.k,
        { x: (q) => [{ at: q.x + q.w, mid: false }], y: (q) => [{ at: q.y + q.h, mid: false }] },
      );
      w = Math.max(MIN_SIDE, w + fit.dx);
      h = keep ? w / ratio : Math.max(MIN_SIDE, h + fit.dy);
      setGuides(keep ? fit.guides.filter((gd) => gd.axis === "x") : fit.guides);
    } else setGuides([]);
    setGhost(new Map([[g.id, { w, h }]]));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setGuides([]);
    setPanning(false);
    if (!g || g.kind === "pan") return;
    if (g.kind === "marquee") {
      setMarquee(null);
      return;
    }
    if (g.kind === "place") {
      const r = preview ?? rectAt(g.tool, g.at, !snap || e.altKey);
      setPreview(null);
      setTool("select");
      placeItem(g.tool, r);
      return;
    }
    const changes = [...ghost.entries()].map(([id, p]) => ({ id, ...p }));
    if ((g.kind === "move" && !g.moved) || changes.length === 0) {
      setGhost(new Map());
      return;
    }
    void updateItems(changes, g.kind === "move" ? "Déplacement dans le moodboard" : "Taille dans le moodboard")
      .catch(onFail)
      .finally(() => setGhost(new Map()));
  };

  const removeSelected = async (ids = [...selected]) => {
    if (ids.length === 0) return;
    const chosen = items.filter((i) => ids.includes(i.id));
    // Only empty texts leave without a question.
    const empty = chosen.every((i) => (i.kind === "text" || i.kind === "note") && !i.text?.trim());
    if (
      !empty &&
      !(await confirmRemoval(ask, {
        title: chosen.length > 1 ? t("moodboard.removeItemsTitle", { count: chosen.length }) : t(`moodboard.removeTitle.${chosen[0].kind}`),
        text: chosen.some((i) => i.kind === "image") ? t("moodboard.removeImageText") : t("moodboard.removeText"),
        label: t("common.removeAction"),
      }))
    )
      return;
    try {
      await deleteItems(ids);
      setSelected(new Set());
    } catch (e) {
      onFail(e);
    }
  };

  const duplicate = (ids = [...selected]) => {
    const chosen = items.filter((i) => ids.includes(i.id));
    void add(
      chosen.map(({ id: _id, boardId: _b, z: _z, ...rest }) => ({
        ...rest,
        x: rest.x + GRID,
        y: rest.y + GRID,
      })),
      "Éléments dupliqués",
    );
  };

  const restack = (ids: string[], front: boolean) => {
    const bottom = items.reduce((m, i) => Math.min(m, i.z), 0);
    void updateItems(
      ids.map((id, i) => ({
        id,
        z: front ? top + 1 + i : bottom - ids.length + i,
      })),
      front ? "Premier plan" : "Arrière-plan",
    ).catch(onFail);
  };

  /** Chooses a tool; from the keyboard, a tool that lays something down does it at once, in the middle. */
  const chooseTool = (next: Tool, fromKeyboard = false) => {
    setPreview(null);
    if (fromKeyboard && (next === "note" || next === "text" || next === "color")) {
      setTool("select");
      if (next === "color") placeItem("color", { ...spot(PLACED.color.w, PLACED.color.h, items), ...PLACED.color });
      else addText(next);
      return;
    }
    setTool(next);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("textarea, input")) return;
    const ids = [...selected];
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    const key = e.key.toLowerCase();
    if (e.key === " " && plain) {
      // Space on a button of the bar presses it; anywhere else it holds the hand.
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      if (!e.repeat) setSpace(true);
    } else if (plain && !e.shiftKey && key in SHORTCUTS) {
      e.preventDefault();
      if (SHORTCUTS[key] === "image") pickImages();
      else chooseTool(SHORTCUTS[key] as Tool);
    } else if ((e.key === "Delete" || e.key === "Backspace") && ids.length) {
      e.preventDefault();
      void removeSelected(ids);
    } else if (e.key === "Escape") {
      if (tool !== "select") chooseTool("select");
      else setSelected(new Set());
    } else if ((e.ctrlKey || e.metaKey) && key === "a") {
      e.preventDefault();
      setSelected(new Set(items.map((i) => i.id)));
    } else if ((e.ctrlKey || e.metaKey) && key === "d" && ids.length) {
      e.preventDefault();
      duplicate(ids);
    } else if (e.key.startsWith("Arrow") && ids.length) {
      e.preventDefault();
      const step = e.shiftKey ? GRID : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      void updateItems(
        items.filter((i) => selected.has(i.id)).map((i) => ({ id: i.id, x: i.x + dx, y: i.y + dy })),
        "Déplacement dans le moodboard",
      ).catch(onFail);
    } else if (e.key === "Enter" && ids.length === 1) {
      const item = items.find((i) => i.id === ids[0]);
      if (item?.kind === "text" || item?.kind === "note") {
        e.preventDefault();
        setEditingId(item.id);
      } else if (item?.kind === "color") editColor(item);
    }
  };

  const pickColor = (target: string | null, value: string) => {
    const input = colorInput.current;
    if (!input) return;
    colorTarget.current = target;
    input.value = value;
    input.click();
  };
  const editColor = (item: BoardItem) => pickColor(item.id, item.color ?? "#8a8a8a");

  const itemMenu = (id: string): MoreItem[] => {
    const ids = selected.has(id) ? [...selected] : [id];
    const item = items.find((i) => i.id === id);
    return [
      ...(item?.kind === "text" || item?.kind === "note"
        ? [
            {
              label: t("moodboard.editText"),
              icon: Pencil,
              onClick: () => setEditingId(id),
            },
          ]
        : []),
      ...(item?.kind === "color"
        ? [
            {
              label: t("moodboard.editColor"),
              icon: Droplet,
              onClick: () => editColor(item),
            },
          ]
        : []),
      {
        label: t("moodboard.front"),
        icon: ArrowUpToLine,
        onClick: () => restack(ids, true),
      },
      {
        label: t("moodboard.back"),
        icon: ArrowDownToLine,
        onClick: () => restack(ids, false),
      },
      {
        label: t("moodboard.duplicate"),
        icon: Copy,
        onClick: () => duplicate(ids),
      },
      {
        label: t("common.removeAction"),
        icon: Trash2,
        danger: true,
        onClick: () => void removeSelected(ids),
      },
    ];
  };

  // The tray of colours over the bar: for the tool that lays notes or colours down, or for the notes or colours chosen.
  const chosen = items.filter((i) => selected.has(i.id));
  const onlyKind = chosen.length > 0 && chosen.every((i) => i.kind === chosen[0].kind) ? chosen[0].kind : null;
  const tray = tool === "note" || (tool === "select" && onlyKind === "note") ? "note" : tool === "color" || (tool === "select" && onlyKind === "color") ? "color" : null;
  const recolor = tool === "select" && chosen.length > 0;
  const common = (v: (i: BoardItem) => string | null) => (chosen.every((i) => v(i) === v(chosen[0])) ? v(chosen[0]) : undefined);
  const trayValue = tray === "note" ? (recolor ? common((i) => i.color ?? null) : noteColor) : recolor ? common((i) => i.color?.toLowerCase() ?? null) : swatch;
  const setTrayColor = (hex: string | null) => {
    if (tray === "note") setNoteColor(hex);
    else if (hex) setSwatch(hex);
    if (recolor)
      void updateItems(
        chosen.map((i) => ({ id: i.id, data: dataWith(i, { color: hex ?? undefined }) })),
        tray === "note" ? "Couleur des notes" : "Couleur du moodboard",
      ).catch(onFail);
  };

  const worldStyle: CSSProperties = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
  };
  // The dots are the grid; zoomed far out, every other one goes, so that they never crowd.
  let step = GRID * view.k;
  while (step < 12) step *= 2;
  const dots: CSSProperties = {
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${view.x - step / 2}px ${view.y - step / 2}px`,
  };
  const toScreen = (r: Rect) => ({ left: r.x * view.k + view.x, top: r.y * view.k + view.y, width: r.w * view.k, height: r.h * view.k });

  const toolButton = (id: Tool | "image", Icon: typeof Type, label: string, keyName: string, swatchColor?: string) => {
    const on = id === tool;
    return (
      <button
        type="button"
        className={on ? "mb-tool on" : "mb-tool"}
        aria-label={`${label} (${keyName})`}
        aria-pressed={id === "image" ? undefined : on}
        onClick={(e) => (id === "image" ? pickImages() : chooseTool(id, e.detail === 0))}
      >
        {swatchColor !== undefined ? (
          <span className={id === "note" ? "mb-tool-note" : "mb-tool-swatch"} style={swatchColor ? ({ "--swatch": swatchColor } as CSSProperties) : undefined} aria-hidden="true">
            <Icon />
          </span>
        ) : (
          <Icon aria-hidden="true" />
        )}
        <span className="mb-tip" aria-hidden="true">
          {label}
          <kbd>{keyName}</kbd>
        </span>
      </button>
    );
  };

  const cursor = panning ? "panning" : tool === "hand" || space ? "hand" : placing ? "placing" : null;

  return (
    <div
      ref={box}
      className={["mb-canvas", dropping && "dropping", cursor].filter(Boolean).join(" ")}
      style={dots}
      tabIndex={0}
      role="application"
      aria-roledescription={t("moodboard.canvas")}
      aria-label={t("moodboard.canvasLabel", { name: board.name })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => !gesture.current && setPreview(null)}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>("[data-item]")?.dataset.item;
        if (!id) return;
        e.preventDefault();
        menuAnchor.current = e.target as HTMLElement;
        if (!selected.has(id)) setSelected(new Set([id]));
        setMenu({ x: e.clientX, y: e.clientY, id });
      }}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].some((ty) => ty === "Files" || ty === "text/plain")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const at = toWorld(e.clientX, e.clientY);
        const files = [...e.dataTransfer.files].filter(isStorableImage);
        if (files.length) void storeAll(files, at);
        else {
          const text = e.dataTransfer.getData("text/plain").trim();
          if (text) addText("note", text, at);
        }
      }}
    >
      <div className="mb-world" style={worldStyle}>
        {shown.map((i) => (
          <div
            key={i.id}
            data-item={i.id}
            className={["mb-item", `mb-${i.kind}`, i.kind === "note" && i.color && "tinted", selected.has(i.id) && "on"].filter(Boolean).join(" ")}
            style={itemStyle(i, low)}
            onDoubleClick={() => {
              if (i.kind === "text" || i.kind === "note") setEditingId(i.id);
              else if (i.kind === "color") editColor(i);
            }}
          >
            {i.kind === "image" && i.path && <MediaImage path={i.path} alt="" />}
            {i.kind === "color" && <span className="mb-hex">{(i.color ?? "").toUpperCase()}</span>}
            {(i.kind === "text" || i.kind === "note") &&
              (editingId === i.id ? (
                <textarea
                  className="mb-edit"
                  autoFocus
                  defaultValue={i.text ?? ""}
                  aria-label={t(`moodboard.removeTitle.${i.kind}`)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" || (e.key === "Enter" && e.ctrlKey)) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) => {
                    setEditingId(null);
                    const text = e.currentTarget.value;
                    if (text !== (i.text ?? "")) void updateItems([{ id: i.id, data: dataWith(i, { text }) }], "Texte du moodboard").catch(onFail);
                  }}
                />
              ) : (
                <p className={i.text ? "mb-text-body" : "mb-text-body empty"}>{i.text || t(`moodboard.placeholder.${i.kind}`)}</p>
              ))}
            {selected.has(i.id) && selected.size === 1 && <span className="mb-handle" aria-hidden="true" />}
          </div>
        ))}
        {preview && placing && (
          <div
            className={["mb-item", "mb-preview", `mb-${placing}`, placing === "note" && noteColor && "tinted"].filter(Boolean).join(" ")}
            style={{
              left: preview.x,
              top: preview.y,
              width: preview.w,
              height: preview.h,
              zIndex: top - low + 2,
              ...(placing === "color" ? { background: swatch, color: inkOn(swatch) } : {}),
              ...(placing === "note" && noteColor ? ({ "--note": noteColor } as CSSProperties) : {}),
            }}
            aria-hidden="true"
          >
            {placing === "color" ? <span className="mb-hex">{swatch.toUpperCase()}</span> : <p className="mb-text-body empty">{t(`moodboard.placeholder.${placing}`)}</p>}
          </div>
        )}
      </div>

      {(guides.length > 0 || marquee) && (
        <div className="mb-overlay" aria-hidden="true">
          {guides.map((g, n) => (
            <span
              key={n}
              className={`mb-guide ${g.axis}`}
              style={
                // On whole pixels, so that the line stays one sharp pixel at any zoom.
                g.axis === "x"
                  ? { left: Math.round(g.at * view.k + view.x - 0.5), top: g.from * view.k + view.y - 8, height: (g.to - g.from) * view.k + 16 }
                  : { top: Math.round(g.at * view.k + view.y - 0.5), left: g.from * view.k + view.x - 8, width: (g.to - g.from) * view.k + 16 }
              }
            />
          ))}
          {marquee && <span className="mb-marquee" style={toScreen(marquee)} />}
        </div>
      )}

      {items.length === 0 && !placing && (
        <div className="mb-hint">
          <p>{t("moodboard.emptyBoard")}</p>
          <p className="muted">{t("moodboard.emptyBoardHint")}</p>
        </div>
      )}

      <div className="mb-dock">
        {tray && (
          <div className="mb-tray" role="toolbar" aria-label={t(tray === "note" ? "moodboard.noteColors" : "moodboard.colorChoices")}>
            {(tray === "note" ? NOTE_COLORS : SWATCHES).map((s) => (
              <button
                key={s.id}
                type="button"
                className={["mb-dot", tray === "note" && "note", trayValue === s.hex && "on"].filter(Boolean).join(" ")}
                style={s.hex ? ({ "--swatch": s.hex } as CSSProperties) : undefined}
                aria-label={t(`moodboard.swatch.${s.id}`)}
                title={t(`moodboard.swatch.${s.id}`)}
                aria-pressed={trayValue === s.hex}
                onClick={() => setTrayColor(s.hex)}
              />
            ))}
            {tray === "color" && (
              <>
                <span className="mb-bar-sep" aria-hidden="true" />
                <button
                  type="button"
                  className={["mb-dot", "custom", trayValue && !SWATCHES.some((s) => s.hex === trayValue) && "on"].filter(Boolean).join(" ")}
                  style={trayValue && !SWATCHES.some((s) => s.hex === trayValue) ? ({ "--swatch": trayValue } as CSSProperties) : undefined}
                  aria-label={t("moodboard.customColor")}
                  title={t("moodboard.customColor")}
                  onClick={() => pickColor(recolor ? "selection" : "tool", trayValue ?? swatch)}
                />
              </>
            )}
          </div>
        )}
        <div className="mb-bar" role="toolbar" aria-label={t("moodboard.tools")}>
          {toolButton("select", MousePointer2, t("moodboard.toolSelect"), "V")}
          {toolButton("hand", Hand, t("moodboard.toolHand"), "H")}
          <span className="mb-bar-sep" aria-hidden="true" />
          {toolButton("image", ImagePlus, t("moodboard.addImage"), "I")}
          {toolButton("color", Square, t("moodboard.addColor"), "C", swatch)}
          {toolButton("text", Type, t("moodboard.addText"), "T")}
          {toolButton("note", StickyNote, t("moodboard.addNote"), "N", noteColor ?? "")}
          <span className="mb-bar-sep" aria-hidden="true" />
          <button
            type="button"
            className={snap ? "mb-tool mb-snap on" : "mb-tool mb-snap"}
            aria-label={t("moodboard.snap")}
            aria-pressed={snap}
            onClick={() => setSnap(!snap)}
          >
            <Magnet aria-hidden="true" />
            <span className="mb-tip wide" aria-hidden="true">
              {t("moodboard.snap")}
              <small>{t("moodboard.snapHint")}</small>
            </span>
          </button>
        </div>
      </div>

      <div className="mb-zoom canvas-tools" role="toolbar" aria-label={t("canvas.tools")}>
        <button type="button" aria-label={t("canvas.zoomOut")} title={t("canvas.zoomOutTitle")} onClick={() => zoomAt(view.k / 1.2)}>
          <Minus aria-hidden="true" />
        </button>
        <button type="button" className="canvas-pct" title={t("canvas.actual")} onClick={() => zoomAt(1)}>
          {Math.round(view.k * 100)} %
        </button>
        <button type="button" aria-label={t("canvas.zoomIn")} title={t("canvas.zoomInTitle")} onClick={() => zoomAt(view.k * 1.2)}>
          <Plus aria-hidden="true" />
        </button>
        <button type="button" aria-label={t("canvas.fit")} title={t("canvas.fit")} disabled={items.length === 0} onClick={fit}>
          <Maximize aria-hidden="true" />
        </button>
      </div>

      <input
        ref={colorInput}
        type="color"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const target = colorTarget.current;
          const hex = e.target.value;
          if (target === "tool") setSwatch(hex);
          else if (target === "selection") setTrayColor(hex);
          else if (target) {
            const item = items.find((i) => i.id === target);
            if (item) void updateItems([{ id: target, data: dataWith(item, { color: hex }) }], "Couleur du moodboard").catch(onFail);
          }
        }}
      />

      {menu && <ContextMenu at={menu} anchor={menuAnchor} items={itemMenu(menu.id)} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** The colours of the board's images, merged, with their codes [MOO-04]. */
function PalettePanel({ board, items, onFail }: { board: Board; items: BoardItem[]; onFail: (e: unknown) => void }) {
  const { notify } = useProject();
  const paths = items.filter((i) => i.kind === "image" && i.path).map((i) => i.path!);
  const key = paths.join("|");
  const [swatches, setSwatches] = useState<Swatch[] | null>(null);
  useEffect(() => {
    let alive = true;
    setSwatches(null);
    void Promise.all(paths.map(paletteOf)).then((all) => alive && setSwatches(mergePalettes(all, 8)));
    return () => {
      alive = false;
    };
    // The paths are the dependency, joined.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const own = [...new Set(items.filter((i) => i.kind === "color" && i.color).map((i) => i.color!.toLowerCase()))];
  const copy = (hex: string) =>
    void navigator.clipboard.writeText(hex.toUpperCase()).then(() => notify({ text: t("moodboard.copied", { hex: hex.toUpperCase() }) }), onFail);
  const addAll = async () => {
    if (!swatches?.length) return;
    const b = bounds(items) ?? { x: 0, y: 0, w: 0, h: 0 };
    try {
      await addItems(
        board.id,
        items.reduce((m, i) => Math.max(m, i.z), 0),
        swatches.map((s, i) => ({
          kind: "color",
          x: snapTo(b.x) + i * 120,
          y: snapTo(b.y + b.h + 40),
          w: 100,
          h: 100,
          color: s.hex,
        })),
        "Palette ajoutée au moodboard",
      );
    } catch (e) {
      onFail(e);
    }
  };
  return (
    <div className="mb-palette">
      <h3>{t("moodboard.paletteTitle")}</h3>
      {paths.length === 0 ? (
        <p className="muted small">{t("moodboard.paletteEmpty")}</p>
      ) : !swatches ? (
        <p className="muted small">{t("moodboard.paletteReading")}</p>
      ) : (
        <>
          <div className="mb-strip" aria-hidden="true">
            {swatches.map((s) => (
              <span
                key={s.hex}
                style={{
                  background: s.hex,
                  flexGrow: Math.max(0.4, s.weight * 10),
                }}
              />
            ))}
          </div>
          <ul className="mb-swatches">
            {swatches.map((s) => (
              <li key={s.hex}>
                <button type="button" className="mb-swatch" title={t("moodboard.copy")} onClick={() => copy(s.hex)}>
                  <span className="mb-chip" style={{ background: s.hex }} aria-hidden="true" />
                  <span className="mb-code">{s.hex.toUpperCase()}</span>
                  <span className="mb-share">{Math.round(s.weight * 100)} %</span>
                  <Copy aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn small" onClick={() => void addAll()}>
            <Plus aria-hidden="true" />
            {t("moodboard.paletteAdd")}
          </button>
        </>
      )}
      {own.length > 0 && (
        <>
          <h3 className="mb-own-title">{t("moodboard.ownColors")}</h3>
          <ul className="mb-swatches">
            {own.map((hex) => (
              <li key={hex}>
                <button type="button" className="mb-swatch" title={t("moodboard.copy")} onClick={() => copy(hex)}>
                  <span className="mb-chip" style={{ background: hex }} aria-hidden="true" />
                  <span className="mb-code">{hex.toUpperCase()}</span>
                  <Copy aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The scenes and entries the board is shown on [MOO-05]. */
function LinksPanel({ board, onFail }: { board: Board; onFail: (e: unknown) => void }) {
  const { openEntry, openScene, session } = useProject();
  const scenes = useScenes(session);
  const entries = useLive(async () => {
    const [all, types] = await Promise.all([loadEntries(), loadTypes()]);
    return { all: all.filter((e) => !e.archivedAt), types };
  }, ["bible_entry", "bible_type"]);
  const label = (id: string) => {
    const s = scenes.find((x) => x.id === id);
    if (s)
      return {
        kind: "scene" as const,
        text: `${t("shotlist.sceneNum", { n: s.index + 1 })} · ${s.heading || t("workspace.noHeading")}`,
      };
    const e = entries?.all.find((x) => x.id === id);
    if (e)
      return {
        kind: "entry" as const,
        text: e.name,
        type: entries?.types.find((ty) => ty.id === e.type)?.name,
      };
    return null;
  };
  const links = board.links.map((id) => ({ id, l: label(id) })).filter((x) => x.l);
  const set = (targets: string[]) => void setBoardLinks(board.id, targets).catch(onFail);
  return (
    <div className="mb-links">
      <h3>{t("moodboard.linksTitle")}</h3>
      {links.length > 0 && (
        <ul className="mb-link-list">
          {links.map(({ id, l }) => (
            <li key={id}>
              <button type="button" className="mb-link-open" onClick={() => (l!.kind === "scene" ? openScene(id) : openEntry(id))}>
                <span className={l!.kind === "scene" ? "mb-link-text rz-slug" : "mb-link-text"}>{l!.text}</span>
                {l!.kind === "entry" && l!.type && <span className="muted small">{l!.type}</span>}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("moodboard.unlink", { name: l!.text })}
                title={t("moodboard.unlink", { name: l!.text })}
                onClick={() => set(board.links.filter((x) => x !== id))}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Select
        value=""
        className="mb-link-add"
        aria-label={t("moodboard.link")}
        onChange={(e) => e.target.value && set([...board.links, e.target.value])}
      >
        <option value="" hidden>
          {t("moodboard.link")}
        </option>
        <optgroup label={t("nav.views.script")}>
          {scenes
            .filter((s) => !board.links.includes(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.index + 1}. ${s.heading || t("workspace.noHeading")}`}
              </option>
            ))}
        </optgroup>
        {(entries?.types ?? []).map((ty) => {
          const own = (entries?.all ?? []).filter((e) => e.type === ty.id && !board.links.includes(e.id));
          return own.length === 0 ? null : (
            <optgroup key={ty.id} label={ty.name}>
              {own.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </Select>
    </div>
  );
}

/** Names a board and says what it gathers. */
function BoardDialog({
  board,
  onSave,
  onClose,
}: {
  board: Board | null;
  onSave: (name: string, kind: BoardKind) => Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<BoardKind>(board?.kind ?? "general");
  const [name, setName] = useState(board?.name ?? "");
  const [touched, setTouched] = useState(!!board);
  const shownName = touched ? name : kindName(kind);
  const ok = shownName.trim() !== "";
  const save = () => {
    if (!ok) return;
    onClose();
    void onSave(shownName.trim(), kind);
  };
  return (
    <Dialog
      title={board ? t("moodboard.edit") : t("moodboard.new")}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        {
          label: board ? t("common.save") : t("moodboard.create"),
          primary: true,
          disabled: !ok,
          onClick: save,
        },
      ]}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>{t("moodboard.kind")}</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value as BoardKind)}>
            {BOARD_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindName(k)}
              </option>
            ))}
          </Select>
        </label>
        <label className="field">
          <span>{t("moodboard.name")}</span>
          <input
            type="text"
            data-autofocus
            value={shownName}
            onChange={(e) => {
              setTouched(true);
              setName(e.target.value);
            }}
          />
        </label>
      </form>
    </Dialog>
  );
}
