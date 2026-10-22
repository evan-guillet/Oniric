import { describe, expect, it } from "vitest";
import { flatten, materialize, memberships, moveScene, outline, type OutlineAct, type OutlineScene, type OutlineSequence } from "./outline";

const acts: OutlineAct[] = [
  { id: "a2", rank: "V", title: "Acte II" },
  { id: "a1", rank: "F", title: "Acte I" },
];
const sequences: OutlineSequence[] = [
  { id: "q1", actId: "a1", rank: "F", title: "Ouverture" },
  { id: "q2", actId: "a1", rank: "V", title: "La fuite" },
  { id: "q3", actId: "a2", rank: "F", title: "Le toit" },
];
const scenes: OutlineScene[] = [
  { id: "s0", sequenceId: null },
  { id: "s1", sequenceId: "q1" },
  { id: "s2", sequenceId: null },
  { id: "s3", sequenceId: "q2" },
  { id: "s4", sequenceId: "q3" },
  { id: "s5", sequenceId: null },
];

describe("outline", () => {
  it("a scene without sequence follows the scene before it", () => {
    const m = memberships(scenes, sequences);
    expect([...m.values()]).toEqual([null, "q1", "q1", "q2", "q3", "q3"]);
  });

  it("groups by act then sequence, by rank, and flattens back to the screenplay order", () => {
    const g = outline(scenes, sequences, acts);
    expect(g.map((x) => x.act?.title ?? "—")).toEqual(["—", "Acte I", "Acte II"]);
    expect(g[1].sequences.map((s) => [s.sequence?.title, s.scenes])).toEqual([
      ["Ouverture", ["s1", "s2"]],
      ["La fuite", ["s3"]],
    ]);
    expect(flatten(g)).toEqual(scenes.map((s) => s.id));
  });

  it("without acts nor sequences, every scene is in one group", () => {
    const g = outline(scenes.map((s) => ({ ...s, sequenceId: null })), [], []);
    expect(g).toHaveLength(1);
    expect(g[0].sequences[0].scenes).toHaveLength(6);
  });

  it("moves a scene into another sequence", () => {
    const g = moveScene(outline(scenes, sequences, acts), "s2", "q3", "s4");
    expect(flatten(g)).toEqual(["s0", "s1", "s3", "s2", "s4", "s5"]);
    expect(materialize(scenes, sequences)).toEqual([
      { id: "s2", sequenceId: "q1" },
      { id: "s5", sequenceId: "q3" },
    ]);
  });
});
