import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const MIN = 0.15;
const MAX = 1.6;
const STEP = 1.2;
const clamp = (z: number) => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100));

// What keeps its own gesture: drag handles, fields and the small buttons; anything else can start a pan.
const OWN_GESTURE = ".grip, [draggable=true], input, textarea, select, .more-btn, .head-add, .head-fold, .cv-insert, .cv-ghost, .canvas-tools";

/**
 * A surface that scrolls both ways and zooms with Ctrl + wheel or its corner buttons. It pans in X and Y when
 * dragged from anywhere, cards included (a drag never ends in a click), or with the middle button; the wheel
 * scrolls it up and down, Shift + wheel sideways. What it holds is laid out at its natural size, then scaled as one.
 */
export function CanvasSurface({ children, place, tools, onDragEnd }: { children: ReactNode; place: string; tools?: ReactNode; onDragEnd?: () => void }) {
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

  // How far the surface is panned sideways, in the units of what it holds: what holds at the left edge reads it.
  const trackScroll = useCallback(() => {
    const el = box.current;
    world.current?.style.setProperty("--scroll-x", `${el ? el.scrollLeft / current.current : 0}px`);
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && pending.current) {
      el.scrollLeft = pending.current.left;
      el.scrollTop = pending.current.top;
      pending.current = null;
    }
    trackScroll();
  }, [zoom, trackScroll]);

  // A new place (the whole story, an act, a sequence) starts at its top left.
  useLayoutEffect(() => {
    box.current?.scrollTo({ left: 0, top: 0 });
  }, [place]);

  // Everything in view from the top left, never larger than life.
  const fit = () => {
    const el = box.current;
    const w = world.current?.getBoundingClientRect();
    if (!el || !w) return;
    const natural = { w: w.width / current.current, h: w.height / current.current };
    zoomTo(Math.min(1, el.clientWidth / natural.w, el.clientHeight / natural.h));
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
    let start: { x: number; y: number; left: number; top: number; id: number } | null = null;
    let moved = false;
    const down = (e: PointerEvent) => {
      const middle = e.button === 1;
      if (!middle && (e.button !== 0 || (e.target as Element).closest(OWN_GESTURE))) return;
      // The middle button pans at once, instead of the browser's autoscroll.
      if (middle) e.preventDefault();
      start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
      moved = false;
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add("panning");
      }
      el.scrollLeft = start.left - dx;
      el.scrollTop = start.top - dy;
    };
    const up = () => {
      start = null;
      el.classList.remove("panning");
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
      <div className="canvas" ref={box} onDragEnd={onDragEnd} onScroll={trackScroll}>
        <div className="canvas-world" ref={world} style={{ zoom }}>
          {children}
        </div>
      </div>
      <div className="canvas-tools" role="toolbar" aria-label="Outils du canevas">
        {tools && (
          <>
            {tools}
            <span className="canvas-tools-sep" aria-hidden="true" />
          </>
        )}
        <button type="button" aria-label="Dézoomer" title="Dézoomer (Ctrl + molette)" disabled={zoom <= MIN} onClick={() => zoomTo(current.current / STEP)}>
          <Minus aria-hidden="true" />
        </button>
        <button type="button" className="canvas-pct" title="Taille réelle" onClick={() => zoomTo(1)}>
          {Math.round(zoom * 100)} %
        </button>
        <button type="button" aria-label="Zoomer" title="Zoomer (Ctrl + molette)" disabled={zoom >= MAX} onClick={() => zoomTo(current.current * STEP)}>
          <Plus aria-hidden="true" />
        </button>
        <button type="button" aria-label="Tout voir" title="Tout voir" onClick={fit}>
          <Maximize aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
