import { Schema, type NodeSpec, type Node as PMNode } from "prosemirror-model";
import { uuidv7 } from "../../../../../core/ids";
import type { ScriptBlock } from "../../domain/blocks";
import { ELEMENT_TYPES, type ElementType } from "../../domain/formats";

const blockNodes: Record<string, NodeSpec> = {};
for (const type of ELEMENT_TYPES) {
  blockNodes[type] = {
    group: "block",
    content: "text*",
    marks: "wikilink note",
    defining: true,
    parseDOM: [{ tag: `p[data-type="${type}"]` }],
    toDOM: () => ["p", { class: `el el-${type}`, "data-type": type }, 0],
  };
}

/** One `scene` node per scene, carrying the id of its row in the database (architecture, 6.4). */
export const schema = new Schema({
  nodes: {
    doc: { content: "scene+" },
    scene: {
      content: "block+",
      attrs: { id: { default: "" } },
      parseDOM: [{ tag: "div.scene", getAttrs: (dom) => ({ id: (dom as HTMLElement).dataset.id ?? "" }) }],
      toDOM: (node) => ["div", { class: "scene", "data-id": node.attrs.id }, 0],
    },
    ...blockNodes,
    text: {},
  },
  marks: {
    /** A link to a bible entry [BIB-02]: colour only, so that the line breaks stay those of the printed page. */
    wikilink: {
      attrs: { id: {} },
      inclusive: false,
      parseDOM: [{ tag: "span.wikilink", getAttrs: (dom) => ({ id: (dom as HTMLElement).dataset.id }) }],
      toDOM: (mark) => ["span", { class: "wikilink", "data-id": mark.attrs.id }, 0],
    },
    /** The passage a margin note is anchored to [EDT-07]. */
    note: {
      attrs: { id: {} },
      inclusive: false,
      excludes: "",
      parseDOM: [{ tag: "span.note-mark", getAttrs: (dom) => ({ id: (dom as HTMLElement).dataset.note }) }],
      toDOM: (mark) => ["span", { class: "note-mark", "data-note": mark.attrs.id }, 0],
    },
  },
});

export const newSceneId = () => uuidv7();

export function emptyDoc(): PMNode {
  return schema.nodes.doc.create(null, schema.nodes.scene.create({ id: newSceneId() }, schema.nodes.scene_heading.create()));
}

export function docFromBlocks(blocks: ScriptBlock[]): PMNode {
  const scenes: PMNode[][] = [[]];
  for (const b of blocks) {
    if (b.type === "scene_heading" && scenes[scenes.length - 1].length > 0) scenes.push([]);
    const text = b.text.length > 0 ? [schema.text(b.text)] : [];
    scenes[scenes.length - 1].push(schema.nodes[b.type].create(null, text));
  }
  if (scenes[0].length === 0) return emptyDoc();
  return schema.nodes.doc.create(
    null,
    scenes.map((blocks) => schema.nodes.scene.create({ id: newSceneId() }, blocks)),
  );
}

/** The elements of the screenplay; `numbered` gives each scene heading the number of its scene in the list. */
export function blocksFromDoc(doc: PMNode, numbered = false): ScriptBlock[] {
  const out: ScriptBlock[] = [];
  doc.forEach((scene, _o, i) =>
    scene.forEach((b, _p, k) => {
      const type = b.type.name as ElementType;
      out.push(numbered && k === 0 && type === "scene_heading" ? { type, text: b.textContent, sceneNumber: i + 1 } : { type, text: b.textContent });
    }),
  );
  return out;
}

/** The stored form of a scene: the JSON of its elements. */
export function sceneContent(scene: PMNode): string {
  return JSON.stringify(scene.content.toJSON() ?? []);
}

export function sceneFromStored(id: string, content: string): PMNode {
  const node = schema.nodeFromJSON({ type: "scene", attrs: { id }, content: JSON.parse(content) });
  node.check();
  return node;
}

export function docFromScenes(scenes: PMNode[]): PMNode {
  return scenes.length > 0 ? schema.nodes.doc.create(null, scenes) : emptyDoc();
}

/** A new scene whose heading is `heading` (possibly empty), ready to be inserted in the document. */
export function newScene(heading = "", id = newSceneId()): PMNode {
  return schema.nodes.scene.create({ id }, schema.nodes.scene_heading.create(null, heading ? [schema.text(heading)] : []));
}

/** Names in the character cues of a scene, without extensions such as (V.O.) or (CONT'D). */
export function sceneCharacters(scene: PMNode): string[] {
  const names = new Set<string>();
  scene.forEach((b) => {
    if (b.type.name !== "character") return;
    const name = characterName(b.textContent);
    if (name) names.add(name);
  });
  return [...names];
}

export function characterName(cue: string): string {
  return cue
    .replace(/\(.*?\)/g, "")
    .replace(/\^$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("fr");
}
