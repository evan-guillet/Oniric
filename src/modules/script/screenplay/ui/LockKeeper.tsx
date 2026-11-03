import { useEffect } from "react";
import { keepNumbers, useLock } from "../application/lock";
import { useScenes, type ScriptSession } from "../application/scriptSession";

/**
 * Gives every view the numbers of the locked script, and keeps the number a new scene gets (12A) once it has one, so
 * that it does not move when another scene comes before it [REE-07].
 */
export function LockKeeper({ session }: { session: ScriptSession }) {
  const lock = useLock();
  const scenes = useScenes(session);
  useEffect(() => {
    if (lock !== undefined) session.setLocked(lock?.numbers ?? null);
  }, [lock, session]);
  useEffect(() => {
    if (!lock) return;
    const fresh = scenes.filter((s) => !lock.numbers[s.id] && s.number);
    if (!fresh.length) return;
    // Once the typing stops: a scene being written may still be split or merged.
    const timer = setTimeout(() => void keepNumbers(lock, Object.fromEntries(fresh.map((s) => [s.id, s.number]))).catch(() => {}), 3000);
    return () => clearTimeout(timer);
  }, [lock, scenes]);
  return null;
}
