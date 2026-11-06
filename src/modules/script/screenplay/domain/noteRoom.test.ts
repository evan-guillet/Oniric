import { describe, expect, it } from "vitest";
import { noteRoom } from "./noteRoom";

describe("noteRoom", () => {
  it("leaves the text in the middle and gives the notes what is left", () => {
    expect(noteRoom(1400, 576, 58, 20)).toEqual({ width: 350, shift: 0 });
  });
  it("stops the notes at a readable width on a very wide desk", () => {
    expect(noteRoom(3000, 576, 58, 20)).toEqual({ width: 560, shift: 0 });
  });
  it("pushes the text over by what the smallest note lacks", () => {
    expect(noteRoom(1000, 576, 58, 20)).toEqual({ width: 190, shift: 40 });
  });
  it("gives up when the card would leave the desk", () => {
    expect(noteRoom(840, 576, 58, 20)).toBeNull();
  });
});
