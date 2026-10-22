import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * The window's own title bar (the system one is turned off), drawn in the app's colors so it
 * runs straight into the side bar. Dragging it moves the window; a double click maximizes it.
 */
export function TitleBar({ title, merged }: { title: string; merged: boolean }) {
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
    <header className={`titlebar${merged ? " merged" : ""}`} data-tauri-drag-region>
      <div className="titlebar-title" data-tauri-drag-region>
        {title}
      </div>
      <div className="titlebar-controls">
        <button type="button" className="titlebar-btn" aria-label="Réduire" title="Réduire" onClick={() => void win().minimize()}>
          <Minus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          aria-label={maximized ? "Restaurer" : "Agrandir"}
          title={maximized ? "Restaurer" : "Agrandir"}
          onClick={() => void win().toggleMaximize()}
        >
          {maximized ? <Copy aria-hidden="true" className="flip" /> : <Square aria-hidden="true" />}
        </button>
        <button type="button" className="titlebar-btn close" aria-label="Fermer" title="Fermer" onClick={() => void win().close()}>
          <X aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
