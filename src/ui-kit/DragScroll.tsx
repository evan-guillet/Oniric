import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/** What a press on starts its own action rather than moving the sheet. */
const OWN = "button, a, input, select, textarea, label, [role='radio'], [role='option'], [contenteditable='true']";

/**
 * A wide sheet that the mouse moves sideways: pressed anywhere but on a control, it follows the pointer, and the
 * wheel turns it sideways when there is nothing to scroll down. The box takes `drag-scroll` while it is wider than it
 * shows (a double arrow for a cursor) and `dragging` while it is held.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const mark = () => box.classList.toggle("drag-scroll", box.scrollWidth > box.clientWidth + 1);
    mark();
    const sizes = new ResizeObserver(mark);
    sizes.observe(box);
    if (box.firstElementChild) sizes.observe(box.firstElementChild);
    let held: { x: number; left: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !box.classList.contains("drag-scroll") || (e.target as Element).closest(OWN)) return;
      held = { x: e.clientX, left: box.scrollLeft, id: e.pointerId };
      box.setPointerCapture(e.pointerId);
      box.classList.add("dragging");
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (held?.id === e.pointerId) box.scrollLeft = held.left - (e.clientX - held.x);
    };
    const up = (e: PointerEvent) => {
      if (held?.id !== e.pointerId) return;
      held = null;
      box.classList.remove("dragging");
      if (box.hasPointerCapture(e.pointerId)) box.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (box.scrollHeight > box.clientHeight + 1 || box.scrollWidth <= box.clientWidth + 1) return;
      box.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    box.addEventListener("wheel", wheel, { passive: false });
    return () => {
      sizes.disconnect();
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", up);
      box.removeEventListener("wheel", wheel);
    };
  }, [ref]);
}

/** A scrolling box moved by the mouse as above. */
export function DragScroll({ className, children }: { className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useDragScroll(box);
  return (
    <div ref={box} className={className}>
      {children}
    </div>
  );
}
