import { describe, expect, it } from "vitest";
import { BUILTIN_TYPES, namedBuiltins } from "./types";

describe("namedBuiltins", () => {
  it("renames only the type given, with its plural, and keeps its fields", () => {
    const types = namedBuiltins(new Map([["character", "Protagoniste"]]));
    const character = types.find((x) => x.id === "character")!;
    const builtin = BUILTIN_TYPES.find((x) => x.id === "character")!;
    expect(character.name).toBe("Protagoniste");
    expect(character.plural).toBe("Protagonistes");
    expect(character.builtin).toBe(true);
    expect(character.fields).toBe(builtin.fields);
    expect(types.find((x) => x.id === "location")).toBe(BUILTIN_TYPES.find((x) => x.id === "location"));
  });
});
