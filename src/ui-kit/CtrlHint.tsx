/** Long enough that Ctrl+C, typed at speed, shows nothing. */
const SHOW_AFTER_MS = 180;

/**
 * Marks the page while Ctrl alone is held, so the stylesheet can write out the keys: nothing re-renders, and typing
 * stays as it was. Any other key, a click or the wheel means Ctrl was for something else (AltGr also starts with a
 * Ctrl), and the hints stay away until it is pressed again. Returns what stops the watching.
 */
export function watchCtrl(): () => void {
  const root = document.documentElement;
  let timer: number | undefined;
  const stop = () => {
    window.clearTimeout(timer);
    delete root.dataset.ctrl;
  };
  const onDown = (e: KeyboardEvent) => {
    if (e.key !== "Control") return stop();
    if (e.repeat) return;
    timer = window.setTimeout(() => {
      // A modal covers what the keys would reach, and the keys wait for it.
      if (!document.querySelector("dialog[open]")) root.dataset.ctrl = "";
    }, SHOW_AFTER_MS);
  };
  const onUp = (e: KeyboardEvent) => {
    if (e.key === "Control") stop();
  };
  const passive = { capture: true, passive: true };
  window.addEventListener("keydown", onDown, true);
  window.addEventListener("keyup", onUp, true);
  window.addEventListener("pointerdown", stop, passive);
  window.addEventListener("wheel", stop, passive);
  window.addEventListener("blur", stop);
  return () => {
    stop();
    window.removeEventListener("keydown", onDown, true);
    window.removeEventListener("keyup", onUp, true);
    window.removeEventListener("pointerdown", stop, passive);
    window.removeEventListener("wheel", stop, passive);
    window.removeEventListener("blur", stop);
  };
}

/** The key that goes with Ctrl to reach what it sits in, shown in place of its icon while Ctrl is held. */
export function CtrlHint({ keys }: { keys: string | undefined }) {
  if (!keys) return null;
  return (
    <kbd className="ctrl-hint" aria-hidden="true">
      {keys}
    </kbd>
  );
}
