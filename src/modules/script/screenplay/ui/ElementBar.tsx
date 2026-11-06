import {
  AlignLeft,
  Captions,
  ChevronsRight,
  Clapperboard,
  MessageSquareQuote,
  Parentheses,
  StickyNote,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
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
 * Holding Ctrl writes out the shortcut of every type. At the end of the bar, a note on the passage selected.
 */
export function ElementBar({ editor, snap, onNote }: { editor: ScriptEditor | null; snap: EditorSnapshot | null; onNote: () => void }) {
  const { t } = useTranslation();

  if (!editor) return null;
  const current = snap?.type ?? "action";

  return (
    <div
      className="element-bar"
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
      <span className="element-bar-sep" aria-hidden="true" />
      <button type="button" className="element-bar-note" title={`${t("script.notes.create")} — ${t("script.notes.createHint")}`} onClick={onNote}>
        <StickyNote aria-hidden="true" />
        {t("script.notes.note")}
      </button>
    </div>
  );
}
