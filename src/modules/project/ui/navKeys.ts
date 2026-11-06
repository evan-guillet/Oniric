import type { ViewId } from "./projectContext";

/**
 * The key that goes with Ctrl to reach each view, in the order of the side bar. The letters are the same in every
 * language, and leave out those already spoken for (see RESERVED in the test).
 */
export const NAV_KEYS: [ViewId, string][] = [
  ["dashboard", "T"],
  ["workshop", "E"],
  ["bible", "L"],
  ["script", "R"],
  ["structure", "U"],
  ["versions", "O"],
  ["moodboard", "M"],
  ["shotlist", "H"],
  ["team", "Q"],
  ["breakdown", "D"],
  ["schedule", "N"],
  ["callsheets", "F"],
  ["budget", "J"],
  ["scouting", "G"],
  ["permits", "W"],
];

export const SETTINGS_KEY = ",";
export const PALETTE_KEY = "K";
export const SHORTCUTS_KEY = "/";

/** Inside these views, the key does the view's own work: Ctrl+D duplicates on the moodboard, Ctrl+F searches the shots. */
const KEPT_BY_VIEW: Partial<Record<ViewId, string>> = { moodboard: "D", shotlist: "F" };

/** The key of a view as seen from the one on screen; none when that one keeps the key for itself. */
export function navKeyOf(id: ViewId, from: ViewId): string | undefined {
  const key = NAV_KEYS.find(([view]) => view === id)?.[1];
  return key === KEPT_BY_VIEW[from] ? undefined : key;
}

/** The view a key pressed with Ctrl goes to, from the one on screen. */
export function viewOfKey(key: string, from: ViewId): ViewId | undefined {
  const upper = key.toUpperCase();
  if (upper === KEPT_BY_VIEW[from]) return undefined;
  return NAV_KEYS.find(([, k]) => k === upper)?.[0];
}
