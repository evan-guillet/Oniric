import {
  ArrowUpRight,
  Brush,
  Eraser,
  Eye,
  EyeOff,
  Layers,
  Minus,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { t } from "../../../core/i18n";
import { readImage } from "../../shared/media";

type Tool = "pencil" | "eraser" | "arrow";

interface Layer {
  id: number;
  visible: boolean;
}

/** The ink of a storyboard: a pencil grey, black, and two colours to mark a movement or a light. */
const INKS = ["#1f2128", "#7a7d86", "#d0392f", "#2f62d0"];
const SIZES = [2, 4, 8, 16];
const MAX_LAYERS = 4;
const UNDO_DEPTH = 40;
/** The width of a frame in pixels, whatever its ratio; a portrait frame keeps this as its height. */
const LONG_SIDE = 1600;

interface Snapshot {
  layer: number;
  image: ImageData;
}

/**
 * Draws a storyboard frame in Oniric [STB-02]: pencil, eraser and camera-movement arrows on up to four layers, over the
 * frame's current image when it has one, in the frame of the chosen ratio. A pen's pressure sets the line's width.
 * `onSave` receives the flattened PNG.
 */
export function DrawDialog({
  ratio,
  ratioLabel,
  background,
  title,
  onSave,
  onClose,
}: {
  ratio: number;
  ratioLabel: string;
  /** The frame's image in the project, drawn under the layers. */
  background: string | null;
  title: string;
  onSave: (png: Blob) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const width = ratio >= 1 ? LONG_SIDE : Math.round(LONG_SIDE * ratio);
  const height = ratio >= 1 ? Math.round(LONG_SIDE / ratio) : LONG_SIDE;
  const [tool, setTool] = useState<Tool>("pencil");
  const [ink, setInk] = useState(INKS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [layers, setLayers] = useState<Layer[]>([{ id: 1, visible: true }]);
  const [active, setActive] = useState(1);
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [showBackdrop, setShowBackdrop] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [history, setHistory] = useState<{ undo: number; redo: number }>({ undo: 0, redo: 0 });
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  const preview = useRef<HTMLCanvasElement>(null);
  const undo = useRef<Snapshot[]>([]);
  const redo = useRef<Snapshot[]>([]);
  const stroke = useRef<{ x: number; y: number; startX: number; startY: number; pointer: number } | null>(null);
  const nextLayer = useRef(2);

  useEffect(() => {
    const d = dialog.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);

  useEffect(() => {
    if (!background) return;
    let alive = true;
    readImage(background)
      .then((src) => alive && setBackdrop(src))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [background]);

  const syncHistory = () => setHistory({ undo: undo.current.length, redo: redo.current.length });

  const ctx = (id: number) => canvases.current.get(id)?.getContext("2d", { willReadFrequently: true }) ?? null;

  const remember = (layer: number) => {
    const c = ctx(layer);
    if (!c) return;
    undo.current.push({ layer, image: c.getImageData(0, 0, width, height) });
    if (undo.current.length > UNDO_DEPTH) undo.current.shift();
    redo.current = [];
    syncHistory();
  };

  const swap = useCallback(
    (from: React.RefObject<Snapshot[]>, to: React.RefObject<Snapshot[]>) => {
      const snap = from.current.pop();
      if (!snap) return;
      const c = ctx(snap.layer);
      if (!c) return;
      to.current.push({ layer: snap.layer, image: c.getImageData(0, 0, width, height) });
      c.putImageData(snap.image, 0, 0);
      setDirty(true);
      setHistory({ undo: undo.current.length, redo: redo.current.length });
    },
    [width, height],
  );

  // Ctrl + Z and Ctrl + Y undo and redo a stroke here, not the project's last action.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" || key === "y") {
        e.preventDefault();
        e.stopPropagation();
        if (key === "y" || e.shiftKey) swap(redo, undo);
        else swap(undo, redo);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [swap]);

  const point = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  };

  // A pen draws thinner when it touches lightly; a mouse or a finger keeps the chosen width.
  const widthOf = (e: ReactPointerEvent) => {
    const base = tool === "eraser" ? size * 3 : size;
    return e.pointerType === "pen" ? base * (0.25 + 1.5 * (e.pressure || 0.5)) : base;
  };

  const arrow = (c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number) => {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const head = 14 + w * 4;
    c.lineWidth = w;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    for (const side of [-1, 1]) {
      c.moveTo(x1, y1);
      c.lineTo(x1 - head * Math.cos(angle + side * 0.5), y1 - head * Math.sin(angle + side * 0.5));
    }
    c.stroke();
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const layer = layers.find((l) => l.id === active);
    if (!layer?.visible) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    remember(active);
    stroke.current = { ...p, startX: p.x, startY: p.y, pointer: e.pointerId };
    if (tool !== "arrow") {
      const c = ctx(active);
      if (!c) return;
      c.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      c.fillStyle = ink;
      c.beginPath();
      c.arc(p.x, p.y, widthOf(e) / 2, 0, Math.PI * 2);
      c.fill();
    }
    setDirty(true);
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stroke.current;
    if (!s || s.pointer !== e.pointerId) return;
    // Pens and fast mice give several points per frame: each one counts.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const r = e.currentTarget.getBoundingClientRect();
    if (tool === "arrow") {
      const p = point(e);
      const c = preview.current?.getContext("2d");
      if (!c) return;
      c.clearRect(0, 0, width, height);
      c.strokeStyle = ink;
      arrow(c, s.startX, s.startY, p.x, p.y, size);
      s.x = p.x;
      s.y = p.y;
      return;
    }
    const c = ctx(active);
    if (!c) return;
    c.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    c.strokeStyle = ink;
    c.lineCap = "round";
    c.lineJoin = "round";
    for (const ev of events) {
      const x = ((ev.clientX - r.left) / r.width) * width;
      const y = ((ev.clientY - r.top) / r.height) * height;
      const base = tool === "eraser" ? size * 3 : size;
      c.lineWidth = ev.pointerType === "pen" ? base * (0.25 + 1.5 * (ev.pressure || 0.5)) : base;
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(x, y);
      c.stroke();
      s.x = x;
      s.y = y;
    }
  };

  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stroke.current;
    if (!s || s.pointer !== e.pointerId) return;
    stroke.current = null;
    if (tool === "arrow") {
      preview.current?.getContext("2d")?.clearRect(0, 0, width, height);
      const c = ctx(active);
      if (c && Math.hypot(s.x - s.startX, s.y - s.startY) > 4) {
        c.globalCompositeOperation = "source-over";
        c.strokeStyle = ink;
        arrow(c, s.startX, s.startY, s.x, s.y, size);
      } else {
        // A click without a drag draws no arrow: nothing to undo either.
        undo.current.pop();
        syncHistory();
      }
    }
  };

  const clearLayer = () => {
    const c = ctx(active);
    if (!c) return;
    remember(active);
    c.clearRect(0, 0, width, height);
    setDirty(true);
  };

  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return;
    const id = nextLayer.current++;
    setLayers([...layers, { id, visible: true }]);
    setActive(id);
  };

  const removeLayer = (id: number) => {
    if (layers.length === 1) return clearLayer();
    const rest = layers.filter((l) => l.id !== id);
    undo.current = undo.current.filter((s) => s.layer !== id);
    redo.current = redo.current.filter((s) => s.layer !== id);
    syncHistory();
    canvases.current.delete(id);
    setLayers(rest);
    if (active === id) setActive(rest[rest.length - 1].id);
    setDirty(true);
  };

  const save = async () => {
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const c = out.getContext("2d")!;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, width, height);
    if (backdrop && showBackdrop) {
      const img = new Image();
      img.src = backdrop;
      await img.decode().catch(() => undefined);
      // The image fills the frame, cut to its ratio as the frame shows it.
      const k = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      c.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    }
    for (const l of layers) {
      const canvas = canvases.current.get(l.id);
      if (l.visible && canvas) c.drawImage(canvas, 0, 0);
    }
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
    if (!blob) return;
    setSaving(true);
    try {
      await onSave(blob);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const leave = () => (dirty ? setConfirmLeave(true) : onClose());

  return (
    <dialog
      ref={dialog}
      className="dialog draw-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (confirmLeave) setConfirmLeave(false);
        else leave();
      }}
    >
      <header className="draw-head">
        <h2 id={titleId}>{title}</h2>
        <span className="muted draw-ratio">{t("storyboard.frameRatio", { ratio: ratioLabel })}</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label={t("common.close")} title={t("common.close")} onClick={leave}>
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="draw-body">
        <div className="draw-tools" role="toolbar" aria-label={t("storyboard.draw.tools")}>
          <div className="draw-group" role="radiogroup" aria-label={t("storyboard.draw.tool")}>
            {(
              [
                ["pencil", Brush],
                ["eraser", Eraser],
                ["arrow", ArrowUpRight],
              ] as const
            ).map(([id, Icon]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tool === id}
                className={tool === id ? "draw-tool on" : "draw-tool"}
                title={t(`storyboard.draw.${id}Hint`)}
                onClick={() => setTool(id)}
              >
                <Icon aria-hidden="true" />
                <span>{t(`storyboard.draw.${id}`)}</span>
              </button>
            ))}
          </div>
          <p className="draw-label">{t("storyboard.draw.ink")}</p>
          <div className="draw-inks" role="radiogroup" aria-label={t("storyboard.draw.ink")}>
            {INKS.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ink === c}
                aria-label={t(`storyboard.draw.inks.${i}`)}
                title={t(`storyboard.draw.inks.${i}`)}
                className={ink === c ? "draw-ink on" : "draw-ink"}
                style={{ background: c }}
                onClick={() => setInk(c)}
              />
            ))}
          </div>
          <p className="draw-label">{t("storyboard.draw.size")}</p>
          <div className="draw-sizes" role="radiogroup" aria-label={t("storyboard.draw.size")}>
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === s}
                aria-label={t("storyboard.draw.sizeN", { n: s })}
                className={size === s ? "draw-size on" : "draw-size"}
                onClick={() => setSize(s)}
              >
                <span style={{ width: Math.max(3, s * 0.9), height: Math.max(3, s * 0.9) }} />
              </button>
            ))}
          </div>
          <div className="draw-history">
            <button type="button" className="icon-btn" disabled={history.undo === 0} aria-label={t("storyboard.draw.undo")} title={t("storyboard.draw.undo")} onClick={() => swap(undo, redo)}>
              <Undo2 aria-hidden="true" />
            </button>
            <button type="button" className="icon-btn" disabled={history.redo === 0} aria-label={t("storyboard.draw.redo")} title={t("storyboard.draw.redo")} onClick={() => swap(redo, undo)}>
              <Redo2 aria-hidden="true" />
            </button>
          </div>
          <p className="draw-label draw-layers-head">
            <Layers aria-hidden="true" />
            {t("storyboard.draw.layers")}
            <button type="button" className="icon-btn" disabled={layers.length >= MAX_LAYERS} aria-label={t("storyboard.draw.addLayer")} title={t("storyboard.draw.addLayer")} onClick={addLayer}>
              <Plus aria-hidden="true" />
            </button>
          </p>
          <ol className="draw-layers">
            {[...layers].reverse().map((l) => {
              const n = layers.indexOf(l) + 1;
              return (
                <li key={l.id} className={l.id === active ? "on" : undefined}>
                  <button type="button" className="draw-layer" aria-pressed={l.id === active} onClick={() => setActive(l.id)}>
                    {t("storyboard.draw.layerN", { n })}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t(l.visible ? "storyboard.draw.hideLayer" : "storyboard.draw.showLayer", { n })}
                    title={t(l.visible ? "storyboard.draw.hideLayer" : "storyboard.draw.showLayer", { n })}
                    onClick={() => setLayers(layers.map((x) => (x.id === l.id ? { ...x, visible: !x.visible } : x)))}
                  >
                    {l.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t(layers.length === 1 ? "storyboard.draw.clear" : "storyboard.draw.removeLayer", { n })}
                    title={t(layers.length === 1 ? "storyboard.draw.clear" : "storyboard.draw.removeLayer", { n })}
                    onClick={() => removeLayer(l.id)}
                  >
                    {layers.length === 1 ? <Minus aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
            {backdrop && (
              <li className="draw-backdrop-row">
                <span className="draw-layer muted">{t("storyboard.draw.backdrop")}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t(showBackdrop ? "storyboard.draw.hideBackdrop" : "storyboard.draw.showBackdrop")}
                  title={t(showBackdrop ? "storyboard.draw.hideBackdrop" : "storyboard.draw.showBackdrop")}
                  onClick={() => {
                    setShowBackdrop(!showBackdrop);
                    setDirty(true);
                  }}
                >
                  {showBackdrop ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                </button>
              </li>
            )}
          </ol>
        </div>
        <div className="draw-stage-wrap">
          <div
            className={`draw-stage tool-${tool}`}
            style={{ aspectRatio: `${width} / ${height}`, ["--ratio" as string]: width / height }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            {backdrop && showBackdrop && <img src={backdrop} alt="" className="draw-backdrop" draggable={false} />}
            {layers.map((l) => (
              <canvas
                key={l.id}
                ref={(el) => {
                  if (el) canvases.current.set(l.id, el);
                }}
                width={width}
                height={height}
                className="draw-layer-canvas"
                hidden={!l.visible}
              />
            ))}
            <canvas ref={preview} width={width} height={height} className="draw-layer-canvas" />
          </div>
        </div>
      </div>
      <footer className="dialog-actions draw-foot">
        {confirmLeave ? (
          <>
            <span className="draw-leave">{t("storyboard.draw.leaveText")}</span>
            <button type="button" className="btn" onClick={() => setConfirmLeave(false)}>
              {t("storyboard.draw.keepDrawing")}
            </button>
            <button type="button" className="btn danger" onClick={onClose}>
              {t("storyboard.draw.discard")}
            </button>
          </>
        ) : (
          <>
            <span className="muted draw-tip">{t("storyboard.draw.tip")}</span>
            <button type="button" className="btn" onClick={leave}>
              {t("common.cancel")}
            </button>
            <button type="button" className="btn primary" disabled={!dirty || saving} onClick={() => void save()}>
              {t("storyboard.draw.save")}
            </button>
          </>
        )}
      </footer>
    </dialog>
  );
}
