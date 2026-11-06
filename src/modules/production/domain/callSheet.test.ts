import { describe, expect, it } from "vitest";
import { changeCount, changes, emptySheet } from "./callSheet";

describe("changeCount", () => {
  it("counts a change once, not once per level above it", () => {
    const before = emptySheet();
    const after = { ...before, lunch: "13:00", cast: { Luke: { pickup: "07:00", hmc: "", onSet: "", notes: "" } } };
    expect(changeCount(changes(before, after))).toBe(2);
  });
  it("finds nothing in a sheet left as it was", () => {
    const sheet = emptySheet();
    expect(changeCount(changes(sheet, sheet))).toBe(0);
  });
});
