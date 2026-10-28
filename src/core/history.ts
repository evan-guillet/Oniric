import { commands } from "../bindings";
import { unwrap } from "./db/client";

/**
 * The project's undo line [ergonomics]. The core keeps every write as a step; the screenplay's text has its own
 * history in the editor, and an action done on it from outside its text (a scene put back, a version restored) is a
 * step the editor undoes. Ctrl+Z in a text field stays with the field.
 */
export interface EditorUndo {
  undoDepth(): number;
  redoDepth(): number;
  undo(): boolean;
  redo(): boolean;
}

/** Puts an action just done in the editor in the project's undo line; `absorb` joins the write just made for it. */
export async function markEditorStep(editor: EditorUndo, label: string, absorb = false): Promise<void> {
  unwrap(await commands.historyMark(label, editor.undoDepth(), absorb));
}

export type HistoryOutcome = { label: string } | "none" | "textChanged";

/** Undoes the project's last action, or does again the last one undone (`redo`). */
export async function stepHistory(redo: boolean, editor: EditorUndo | null): Promise<HistoryOutcome> {
  for (;;) {
    const state = unwrap(await commands.historyState());
    const next = redo ? state.redo : state.undo;
    if (!next) return "none";
    if (next.editor !== null) {
      const depth = editor?.undoDepth() ?? -1;
      const expected = redo ? next.editor - 1 : next.editor;
      // Undone (or written over) in the editor since: the step has nothing left to do.
      const gone = !editor || (redo ? depth !== expected || editor.redoDepth() === 0 : depth < expected);
      if (gone) {
        unwrap(await commands.historyDrop(redo));
        continue;
      }
      if (depth > expected) return "textChanged";
    }
    const done = unwrap(await commands.historyStep(redo));
    if (!done) return "none";
    if (done.editor !== null && editor) {
      if (redo) editor.redo();
      else editor.undo();
    }
    return { label: done.label };
  }
}
