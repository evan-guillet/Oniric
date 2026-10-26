import { ChevronDown } from "lucide-react";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Option = { value: string; label: ReactNode; text: string; disabled: boolean; hidden: boolean; group?: string };

/** Plain text of a label, for type-to-find. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** The <option> and <optgroup> elements written inside, as they would be in a native <select>. */
function readOptions(children: ReactNode, group?: string): Option[] {
  return Children.toArray(children).flatMap((child): Option[] => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    const p = child.props;
    if (child.type === Fragment) return readOptions(p.children as ReactNode, group);
    if (child.type === "optgroup") return readOptions(p.children as ReactNode, String(p.label ?? ""));
    if (child.type !== "option") return [];
    const label = p.children as ReactNode;
    return [
      {
        value: String(p.value ?? textOf(label)),
        label,
        text: textOf(label),
        disabled: !!p.disabled,
        hidden: !!p.hidden,
        group,
      },
    ];
  });
}

/**
 * A choice in a list, written like a native <select> (its <option> and <optgroup>, `onChange` gets `e.target.value`)
 * but opening the menu of « Affichage »: one round box per option, the chosen one filled in blue. An option marked
 * `hidden` only shows in the field, for a prompt such as « + Lier… ».
 */
export function Select({
  value,
  onChange,
  children,
  className,
  disabled,
  id,
  title,
  defaultOpen,
  onClose,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  title?: string;
  /** Opens the list as soon as it shows, for a field that only appears to make one choice. */
  defaultOpen?: boolean;
  /** When the list closes, chosen or not. */
  onClose?: () => void;
  "aria-label"?: string;
}) {
  const options = readOptions(children);
  const current = options.find((o) => o.value === value);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(!!defaultOpen);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const typed = useRef({ text: "", at: 0 });

  // The listeners below are set once per opening; they reach the latest owner callback through this.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = (refocus: boolean) => {
    setOpen(false);
    onCloseRef.current?.();
    if (refocus) button.current?.focus();
  };
  const choose = (o: Option) => {
    close(true);
    if (o.value !== value) onChange({ target: { value: o.value } });
  };

  // Under the field, as wide as it at least; above it when there is no room below, and always inside the window.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const r = button.current.getBoundingClientRect();
    const m = menu.current;
    const width = Math.max(r.width, m.offsetWidth);
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    const up = Math.min(400, m.offsetHeight) > below && above > below;
    const room = up ? above : below;
    setStyle({
      minWidth: r.width,
      maxHeight: Math.max(120, Math.min(400, room)),
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const on = menu.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? menu.current?.querySelector("button");
      on?.focus();
      on?.scrollIntoView({ block: "nearest" });
    });
    const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const all = items();
      const i = all.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if (e.key === "Tab") {
        close(false);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        all[e.key === "Home" ? 0 : all.length - 1]?.focus();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && e.key !== " ") {
        // Typing the start of a name goes to it, as in a native list.
        const now = Date.now();
        typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
        const hit = all.find((b) => (b.textContent ?? "").trim().toLowerCase().startsWith(typed.current.text));
        hit?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    const onResize = () => close(false);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const listed = options.filter((o) => !o.hidden);
  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={["select", className, open && "on"].filter(Boolean).join(" ")}
        title={title}
        aria-label={ariaLabel && `${ariaLabel} : ${current?.text ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) close(false);
          else {
            setStyle({ visibility: "hidden" });
            setOpen(true);
          }
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setStyle({ visibility: "hidden" });
            setOpen(true);
          }
        }}
      >
        <span className="select-value">{current?.label ?? ""}</span>
        <ChevronDown className="select-caret" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={menu} id={listId} className="project-menu check-menu select-menu" role="listbox" aria-label={ariaLabel} style={style}>
            {listed.map((o) => {
              const head = o.group !== lastGroup && o.group ? o.group : null;
              lastGroup = o.group;
              return (
                <Fragment key={`${o.group ?? ""}:${o.value}`}>
                  {head && (
                    <div className="select-group" role="presentation">
                      {head}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    disabled={o.disabled}
                    onClick={() => choose(o)}
                  >
                    <span className="check-box radio" aria-hidden="true" />
                    <span className="more-item">{o.label}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>,
          button.current?.closest("dialog") ?? document.body,
        )}
    </>
  );
}
