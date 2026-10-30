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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ELEMENT_TYPES, type ElementType } from "../domain/formats";
import type { EditorSnapshot, ScriptEditor } from "./editor/ScriptEditor";

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
 * The kinds of element, in a bar fixed at the bottom of the desk, as the tools of the moodboard.
 * Holding Ctrl writes out the shortcut of every type.
 */
export function ElementBar({ editor, snap }: { editor: ScriptEditor | null; snap: EditorSnapshot | null }) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Control") setKeys(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Control") setKeys(false);
    };
    const off = () => setKeys(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
    };
  }, []);

  if (!editor) return null;
  const current = snap?.type ?? "action";

  return (
    <div
      className={keys ? "element-bar keys" : "element-bar"}
      role="toolbar"
      aria-label={t("workspace.element")}
      onMouseDown={(e) => e.preventDefault()}
    >
      {ELEMENT_TYPES.map((type, i) => {
        const Icon = ICONS[type];
        const on = type === current;
        return (
          <button
            key={type}
            type="button"
            className={on ? "on" : undefined}
            aria-pressed={on}
            aria-label={t(`elements.${type}`)}
            aria-keyshortcuts={`Control+${i + 1}`}
            title={`${t(`elements.${type}`)} — Ctrl+${i + 1}`}
            onClick={() => editor.setType(type)}
          >
            <Icon aria-hidden="true" />
            {on && <span aria-hidden="true">{t(`elements.${type}`)}</span>}
            <kbd aria-hidden="true">{i + 1}</kbd>
          </button>
        );
      })}
    </div>
  );
}
