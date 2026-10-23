import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface CheckItem<T extends string> {
  id: T;
  label: string;
  /** A muted second line that says what the option does. */
  hint?: string;
  checked: boolean;
}

/**
 * A button that opens options to switch on and off, each with its box: the menu stays open while they are ticked,
 * and closes with Escape, a click outside or the button again.
 */
export function CheckMenu<T extends string>({
  label,
  icon: Icon,
  items,
  onToggle,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  items: CheckItem<T>[];
  onToggle: (id: T) => void;
  disabled?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const open = !!at && !disabled;

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => menu.current?.querySelector("button")?.focus());
    const close = () => setAt(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        button.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const all = [...(menu.current?.querySelectorAll("button") ?? [])];
        const i = all.indexOf(document.activeElement as HTMLButtonElement);
        all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
        e.preventDefault();
      } else if (e.key === "Tab") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={open ? "check-menu-btn on" : "check-menu-btn"}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { top: r.bottom + 6, right: window.innerWidth - r.right });
        }}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown className="check-menu-caret" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={menu} className="project-menu check-menu" role="menu" aria-label={label} style={at}>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={item.checked}
                onClick={() => onToggle(item.id)}
              >
                <span className="check-box" aria-hidden="true">
                  {item.checked && <Check />}
                </span>
                <span className="more-item">
                  {item.label}
                  {item.hint && <span className="more-item-hint">{item.hint}</span>}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
