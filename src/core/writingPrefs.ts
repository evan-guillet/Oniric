import { useSyncExternalStore } from "react";
import { readAppSetting, writeAppSetting } from "./appSettings";

/** How the screenplay behaves while typing, shared by all projects and kept on this PC. */
export interface WritingPrefs {
  /** The line being typed stays in the middle of the desk, as on a typewriter. */
  typewriter: boolean;
  /** Words Windows does not know are underlined, in the language of the format. */
  spellcheck: boolean;
  /** No-break spaces before ? ! ; : and inside « »: with a French format, always, or never. */
  typography: "auto" | "on" | "off";
  /** Words to write each day, shown in the dashboard; 0 for none. */
  dailyGoal: number;
}

export const DEFAULT_WRITING: WritingPrefs = { typewriter: false, spellcheck: false, typography: "auto", dailyGoal: 0 };

const SETTING = "writing";
let current = DEFAULT_WRITING;
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  loading ??= readAppSetting<Partial<WritingPrefs>>(SETTING, {})
    .then((saved) => {
      current = { ...DEFAULT_WRITING, ...saved };
      listeners.forEach((l) => l());
    })
    .catch(() => {
      // Defaults until the next change.
    });
  return loading;
}

export function getWritingPrefs(): WritingPrefs {
  return current;
}

export async function setWritingPrefs(patch: Partial<WritingPrefs>): Promise<void> {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
  await writeAppSetting(SETTING, current);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  void load();
  return () => listeners.delete(l);
}

export function useWritingPrefs(): WritingPrefs {
  return useSyncExternalStore(subscribe, getWritingPrefs);
}

/** Whether French spacing applies to a script in `language`. */
export function frenchTypography(p: WritingPrefs, language: string): boolean {
  return p.typography === "on" || (p.typography === "auto" && language === "fr");
}
