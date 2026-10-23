import {
  AlignLeft,
  Captions,
  ChevronsRight,
  Clapperboard,
  MessageSquareQuote,
  Parentheses,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ELEMENT_TYPES, type ElementType } from "../domain/formats";
import type { EditorSnapshot, ScriptEditor } from "./editor/ScriptEditor";

const GAP = 6;

const ICONS: Record<ElementType, LucideIcon> = {
  scene_heading: Clapperboard,
  action: AlignLeft,
  character: UserRound,
  parenthetical: Parentheses,
  dialogue: MessageSquareQuote,
  transition: ChevronsRight,
  shot: Video,
  on_screen_text: Captions,
};

/**
 * The kinds of element, floating just above the line that holds the cursor, as in Notion.
 * It shows while the editor has the focus, steps aside while typing, and comes back with the mouse.
 */
export function ElementBar({ editor, column, snap }: { editor: ScriptEditor | null; column: RefObject<HTMLDivElement | null>; snap: EditorSnapshot | null }) {
  const { t } = useTranslation();
  const barRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const dom = editor?.view.dom;
    const host = column.current;
    if (!dom || !host) return;
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Shift") return;
      setTyping(true);
    };
    const onPointer = () => setTyping(false);
    setFocused(document.activeElement === dom);
    dom.addEventListener("focus", onFocus);
    dom.addEventListener("blur", onBlur);
    dom.addEventListener("keydown", onKey);
    host.addEventListener("mousemove", onPointer);
    host.addEventListener("mousedown", onPointer);
    return () => {
      dom.removeEventListener("focus", onFocus);
      dom.removeEventListener("blur", onBlur);
      dom.removeEventListener("keydown", onKey);
      host.removeEventListener("mousemove", onPointer);
      host.removeEventListener("mousedown", onPointer);
    };
  }, [editor, column]);

  const shown = !!editor && focused && !typing;

  useLayoutEffect(() => {
    const host = column.current;
    const bar = barRef.current;
    if (!shown || !editor || !host || !bar) return;
    const { $from } = editor.view.state.selection;
    if ($from.depth < 2) return setPos(null);
    const el = editor.view.nodeDOM($from.before());
    if (!(el instanceof HTMLElement)) return setPos(null);
    const box = host.getBoundingClientRect();
    const line = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(line.left - box.left, box.width - bar.offsetWidth - 8));
    setPos({ top: line.top - box.top - bar.offsetHeight - GAP, left });
  }, [shown, editor, column, snap]);

  if (!editor) return null;
  const current = snap?.type ?? "action";

  return (
    <div
      ref={barRef}
      className="element-bar"
      role="toolbar"
      aria-label={t("workspace.element")}
      hidden={!shown}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {ELEMENT_TYPES.map((type, i) => {
        const Icon = ICONS[type];
        return (
          <button
            key={type}
            type="button"
            className={type === current ? "on" : undefined}
            aria-pressed={type === current}
            aria-label={t(`elements.${type}`)}
            aria-keyshortcuts={`Control+${i + 1}`}
            title={`${t(`elements.${type}`)} — Ctrl+${i + 1}`}
            onClick={() => editor.setType(type)}
          >
            <Icon aria-hidden="true" />
            <kbd aria-hidden="true">{i + 1}</kbd>
          </button>
        );
      })}
      <span className="element-bar-name" aria-hidden="true">
        {t(`elements.${current}`)}
      </span>
    </div>
  );
}
