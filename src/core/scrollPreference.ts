import { readAppSetting, writeAppSetting } from "./appSettings";

/** How the mouse wheel moves through the screenplay: one scene per notch, or freely. */
export type ScrollPreference = "snap" | "smooth";

const SETTING = "script_scroll";
/** Copy kept in the webview so the first scroll already behaves as chosen. */
const CACHE = "oniric.scroll";

let current: ScrollPreference = "snap";
const listeners = new Set<(p: ScrollPreference) => void>();

function isPreference(v: unknown): v is ScrollPreference {
  return v === "snap" || v === "smooth";
}

function apply(p: ScrollPreference) {
  current = p;
  try {
    localStorage.setItem(CACHE, p);
  } catch {
    // The cache only spares a wrong first scroll.
  }
  listeners.forEach((l) => l(p));
}

/** Applies the cached choice at once, then the one saved in the application database. */
export async function initScrollPreference(): Promise<void> {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(CACHE);
  } catch {
    // Ignored, see above.
  }
  apply(isPreference(cached) ? cached : "snap");
  try {
    const saved = await readAppSetting<unknown>(SETTING, "snap");
    if (isPreference(saved) && saved !== current) apply(saved);
  } catch {
    // Keep the cached choice.
  }
}

export function getScrollPreference(): ScrollPreference {
  return current;
}

export async function setScrollPreference(p: ScrollPreference): Promise<void> {
  apply(p);
  await writeAppSetting(SETTING, p);
}

export function onScrollPreference(listener: (p: ScrollPreference) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
