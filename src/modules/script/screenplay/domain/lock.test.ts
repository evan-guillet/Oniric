import { describe, expect, it } from "vitest";
import { letters, revisedElements, sceneLabels } from "./lock";

describe("locked screenplay", () => {
  it("numbers the scenes by their place until the script is locked", () => {
    expect(sceneLabels(["a", "b", "c"], null)).toEqual(["1", "2", "3"]);
  });

  it("keeps the locked numbers and letters the scenes added", () => {
    const locked = { a: "1", b: "2", c: "3" };
    expect(sceneLabels(["x", "a", "b", "y", "z", "c"], locked)).toEqual(["A1", "1", "2", "2A", "2B", "3"]);
    // A scene cut leaves a hole: the numbers do not move.
    expect(sceneLabels(["a", "c"], locked)).toEqual(["1", "3"]);
    // A letter already given is not given twice.
    expect(sceneLabels(["a", "n", "b"], { a: "1", b: "1A" })).toEqual(["1", "1B", "1A"]);
    expect([1, 26, 27].map(letters)).toEqual(["A", "Z", "AA"]);
  });

  it("marks the elements changed since a revision began", () => {
    const marks = revisedElements(
      [
        { id: "s1", elements: ["INT. CUISINE – NUIT", "Marie entre.", "Elle s'assoit."] },
        { id: "s2", elements: ["EXT. RUE – JOUR"] },
      ],
      { s1: ["INT. CUISINE – NUIT", "Marie entre lentement."] },
    );
    expect(marks.get("s1")).toEqual([false, true, true]);
    expect(marks.get("s2")).toEqual([true]);
  });
});
