import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../../../core/i18n";

const MIN = 0.15;
const MAX = 1.6;
const STEP = 1.2;
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100));

// What a drag scrolls sideways: a row of scenes, on its own.
const ROW = ".cv-cards";
// What keeps its own gesture inside them: drag handles, fields and the small buttons.
const OWN_GESTURE = ".grip, [draggable=true], input, textarea, select, .more-btn, .head-add, .head-fold, .cv-insert, .cv-ghost, .canvas-tools";

/**
 * A surface as wide as the view that scrolls up and down (wheel, scrollbar) and zooms with Ctrl + wheel or its corner
 * buttons. Each row of scenes scrolls sideways on its own, the rest holding still: dragged, cards included (a drag
 * never ends in a click), or with Shift + wheel. The middle button pans the surface both ways. What it holds is laid
 * out at its natural size, then scaled as one.
 */
export function CanvasSurface({ children, tools, onDragEnd }: { children: ReactNode; tools?: ReactNode; onDragEnd?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const current = useRef(1);
  // The scroll position that keeps the point under the pointer still, applied once the new zoom is laid out.
  const pending = useRef<{ left: number; top: number } | null>(null);

  const zoomTo = useCallback((next: number, x?: number, y?: number) => {
    const el = box.current;
    const z = clamp(next);
    if (!el || z === current.current) return;
    const px = x ?? el.clientWidth / 2;
    const py = y ?? el.clientHeight / 2;
    const k = z / current.current;
    pending.current = { left: (el.scrollLeft + px) * k - px, top: (el.scrollTop + py) * k - py };
    current.current = z;
    setZoom(z);
  }, []);

  // The width of the view, in the units of what it holds: the rows of scenes run to its right edge.
  const fitWidth = useCallback(() => {
    const el = box.current;
    if (el) world.current?.style.setProperty("--view-w", `${Math.floor(el.clientWidth / current.current)}px`);
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && pending.current) {
      el.scrollLeft = pending.current.left;
      el.scrollTop = pending.current.top;
      pending.current = null;
    }
    fitWidth();
  }, [zoom, fitWidth]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(fitWidth);
    watch.observe(el);
    return () => watch.disconnect();
  }, [fitWidth]);

  // Everything in view from the top, never larger than life; the rows of scenes keep scrolling sideways.
  const fit = () => {
    const el = box.current;
    const w = world.current?.getBoundingClientRect();
    if (!el || !w) return;
    zoomTo(Math.min(1, el.clientHeight / (w.height / current.current)));
    if (pending.current) pending.current = { left: 0, top: 0 };
    else el.scrollTo({ left: 0, top: 0 });
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(current.current * Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
    };
    // The free pan moves the surface; a drag on a row moves that row.
  let start: { x: number; y: number; left: number; top: number; id: number; target: Element } | null = null;
    let moved = false;
    const down = (e: PointerEvent) => {
      const middle = e.button === 1;
      const target = e.target as Element;
      const row = target.closest(ROW);
      if (!middle && (e.button !== 0 || !row || target.closest(OWN_GESTURE))) return;
      // The middle button pans at once, instead of the browser's autoscroll.
      if (middle) e.preventDefault();
      const moving = middle || !row ? el : row;
      start = { x: e.clientX, y: e.clientY, left: moving.scrollLeft, top: el.scrollTop, id: e.pointerId, target: moving };
      moved = false;
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const free = start.target === el;
      if (!moved && (free ? Math.hypot(dx, dy) : Math.abs(dx)) < 4) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add(free ? "panning-free" : "panning");
      }
      // The pointer may stray off the row: it stays the one being dragged, in the zoomed units it scrolls in.
      start.target.scrollLeft = start.left - (free ? dx : dx / current.current);
      if (free) el.scrollTop = start.top - dy;
    };
    const up = () => {
      start = null;
      el.classList.remove("panning", "panning-free");
    };
    // A pan that started on a card does not open it.
    const click = (e: MouseEvent) => {
      if (!moved) return;
      moved = false;
      e.stopPropagation();
      e.preventDefault();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("click", click, true);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [zoomTo]);

  return (
    <div className="canvas-wrap">
      <div className="canvas" ref={box} onDragEnd={onDragEnd} >
        <div className="canvas-world" ref={world} style={{ zoom }}>
          {children}
        </div>
      </div>
      <div className="canvas-tools" role="toolbar" aria-label={t("canvas.tools")}>
        {tools && (
          <>
            {tools}
            <span className="canvas-tools-sep" aria-hidden="true" />
          </>
        )}
        <button type="button" aria-label={t("canvas.zoomOut")} title={t("canvas.zoomOutTitle")} disabled={zoom <= MIN} onClick={() => zoomTo(current.current / STEP)}>
          <Minus aria-hidden="true" />
        </button>
        <button type="button" className="canvas-pct" title={t("canvas.actual")} onClick={() => zoomTo(1)}>
          {Math.round(zoom * 100)} %
        </button>
        <button type="button" aria-label={t("canvas.zoomIn")} title={t("canvas.zoomInTitle")} disabled={zoom >= MAX} onClick={() => zoomTo(current.current * STEP)}>
          <Plus aria-hidden="true" />
        </button>
        <button type="button" aria-label={t("canvas.fit")} title={t("canvas.fit")} onClick={fit}>
          <Maximize aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
