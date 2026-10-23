import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

const gapsKey = new PluginKey<DecorationSet>("sceneGaps");

/** The space between two scenes: a line and « + Nouvelle scène », shown on hover by the card display. */
function gapWidget(afterId: string, onAdd: (afterId: string) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "scene-gap";
  root.contentEditable = "false";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scene-gap-add";
  button.tabIndex = -1;
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>Nouvelle scène</span>';
  // The editor keeps its selection until the click is done.
  button.addEventListener("mousedown", (e) => e.preventDefault());
  button.addEventListener("click", (e) => {
    e.preventDefault();
    onAdd(afterId);
  });
  root.appendChild(button);
  return root;
}

function gaps(doc: PMNode, onAdd: (afterId: string) => void): DecorationSet {
  const decos: Decoration[] = [];
  const last = doc.childCount - 1;
  doc.forEach((scene, offset, i) => {
    if (i === last) return;
    const id = scene.attrs.id as string;
    decos.push(
      Decoration.widget(offset + scene.nodeSize, () => gapWidget(id, onAdd), {
        key: `gap-${id}`,
        side: -1,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    );
  });
  return DecorationSet.create(doc, decos);
}

/** A place to add a scene between every two scenes; `onAdd` gets the id of the scene above. */
export function sceneGapsPlugin(onAdd: (afterId: string) => void): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: gapsKey,
    state: {
      init: (_config, state) => gaps(state.doc, onAdd),
      apply: (tr, old) => (tr.docChanged ? gaps(tr.doc, onAdd) : old),
    },
    props: { decorations: (state) => gapsKey.getState(state) },
  });
}
