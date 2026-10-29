import { describe, expect, it } from "vitest";
import { coverage, formatMinutes, formatSeconds, letters, parseMinutes, parseSeconds, shotNumber, toCsv, uncovered } from "./shots";

describe("shot numbers", () => {
  it("follow the scene with a dash or a letter", () => {
    expect(shotNumber(12, 0, "dash")).toBe("12-1");
    expect(shotNumber(12, 2, "dash")).toBe("12-3");
    expect(shotNumber(12, 0, "letter")).toBe("12A");
    expect(shotNumber(12, 25, "letter")).toBe("12Z");
  });

  it("go on past Z as a clapperboard does", () => {
    expect(letters(26)).toBe("AA");
    expect(letters(27)).toBe("AB");
    expect(letters(51)).toBe("AZ");
    expect(letters(52)).toBe("BA");
  });
});

describe("coverage", () => {
  const scene = [
    { type: "scene_heading", text: "INT. CUISINE - JOUR" },
    { type: "action", text: "Marie entre." },
    { type: "character", text: "MARIE" },
    { type: "dialogue", text: "Il y a quelqu'un ?" },
    { type: "action", text: "" },
  ];

  it("reads each passage but the heading and the empty ones", () => {
    expect(coverage(scene, [])).toEqual([[], [], []]);
  });

  it("finds the shots of a passage by its text, whatever its spaces", () => {
    const shots = [{ covers: ["Marie entre."] }, { covers: ["MARIE", "Il y a  quelqu'un ?"] }, { covers: ["Marie entre. "] }];
    expect(coverage(scene, shots)).toEqual([[0, 2], [1], [1]]);
  });

  it("counts what is left uncovered only once something is covered", () => {
    expect(uncovered(scene, [{ covers: [] }])).toBe(0);
    expect(uncovered(scene, [{ covers: ["MARIE"] }])).toBe(2);
    expect(uncovered(scene, [{ covers: ["Marie entre.", "MARIE", "Il y a quelqu'un ?"] }])).toBe(0);
  });

  it("drops a passage whose text was rewritten", () => {
    const rewritten = scene.map((e) => (e.text === "Marie entre." ? { ...e, text: "Marie entre, essoufflée." } : e));
    expect(uncovered(rewritten, [{ covers: ["Marie entre.", "MARIE", "Il y a quelqu'un ?"] }])).toBe(1);
  });
});

describe("durations", () => {
  it("write seconds and minutes as a shot list does", () => {
    expect(formatSeconds(45)).toBe("45 s");
    expect(formatSeconds(90)).toBe("1 min 30");
    expect(formatSeconds(120)).toBe("2 min");
    expect(formatSeconds(null)).toBe("");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(135)).toBe("2 h 15");
    expect(formatMinutes(60)).toBe("1 h");
  });

  it("read what is typed, or refuse it", () => {
    expect(parseSeconds("1:30")).toBe(90);
    expect(parseSeconds("90")).toBe(90);
    expect(parseSeconds("45 s")).toBe(45);
    expect(parseSeconds("1 min 30")).toBe(90);
    expect(parseSeconds("2 min")).toBe(120);
    expect(parseSeconds("bientôt")).toBeNull();
    expect(parseMinutes("2 h 15")).toBe(135);
    expect(parseMinutes("2:15")).toBe(135);
    expect(parseMinutes("45 min")).toBe(45);
    expect(parseMinutes("45")).toBe(45);
    expect(parseMinutes("3h")).toBe(180);
    expect(parseMinutes("?")).toBeNull();
  });

  it("read back what they write", () => {
    for (const s of [5, 45, 60, 90, 754]) expect(parseSeconds(formatSeconds(s))).toBe(s);
    for (const m of [5, 45, 60, 135, 600]) expect(parseMinutes(formatMinutes(m))).toBe(m);
  });
});

describe("CSV", () => {
  it("separates by semicolons and quotes what needs it", () => {
    const csv = toCsv(["N°", "Action"], [["12-1", 'Elle dit "non"; il part.\nNoir.']]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿N°;Action\r\n12-1;"Elle dit ""non""; il part.\nNoir."\r\n');
  });
});
