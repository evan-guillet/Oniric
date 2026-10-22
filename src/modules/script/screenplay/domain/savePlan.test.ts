import { describe, expect, it } from "vitest";
import { planSave, type DocScene, type StoredScene } from "./savePlan";

const none = { intExt: null, location: null, time: null };
const scene = (id: string, content = id, eighths = 1): DocScene => ({ id, content, eighths, heading: none });

function storedFrom(scenes: DocScene[], ranks: string[]): Map<string, StoredScene> {
  return new Map(scenes.map((s, i) => [s.id, { rank: ranks[i], content: s.content, eighths: s.eighths }]));
}

function apply(stored: Map<string, StoredScene>, scenes: DocScene[]) {
  const plan = planSave(scenes, stored);
  const next = new Map(stored);
  for (const id of plan.deletes) next.delete(id);
  for (const u of plan.upserts) next.set(u.id, { rank: u.rank, content: u.content, eighths: u.eighths });
  return { plan, next };
}

const order = (stored: Map<string, StoredScene>) => [...stored.entries()].sort((a, b) => (a[1].rank < b[1].rank ? -1 : 1)).map(([id]) => id);

describe("planSave", () => {
  const abc = [scene("a"), scene("b"), scene("c")];
  const stored = storedFrom(abc, ["V", "k", "t"]);

  it("writes nothing when nothing changed", () => {
    expect(planSave(abc, stored)).toEqual({ upserts: [], deletes: [] });
  });

  it("writes only the edited scene", () => {
    const { plan } = apply(stored, [scene("a"), scene("b", "b modifiée"), scene("c")]);
    expect(plan.upserts.map((u) => u.id)).toEqual(["b"]);
    expect(plan.upserts[0]).toMatchObject({ rank: "k", isNew: false });
  });

  it("gives a new scene a rank between its neighbours", () => {
    const { plan, next } = apply(stored, [scene("a"), scene("n"), scene("b"), scene("c")]);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]).toMatchObject({ id: "n", isNew: true });
    expect(order(next)).toEqual(["a", "n", "b", "c"]);
  });

  it("moves a scene by rewriting that scene only", () => {
    const { plan, next } = apply(stored, [scene("c"), scene("a"), scene("b")]);
    expect(plan.upserts.map((u) => u.id)).toEqual(["c"]);
    expect(order(next)).toEqual(["c", "a", "b"]);
  });

  it("deletes the scenes that disappeared", () => {
    expect(planSave([scene("a"), scene("c")], stored)).toEqual({ upserts: [], deletes: ["b"] });
  });

  it("records a new length in eighths", () => {
    expect(planSave([scene("a", "a", 3), scene("b"), scene("c")], stored).upserts.map((u) => u.id)).toEqual(["a"]);
  });

  it("ranks a whole imported screenplay in order", () => {
    const many = Array.from({ length: 300 }, (_, i) => scene(`s${i}`));
    const { plan, next } = apply(new Map(), many);
    expect(plan.upserts).toHaveLength(300);
    expect(order(next)).toEqual(many.map((s) => s.id));
  });

  it("survives random edits, moves and deletions", () => {
    let current = Array.from({ length: 40 }, (_, i) => scene(`s${i}`));
    let db = apply(new Map(), current).next;
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let round = 0; round < 300; round++) {
      const next = [...current];
      const op = rnd(3);
      if (op === 0 && next.length > 1) {
        const [moved] = next.splice(rnd(next.length), 1);
        next.splice(rnd(next.length + 1), 0, moved);
      } else if (op === 1) {
        next.splice(rnd(next.length + 1), 0, scene(`n${round}`));
      } else if (next.length > 1) {
        next.splice(rnd(next.length), 1);
      }
      current = next;
      db = apply(db, current).next;
      expect(order(db)).toEqual(current.map((s) => s.id));
    }
  });
});
