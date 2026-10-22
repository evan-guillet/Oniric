import type { SceneInfo } from "../../screenplay/application/scriptSession";
import type { SceneText } from "../domain/appearances";

const cache = new WeakMap<SceneInfo[], SceneText[]>();

/** The scenes of the editor in the form the bible rules read: text, cues and wiki links. */
export function sceneTexts(scenes: SceneInfo[]): SceneText[] {
  const known = cache.get(scenes);
  if (known) return known;
  const out = scenes.map((s) => {
    const links = new Set<string>();
    s.node.descendants((n) => {
      for (const m of n.marks) if (m.type.name === "wikilink") links.add(m.attrs.id as string);
    });
    return { id: s.id, heading: s.heading, characters: s.characters, text: s.text, links: [...links] };
  });
  cache.set(scenes, out);
  return out;
}
