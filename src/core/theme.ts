import { getCurrentWindow } from "@tauri-apps/api/window";
import { readAppSetting, writeAppSetting } from "./appSettings";

/** What the user chose: follow Windows, or force a theme. */
export type ThemePreference = "system" | "light" | "dark";

const SETTING = "theme";
/** Copy kept in the webview so the first frame already has the right colors. */
const CACHE = "oniric.theme";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let current: ThemePreference = "system";
const listeners = new Set<(p: ThemePreference) => void>();

function isPreference(v: unknown): v is ThemePreference {
  return v === "system" || v === "light" || v === "dark";
}

/** The theme a preference shows: light or dark. */
export function resolveTheme(p: ThemePreference): "light" | "dark" {
  return p === "system" ? (darkQuery.matches ? "dark" : "light") : p;
}

function apply(p: ThemePreference) {
  current = p;
  document.documentElement.dataset.theme = resolveTheme(p);
  try {
    localStorage.setItem(CACHE, p);
  } catch {
    // The cache only avoids a flash at startup.
  }
  // Native parts of the window (dialogs, menus) follow too; null means "follow Windows".
  try {
    getCurrentWindow()
      .setTheme(p === "system" ? null : p)
      .catch(() => {});
  } catch {
    // Outside the app window (tests, plain browser).
  }
  listeners.forEach((l) => l(p));
}

darkQuery.addEventListener("change", () => {
  if (current === "system") apply("system");
});

/** Applies the cached theme at once, then the one saved in the application database. */
export async function initTheme(): Promise<void> {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(CACHE);
  } catch {
    // Ignored, see above.
  }
  apply(isPreference(cached) ? cached : "system");
  try {
    const saved = await readAppSetting<unknown>(SETTING, "system");
    if (isPreference(saved) && saved !== current) apply(saved);
  } catch {
    // Keep the cached theme.
  }
}

export function getThemePreference(): ThemePreference {
  return current;
}

export async function setThemePreference(p: ThemePreference): Promise<void> {
  apply(p);
  await writeAppSetting(SETTING, p);
}

export function onThemePreference(listener: (p: ThemePreference) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
