import { describe, expect, it } from "vitest";
import { flatten, letters, materialize, memberships, moveScene, numberedTitles, outline, roman, type OutlineAct, type OutlineScene, type OutlineSequence } from "./outline";

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

describe("numberedTitles", () => {
  it("counts in Roman numerals and letters", () => {
    expect([1, 4, 9, 14, 40].map(roman)).toEqual(["I", "IV", "IX", "XIV", "XL"]);
    expect([1, 26, 27].map(letters)).toEqual(["A", "Z", "AA"]);
  });

  it("numbers acts and sequences by position, replacing a number typed by hand", () => {
    const a: OutlineAct[] = [
      { id: "a1", rank: "F", title: "Acte I : le départ" },
      { id: "a2", rank: "V", title: "Acte II" },
      { id: "a3", rank: "X", title: "Mi-temps" },
      { id: "a4", rank: "Z", title: "Act. 4 – Le retour" },
      { id: "a5", rank: "ZZ", title: "Act. V Le bout" },
    ];
    const q: OutlineSequence[] = [
      { id: "q1", actId: "a1", rank: "F", title: "A. Les ferrailleurs" },
      { id: "q2", actId: "a2", rank: "F", title: "Le toit" },
      { id: "q3", actId: "a3", rank: "F", title: "" },
      { id: "q4", actId: "a4", rank: "F", title: "Seq. D – La chute" },
      { id: "q5", actId: "a5", rank: "F", title: "Séq. E La fin" },
    ];
    const t = numberedTitles(outline([], q, a));
    expect([...t.entries()]).toEqual([
      ["a1", "Act. I Le départ"],
      ["q1", "Séq. A Les ferrailleurs"],
      ["a2", "Act. II"],
      ["q2", "Séq. B Le toit"],
      ["a3", "Act. III Mi-temps"],
      ["q3", "Séq. C"],
      ["a4", "Act. IV Le retour"],
      ["q4", "Séq. D La chute"],
      ["a5", "Act. V Le bout"],
      ["q5", "Séq. E La fin"],
    ]);
  });
});
