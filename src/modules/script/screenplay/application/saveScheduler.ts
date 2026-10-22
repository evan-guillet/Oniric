export type SaveState = "saved" | "pending" | "saving" | "error";

/**
 * Writes 1 s after the last change, and at least every 3 s during continuous typing (architecture, 3.3).
 * A failed save is retried; `flush` waits until everything is written.
 */
export class SaveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPending = 0;
  private running: Promise<void> | null = null;
  private again = false;
  state: SaveState = "saved";
  lastError: unknown = null;

  constructor(
    private readonly save: () => Promise<void>,
    private readonly onState: (s: SaveState) => void,
    private readonly idleMs = 1000,
    private readonly maxMs = 3000,
    private readonly retryMs = 3000,
  ) {}

  private set(state: SaveState) {
    this.state = state;
    this.onState(state);
  }

  touch(): void {
    const now = Date.now();
    if (this.state === "saved") this.firstPending = now;
    if (this.state !== "saving") this.set("pending");
    else this.again = true;
    this.schedule(Math.min(this.idleMs, Math.max(0, this.firstPending + this.maxMs - now)));
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delay);
  }

  private run(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.again = false;
    this.set("saving");
    this.running = this.save().then(
      () => {
        this.running = null;
        this.lastError = null;
        if (this.again) {
          this.firstPending = Date.now();
          this.set("pending");
          this.schedule(this.idleMs);
        } else {
          this.set("saved");
        }
      },
      (e) => {
        this.running = null;
        this.lastError = e;
        this.set("error");
        this.schedule(this.retryMs);
      },
    );
    return this.running;
  }

  /** Writes now whatever is pending; rejects if the write fails. */
  async flush(): Promise<void> {
    while (this.state !== "saved") {
      await this.run();
      if (this.state === "error") throw this.lastError;
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
