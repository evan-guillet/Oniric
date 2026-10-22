import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveScheduler, type SaveState } from "./saveScheduler";

describe("SaveScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(fail = () => false) {
    const saves: number[] = [];
    const states: SaveState[] = [];
    const s = new SaveScheduler(
      async () => {
        saves.push(Date.now());
        if (fail()) throw new Error("disque plein");
      },
      (st) => states.push(st),
    );
    return { s, saves, states };
  }

  it("saves one second after the last change", async () => {
    const { s, saves } = setup();
    const t0 = Date.now();
    s.touch();
    await vi.advanceTimersByTimeAsync(500);
    s.touch();
    await vi.advanceTimersByTimeAsync(999);
    expect(saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toEqual([t0 + 1500]);
    expect(s.state).toBe("saved");
  });

  it("saves at least every three seconds while typing", async () => {
    const { s, saves } = setup();
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) {
      s.touch();
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(saves.length).toBeGreaterThanOrEqual(2);
    expect(saves[0] - t0).toBeLessThanOrEqual(3000);
  });

  it("retries a failed save and flush reports the failure", async () => {
    let failing = true;
    const { s, saves } = setup(() => failing);
    s.touch();
    await expect(s.flush()).rejects.toThrow("disque plein");
    expect(s.state).toBe("error");
    failing = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(saves).toHaveLength(2);
    expect(s.state).toBe("saved");
  });

  it("flush writes immediately and resolves once saved", async () => {
    const { s, saves } = setup();
    s.touch();
    await s.flush();
    expect(saves).toHaveLength(1);
    expect(s.state).toBe("saved");
    await s.flush();
    expect(saves).toHaveLength(1);
  });
});
