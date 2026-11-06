import { detect, triage } from "../domain/appearances";
import type { Entry } from "./bible";
import type { sceneTexts } from "./sceneTexts";

type Texts = ReturnType<typeof sceneTexts>;

/**
 * A character or a location of the screenplay without an entry, found as one writes [BIB-03]. It shows as a card
 * with the « Détecté » badge and becomes an entry once opened. The doubtful names (roles, likely duplicates,
 * parts of a location) are left out.
 */
const DETECTED = "detected:";
export const isDetected = (e: Entry) => e.id.startsWith(DETECTED);
export function detectedEntries(texts: Texts, entries: Entry[]): Entry[] {
  const refs = entries.map((e) => ({ id: e.id, type: e.type, name: e.name, aliases: e.aliases }));
  return triage(detect(texts, refs), refs)
    .filter((c) => c.doubt === null)
    .map((c) => ({
      id: DETECTED + c.key,
      type: c.type,
      name: c.name,
      aliases: [],
      summary: "",
      content: "",
      fields: {},
      tags: [],
      links: [],
      status: "validated",
      image: null,
      gallery: [],
      notes: "",
      createdAt: "",
      updatedAt: "",
      archivedAt: null,
    }));
}

/** How many cards each category shows: its current entries and the names found in the screenplay. */
export function cardCounts(texts: Texts, entries: Entry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of [...entries.filter((x) => !x.archivedAt), ...detectedEntries(texts, entries)]) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  return counts;
}
