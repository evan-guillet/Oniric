import { Minus, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Segmented } from "../../../../ui-kit/Segmented";
import { useStoredState } from "../../../../ui-kit/useStoredState";
import { useProject } from "../../../project/ui/projectContext";
import type { SceneNumbers } from "../application/sceneNumbers";
import { flowPagination } from "../domain/flow";
import { lineHeightIn, type ScreenplayFormat } from "../domain/formats";
import type { TitlePage } from "../domain/titlePage";
import type { LaidBlock, Pagination } from "../domain/types";
import { PrintPages } from "./PrintPages";

/** The sheets apart, as on paper; one after the other, a dotted line where they meet; or the text in one piece. */
type Layout = "sheets" | "joined" | "flow";
const LAYOUTS: Layout[] = ["sheets", "joined", "flow"];

const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** The whole script on the desk as it prints, at the zoom and in the layout kept on this computer. */
export function PreviewDesk({
  active,
  pagination,
  format,
  titlePage,
  blocks,
  sceneNumbers,
  labels,
}: {
  active: boolean;
  pagination: Pagination;
  format: ScreenplayFormat;
  titlePage: TitlePage | null;
  blocks: LaidBlock[];
  sceneNumbers: SceneNumbers;
  labels?: string[];
}) {
  const { t } = useTranslation();
  const { headerActions } = useProject();
  const [layout, setLayout] = useStoredState<Layout>("oniric.script.preview.layout", "sheets");
  const [zoom, setZoom] = useStoredState("oniric.script.preview.zoom", 1);
  const deskRef = useRef<HTMLElement>(null);

  // Zoomed or laid out anew, the desk stays on the same passage: what stood in its middle stands there still.
  const middle = useRef<number | null>(null);
  const remember = () => {
    const desk = deskRef.current;
    if (desk?.scrollHeight) middle.current = (desk.scrollTop + desk.clientHeight / 2) / desk.scrollHeight;
  };
  useLayoutEffect(() => {
    const desk = deskRef.current;
    if (!desk || middle.current === null) return;
    desk.scrollTop = middle.current * desk.scrollHeight - desk.clientHeight / 2;
    middle.current = null;
  }, [zoom, layout]);

  const changeZoom = (next: number) => {
    remember();
    setZoom(next);
  };
  const changeLayout = (next: Layout) => {
    remember();
    setLayout(next);
  };
  const step = (up: boolean) => {
    const next = up ? ZOOMS.find((z) => z > zoom + 0.001) : [...ZOOMS].reverse().find((z) => z < zoom - 0.001);
    if (next) changeZoom(next);
  };
  const keys = useRef({ step, changeZoom });
  keys.current = { step, changeZoom };

  // Ctrl + wheel and Ctrl + / - / 0. Not passive, to keep the page itself from zooming.
  useEffect(() => {
    const desk = deskRef.current;
    if (!active || !desk) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      keys.current.step(e.deltaY < 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || document.querySelector("dialog[open]")) return;
      if (e.key === "+" || e.key === "=") keys.current.step(true);
      else if (e.key === "-") keys.current.step(false);
      else if (e.key === "0") keys.current.changeZoom(1);
      else return;
      e.preventDefault();
    };
    desk.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey, true);
    return () => {
      desk.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [active]);

  const shown = LAYOUTS.includes(layout) ? layout : "sheets";
  const flow = useMemo(() => (shown === "flow" ? flowPagination(pagination, format) : null), [shown, pagination, format]);
  const flowHeight = flow ? format.margins.top + flow.pages[0].usedRows * lineHeightIn(format) + format.margins.bottom : undefined;

  return (
    <main ref={deskRef} className={`desk desk-print layout-${shown}`}>
      {active &&
        headerActions &&
        createPortal(
          <>
            <Segmented
              label={t("script.preview.layout")}
              value={shown}
              onChange={changeLayout}
              options={LAYOUTS.map((id) => ({ id, label: t(`script.preview.${id}`), hint: t(`script.preview.${id}Hint`) }))}
            />
            <div className="segmented preview-zoom" role="group" aria-label={t("script.preview.zoom")}>
              <button type="button" className="seg" aria-label={t("canvas.zoomOut")} title={t("canvas.zoomOutTitle")} disabled={zoom <= ZOOMS[0]} onClick={() => step(false)}>
                <Minus aria-hidden="true" />
              </button>
              <button type="button" className="seg preview-pct" title={t("canvas.actual")} onClick={() => changeZoom(1)}>
                {Math.round(zoom * 100)}&nbsp;%
              </button>
              <button type="button" className="seg" aria-label={t("canvas.zoomIn")} title={t("canvas.zoomInTitle")} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => step(true)}>
                <Plus aria-hidden="true" />
              </button>
            </div>
          </>,
          headerActions,
        )}
      <div className="fmt" style={{ zoom }}>
        <PrintPages
          pagination={flow ?? pagination}
          format={format}
          titlePage={titlePage}
          blocks={blocks}
          sceneNumbers={sceneNumbers}
          labels={labels}
          pageHeight={flowHeight}
        />
      </div>
    </main>
  );
}
