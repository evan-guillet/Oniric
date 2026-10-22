import { keymap } from "prosemirror-keymap";
import { baseKeymap, setBlockType, splitBlock, splitBlockAs } from "prosemirror-commands";
import { undo, redo } from "prosemirror-history";
import { Plugin, type Command, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { ELEMENT_TYPES, type ElementType } from "../../domain/formats";
import { frenchSpacing } from "../../domain/typography";
import { newSceneId, schema } from "./schema";

const NEXT_ON_ENTER: Record<ElementType, ElementType> = {
  scene_heading: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "character",
  transition: "scene_heading",
  shot: "action",
  on_screen_text: "action",
};

const NEXT_ON_TAB: Record<ElementType, ElementType> = {
  action: "character",
  character: "transition",
  transition: "scene_heading",
  scene_heading: "action",
  dialogue: "parenthetical",
  parenthetical: "dialogue",
  shot: "action",
  on_screen_text: "action",
};

const PREVIOUS_ON_TAB = Object.fromEntries(
  Object.entries(NEXT_ON_TAB)
    .filter(([from]) => from !== "shot" && from !== "on_screen_text")
    .map(([from, to]) => [to, from]),
) as Record<ElementType, ElementType>;

export function currentType(state: EditorState): ElementType {
  return state.selection.$from.parent.type.name as ElementType;
}

export function setType(type: ElementType): Command {
  return setBlockType(schema.nodes[type]);
}

const enter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty) return splitBlock(state, dispatch);
  const block = $from.parent;
  const type = block.type.name as ElementType;
  if (block.content.size === 0 && (type === "character" || type === "dialogue" || type === "parenthetical")) {
    return setType("action")(state, dispatch);
  }
  if ($from.parentOffset < block.content.size) return splitBlock(state, dispatch);
  return splitBlockAs(() => ({ type: schema.nodes[NEXT_ON_ENTER[type]] }))(state, dispatch);
};

const cycle =
  (map: Record<ElementType, ElementType>): Command =>
  (state, dispatch) =>
    setType(map[currentType(state)] ?? "action")(state, dispatch);

const typeShortcuts: Record<string, Command> = {};
ELEMENT_TYPES.forEach((type, i) => {
  typeShortcuts[`Mod-${i + 1}`] = setType(type);
});

export function screenplayKeymap(): Plugin[] {
  return [
    keymap({
      Enter: enter,
      Tab: cycle(NEXT_ON_TAB),
      "Shift-Tab": cycle(PREVIOUS_ON_TAB),
      "Mod-z": undo,
      "Mod-y": redo,
      "Shift-Mod-z": redo,
      ...typeShortcuts,
    }),
    keymap(baseKeymap),
  ];
}

const HEADING_START = /^(INT|EXT|INT\.?\/EXT|I\/E|EST)\.$/i;

/** Typing "INT." at the start of an action turns it into a scene heading; "(" at the start of a dialogue, into a parenthetical. */
export const elementInputRules = new Plugin({
  props: {
    handleTextInput(view, from, to, text) {
      const { $from } = view.state.selection;
      const block = $from.parent;
      if (block.type === schema.nodes.dialogue && text === "(" && block.content.size === 0) {
        view.dispatch(view.state.tr.setBlockType(from, from, schema.nodes.parenthetical).insertText(text, from, to));
        return true;
      }
      if (block.type !== schema.nodes.action) return false;
      const typed = block.textBetween(0, $from.parentOffset) + text;
      if (!HEADING_START.test(typed)) return false;
      view.dispatch(view.state.tr.insertText(text, from, to).setBlockType(from, from, schema.nodes.scene_heading));
      return true;
    },
  },
});

/** French typography while typing, when the format's language asks for it. */
export function typographyPlugin(enabled: () => boolean): Plugin {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (!enabled() || text.length !== 1) return false;
        const { $from } = view.state.selection;
        const fix = frenchSpacing($from.parent.textBetween(0, $from.parentOffset), text);
        if (!fix || from - fix.remove < $from.start()) return false;
        view.dispatch(view.state.tr.insertText(fix.insert, from - fix.remove, to));
        return true;
      },
    },
  });
}

/** Shows what the empty element under the cursor is for ("Personnage", "Dialogue"…). */
export function placeholderPlugin(hint: (type: ElementType) => string): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { $from, empty } = state.selection;
        const block = $from.parent;
        if (!empty || !block.isTextblock || block.content.size > 0) return null;
        const pos = $from.before();
        return DecorationSet.create(state.doc, [
          Decoration.node(pos, pos + block.nodeSize, { class: "is-empty", "data-hint": hint(block.type.name as ElementType) }),
        ]);
      },
    },
  });
}

/** Keeps one scene node per scene heading: splits a scene at a new heading, merges a scene that lost its heading. */
export const sceneNormalizer = new Plugin({
  appendTransaction(trs, _old, state) {
    if (!trs.some((t) => t.docChanged)) return null;
    return normalizeScenes(state);
  },
});

export function normalizeScenes(state: EditorState): Transaction | null {
  const tr = state.tr;
  const splits: number[] = [];
  state.doc.forEach((scene, sceneOffset) => {
    scene.forEach((block, blockOffset, index) => {
      if (index > 0 && block.type === schema.nodes.scene_heading) splits.push(sceneOffset + 1 + blockOffset);
    });
  });
  for (const pos of splits.reverse()) tr.split(pos, 1, [{ type: schema.nodes.scene, attrs: { id: newSceneId() } }]);

  const joins: number[] = [];
  const seen = new Set<string>();
  tr.doc.forEach((scene, offset, index) => {
    if (index > 0 && scene.firstChild?.type !== schema.nodes.scene_heading) joins.push(offset);
    if (!scene.attrs.id || seen.has(scene.attrs.id)) tr.setNodeAttribute(offset, "id", newSceneId());
    seen.add(scene.attrs.id);
  });
  for (const pos of joins.reverse()) tr.join(pos);
  return tr.docChanged ? tr : null;
}
