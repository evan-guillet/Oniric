import { useEffect, useRef, useState } from "react";
import { events } from "../../bindings";
import type { TableName } from "./schema";

type Listener = (tables: string[]) => void;
const listeners = new Set<Listener>();
let started = false;

function start() {
  if (started) return;
  started = true;
  void events.dbChanged.listen((e) => listeners.forEach((l) => l(e.payload.tables)));
}

/** Calls `fn` after every write that touches one of `tables` (architecture, 5.3). */
export function onTablesChanged(tables: TableName[], fn: () => void): () => void {
  start();
  const l: Listener = (changed) => {
    if (changed.some((t) => tables.includes(t as TableName))) fn();
  };
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * The result of `load`, read again whenever one of `tables` changes; `undefined` until the first read.
 * `deps` restart the reading, like those of useEffect.
 */
export function useLive<T>(load: () => Promise<T>, tables: TableName[], deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    let running = false;
    let again = false;
    const run = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const v = await loadRef.current();
          if (alive) setValue(() => v);
        } while (again && alive);
      } catch (e) {
        console.error(e);
      } finally {
        running = false;
      }
    };
    void run();
    const stop = onTablesChanged(tables, () => void run());
    return () => {
      alive = false;
      stop();
    };
  }, [tables.join(","), ...deps]);
  return value;
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
