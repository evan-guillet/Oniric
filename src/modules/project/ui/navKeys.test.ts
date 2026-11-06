import { describe, expect, it } from "vitest";
import { NAV_KEYS, navKeyOf, PALETTE_KEY, SETTINGS_KEY, SHORTCUTS_KEY, viewOfKey } from "./navKeys";

// Copy, paste, cut, select all, undo, redo; bold and italic in the rich text; save and PDF in the screenplay.
const RESERVED = ["A", "B", "C", "I", "P", "S", "V", "X", "Y", "Z", PALETTE_KEY, SETTINGS_KEY, SHORTCUTS_KEY];

describe("navigation keys", () => {
  it("gives each view its own key, none already spoken for", () => {
    const keys = NAV_KEYS.map(([, key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => RESERVED.includes(k))).toEqual([]);
  });
  it("finds the view whatever the case", () => {
    expect(viewOfKey("r", "dashboard")).toBe("script");
    expect(viewOfKey("R", "dashboard")).toBe("script");
    expect(viewOfKey("c", "dashboard")).toBeUndefined();
  });
  it("leaves a view the keys it uses for itself", () => {
    expect(viewOfKey("d", "moodboard")).toBeUndefined();
    expect(navKeyOf("breakdown", "moodboard")).toBeUndefined();
    expect(navKeyOf("breakdown", "script")).toBe("D");
    expect(viewOfKey("f", "shotlist")).toBeUndefined();
    expect(viewOfKey("f", "team")).toBe("callsheets");
  });
});
