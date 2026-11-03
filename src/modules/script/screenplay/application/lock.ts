import { db, nowIso, write } from "../../../../core/db/client";
import { parseJson, useLive } from "../../../../core/db/live";
import { uuidv7 } from "../../../../core/ids";
import { readLock, REVISION_COLORS, type Revision, type ScriptLock } from "../domain/lock";
import type { ScriptSession } from "./scriptSession";
import { readSetting } from "./settings";

const LOCK = "script_lock";

export async function loadLock(): Promise<ScriptLock | null> {
  return readLock(parseJson(await readSetting(LOCK), null));
}

export function useLock(): ScriptLock | null | undefined {
  return useLive(loadLock, ["project_setting"]);
}

function save(lock: ScriptLock | null, label: string, undoable = true) {
  const now = nowIso();
  return write(
    label,
    ["project_setting"],
    [
      lock
        ? db
            .insertInto("project_setting")
            .values({ key: LOCK, value: JSON.stringify(lock), updated_at: now })
            .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(lock), updated_at: now }))
        : db.deleteFrom("project_setting").where("key", "=", LOCK),
    ],
    undoable,
  );
}

/** The elements of each scene, as a revision keeps them to compare with. */
function baseline(session: ScriptSession): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of session.scenes()) {
    const lines: string[] = [];
    s.node.forEach((b) => lines.push(b.textContent));
    out[s.id] = lines;
  }
  return out;
}

/**
 * Locks the screenplay for preproduction [DEV-02]: the scene numbers stay as they are, and the first revision (white)
 * starts from the text as it is.
 */
export async function lockScript(session: ScriptSession): Promise<void> {
  await session.flush();
  const scenes = session.scenes();
  const now = nowIso();
  await save(
    {
      lockedAt: now,
      numbers: Object.fromEntries(scenes.map((s, i) => [s.id, String(i + 1)])),
      revisions: [{ id: uuidv7(), color: "white", startedAt: now, baseline: baseline(session) }],
    },
    "Scénario verrouillé",
  );
}

export async function unlockScript(): Promise<void> {
  await save(null, "Scénario déverrouillé");
}

/** A new series of changes, in the next colour, marking what changes from now on [REE-07]. */
export async function startRevision(session: ScriptSession, lock: ScriptLock): Promise<Revision> {
  await session.flush();
  const color = REVISION_COLORS[Math.min(lock.revisions.length, REVISION_COLORS.length - 1)];
  const revision: Revision = { id: uuidv7(), color, startedAt: nowIso(), baseline: baseline(session) };
  // The scenes added since the lock keep the number they were given.
  const numbers = { ...lock.numbers, ...Object.fromEntries(session.scenes().map((s) => [s.id, s.number])) };
  await save({ ...lock, numbers, revisions: [...lock.revisions, revision] }, "Nouvelle révision");
  return revision;
}

/** Keeps the numbers given to the scenes added since the lock, so they do not move when another comes. */
export async function keepNumbers(lock: ScriptLock, numbers: Record<string, string>): Promise<void> {
  await save({ ...lock, numbers: { ...lock.numbers, ...numbers } }, "Numéros de scène", false);
}
