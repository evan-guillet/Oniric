import { describe, expect, it } from "vitest";
import { applyFrenchSpacing, frenchSpacing, NBSP } from "./typography";

const type = (text: string) => {
  let out = "";
  for (const c of text) {
    const fix = frenchSpacing(out, c);
    out = fix ? out.slice(0, out.length - fix.remove) + fix.insert : out + c;
  }
  return out;
};

describe("frenchSpacing", () => {
  it("adds a no-break space before double punctuation", () => {
    expect(type("Paul?")).toBe(`Paul${NBSP}?`);
    expect(type("Paul ?")).toBe(`Paul${NBSP}?`);
    expect(type("Quoi ?!")).toBe(`Quoi${NBSP}?!`);
    expect(type("Note : rien")).toBe(`Note${NBSP}: rien`);
  });

  it("puts no-break spaces inside guillemets", () => {
    expect(type("«oui»")).toBe(`«${NBSP}oui${NBSP}»`);
    expect(type("« oui »")).toBe(`«${NBSP}oui${NBSP}»`);
  });

  it("leaves times, empty starts and parentheses alone", () => {
    expect(type("12:30")).toBe("12:30");
    expect(type("?")).toBe("?");
    expect(type("(?)")).toBe("(?)");
  });
});

describe("applyFrenchSpacing", () => {
  it("only replaces existing spaces", () => {
    expect(applyFrenchSpacing("Tu viens ? « Non » 12:30")).toBe(`Tu viens${NBSP}? «${NBSP}Non${NBSP}» 12:30`);
  });
});
