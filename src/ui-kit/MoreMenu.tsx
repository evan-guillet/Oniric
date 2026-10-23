import { Ellipsis, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** `hint` is a second, muted line that says what the action does; it is read as the item's description. */
export type MoreItem = { label: string; icon: LucideIcon; hint?: string; danger?: boolean; onClick: () => void };

/** The « ⋯ » button and its menu (rename, delete…), drawn over the page so no scrolling box clips it.
 * Inside a modal <dialog> it is drawn in the dialog: outside, the page is inert. */
export function MoreMenu({ label, items, className = "" }: { label: string; items: MoreItem[]; className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const id = useId();
  useEffect(() => {
    if (!at) return;
    requestAnimationFrame(() => menu.current?.querySelector("button")?.focus());
    const close = () => setAt(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        button.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const all = [...(menu.current?.querySelectorAll("button") ?? [])];
        const i = all.indexOf(document.activeElement as HTMLButtonElement);
        all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [at]);
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
      {at &&
        createPortal(
          <div ref={menu} className="project-menu more-menu" role="menu" style={{ top: at.top, right: at.right }}>
            {items.map(({ label, icon: Icon, hint, danger, onClick }, i) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                className={[danger && "danger", hint && "with-hint"].filter(Boolean).join(" ") || undefined}
                aria-describedby={hint ? `${id}-${i}` : undefined}
                onClick={() => {
                  setAt(null);
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
          button.current?.closest("dialog") ?? document.body,
        )}
    </>
  );
}
