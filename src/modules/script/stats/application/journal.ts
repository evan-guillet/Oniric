import { useEffect } from "react";
import { parseJson } from "../../../../core/db/live";
import type { ScriptSession } from "../../screenplay/application/scriptSession";
import { readSetting, writeSetting } from "../../screenplay/application/settings";
import { blocksFromDoc } from "../../screenplay/ui/editor/schema";
import { dayKey, noWords, WORD_GROUPS, wordCounts, type Journal, type WordCounts } from "../domain/stats";

export const JOURNAL_SETTING = "stats.journal";

/** Changes of the text are added up after this pause in the typing. */
const SAMPLE_MS = 8000;
/** A gap longer than this between two changes is a pause, not writing time. */
const IDLE_MS = 5 * 60_000;
/** More words at once is an import or a restored version, not writing. */
const PASTE_LIMIT = 1500;
const KEEP_DAYS = 400;

export async function readJournal(): Promise<Journal> {
  return parseJson<Journal>(await readSetting(JOURNAL_SETTING), {});
}

/** Keeps the writing journal of the project: words added and removed each day, and the time spent writing. */
export function useWritingJournal(session: ScriptSession): void {
  useEffect(() => {
    let last: WordCounts | null = null;
    let lastChange = 0;
    let pendingMinutes = 0;
    let timer: number | undefined;
    let writing = Promise.resolve();

    const sample = () => {
      timer = undefined;
      const editor = session.editor;
      if (!editor) return;
      const now = wordCounts(blocksFromDoc(editor.doc));
      const before = last;
      last = now;
      const minutes = pendingMinutes;
      pendingMinutes = 0;
      if (!before) return;
      const added = noWords();
      let removed = 0;
      for (const { id } of WORD_GROUPS) {
        const d = now[id] - before[id];
        if (d > 0) added[id] = d;
        else removed -= d;
      }
      const total = added.action + added.dialogue + added.other;
      if (total > PASTE_LIMIT || removed > PASTE_LIMIT) return;
      if (total === 0 && removed === 0 && minutes === 0) return;
      const key = dayKey(new Date());
      writing = writing.then(async () => {
        const journal = await readJournal();
        const day = journal[key] ?? { added: noWords(), removed: 0, minutes: 0 };
        for (const { id } of WORD_GROUPS) day.added[id] += added[id];
        day.removed += removed;
        day.minutes += minutes;
        journal[key] = day;
        const kept = Object.keys(journal).sort().slice(-KEEP_DAYS);
        await writeSetting(JOURNAL_SETTING, JSON.stringify(Object.fromEntries(kept.map((k) => [k, journal[k]]))));
      }).catch((e) => console.error(e));
    };

    const stop = session.subscribeDoc(() => {
      if (!session.editor) {
        last = null;
        return;
      }
      // The first text seen is the starting point: loading the project writes nothing.
      if (!last) {
        last = wordCounts(blocksFromDoc(session.editor.doc));
        return;
      }
      const t = Date.now();
      pendingMinutes += lastChange && t - lastChange < IDLE_MS ? (t - lastChange) / 60_000 : 0.5;
      lastChange = t;
      window.clearTimeout(timer);
      timer = window.setTimeout(sample, SAMPLE_MS);
    });
    return () => {
      stop();
      if (timer !== undefined) {
        window.clearTimeout(timer);
        sample();
      }
    };
  }, [session]);
}
