import { useCallback, useEffect, useState } from "react";

/** Told to every state of the same key, so that a setting changed elsewhere (the settings page) shows at once. */
const CHANGED = "oniric-stored";

/** A state kept in this computer's storage; without it, it still holds for the session. */
export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, initial));
  useEffect(() => {
    const follow = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; value: T }>).detail;
      if (d.key === key) setValue(d.value);
    };
    window.addEventListener(CHANGED, follow);
    return () => window.removeEventListener(CHANGED, follow);
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // Not remembered, still applied.
      }
      window.dispatchEvent(new CustomEvent(CHANGED, { detail: { key, value: v } }));
    },
    [key],
  );
  return [value, set];
}

/** What a state of `useStoredState` holds, read outside a component (an export reads the shown columns). */
export function readStored<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}
