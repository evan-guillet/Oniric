import { Ellipsis, type LucideIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";

/** `hint` is a second, muted line that says what the action does; it is read as the item's description. */
export type MoreItem = {
  label: string;
  icon: LucideIcon;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
};

/**
 * A menu drawn over the page so no scrolling box clips it, with the arrows, Escape and outside clicks of a menu.
 * Inside a modal <dialog> it is drawn in the dialog: outside, the page is inert.
 */
function FloatingMenu({
  items,
  style,
  anchor,
  onClose,
  menuRef,
}: {
  items: MoreItem[];
  style: CSSProperties;
  menuRef?: RefObject<HTMLDivElement | null>;
  /** What opened the menu: a click on it is not a click outside, and Escape gives it the focus back. */
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const own = useRef<HTMLDivElement>(null);
  const menu = menuRef ?? own;
  const id = useId();
  // The owner's close callback may change at every render; the listeners keep the latest without starting over.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onClose = () => closeRef.current();
    requestAnimationFrame(() => menu.current?.querySelector("button")?.focus());
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        anchor.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const all = [...(menu.current?.querySelectorAll("button") ?? [])];
        const i = all.indexOf(document.activeElement as HTMLButtonElement);
        all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, menu]);
  return createPortal(
    <div ref={menu} className="project-menu more-menu" role="menu" style={style}>
      {items.map(({ label, icon: Icon, hint, danger, onClick }, i) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          className={[danger && "danger", hint && "with-hint"].filter(Boolean).join(" ") || undefined}
          aria-describedby={hint ? `${id}-${i}` : undefined}
          onClick={() => {
            onClose();
            onClick();
          }}
        >
          <Icon aria-hidden="true" />
          {hint ? (
            <span className="more-item">
              {label}
              <span id={`${id}-${i}`} className="more-item-hint">
                {hint}
              </span>
            </span>
          ) : (
            label
          )}
        </button>
      ))}
    </div>,
    anchor.current?.closest("dialog") ?? document.body,
  );
}

/** The « ⋯ » button and its menu (rename, delete…). */
export function MoreMenu({ label, items, className = "" }: { label: string; items: MoreItem[]; className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`more-btn ${at ? "on" : ""} ${className}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { top: r.bottom + 4, right: window.innerWidth - r.right });
        }}
      >
        <Ellipsis aria-hidden="true" />
      </button>
      {at && (
        <FloatingMenu
          items={items}
          anchor={button}
          style={{ top: at.top, right: at.right }}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}

/**
 * The menu of a right click, at the pointer, kept inside the window. From the keyboard (the menu key, Shift+F10)
 * there is no pointer: it opens under the element.
 */
export function ContextMenu({
  at,
  anchor,
  items,
  onClose,
}: {
  at: { x: number; y: number };
  anchor: RefObject<HTMLElement | null>;
  items: MoreItem[];
  onClose: () => void;
}) {
  const [style, setStyle] = useState<CSSProperties>({
    top: at.y,
    left: at.x,
    visibility: "hidden",
  });
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const w = menu.current?.offsetWidth ?? 0;
    const h = menu.current?.offsetHeight ?? 0;
    setStyle({
      top: Math.max(8, Math.min(at.y, window.innerHeight - h - 8)),
      left: Math.max(8, Math.min(at.x, window.innerWidth - w - 8)),
    });
  }, [at.x, at.y]);
  return <FloatingMenu items={items} anchor={anchor} style={style} onClose={onClose} menuRef={menu} />;
}
