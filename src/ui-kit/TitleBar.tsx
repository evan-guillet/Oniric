import { useEffect, useState, type MouseEvent } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../core/i18n";

const INTERACTIVE = "button, a, input, select, textarea, label, [tabindex], [contenteditable]";

/**
 * Lets a band of the app move the window like a system title bar: a press on its empty parts (not on a control)
 * drags the window, a double click maximizes it. Works on every descendant, unlike `data-tauri-drag-region`.
 */
export function dragWindow(e: MouseEvent) {
  if (e.button !== 0 || (e.target as Element).closest(INTERACTIVE)) return;
  const win = getCurrentWindow();
  void (e.detail === 2 ? win.toggleMaximize() : win.startDragging());
}

/** Minimize, maximize or restore, close: the three system buttons, drawn in the app's colors. */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    const sync = () => void win.isMaximized().then(setMaximized).catch(() => {});
    sync();
    const unlisten = win.onResized(sync);
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  const win = () => getCurrentWindow();

  return (
    <div className="titlebar-controls">
      <button type="button" className="titlebar-btn" aria-label={t("titlebar.minimize")} title={t("titlebar.minimize")} onClick={() => void win().minimize()}>
        <Minus aria-hidden="true" />
      </button>
      <button
        type="button"
        className="titlebar-btn"
        aria-label={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        title={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        onClick={() => void win().toggleMaximize()}
      >
        {maximized ? <Copy aria-hidden="true" className="flip" /> : <Square aria-hidden="true" />}
      </button>
      <button type="button" className="titlebar-btn close" aria-label={t("common.close")} title={t("common.close")} onClick={() => void win().close()}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The window's own title bar (the system one is turned off), outside a project. In a project there is none:
 * the view header is the band that moves the window and holds these buttons.
 */
export function TitleBar({ title }: { title: string }) {
  return (
    <header className="titlebar" onMouseDown={dragWindow}>
      <div className="titlebar-title">{title}</div>
      <WindowControls />
    </header>
  );
}
