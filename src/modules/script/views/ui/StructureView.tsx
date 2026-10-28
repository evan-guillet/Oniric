import { useState } from "react";
import { createPortal } from "react-dom";
import { ChartGantt, SquareKanban } from "lucide-react";
import { Segmented, type SegmentedOption } from "../../../../ui-kit/Segmented";
import { useProject } from "../../../project/ui/projectContext";
import { BoardView } from "./BoardView";
import { TimelineView } from "./TimelineView";
import { t } from "../../../../core/i18n";

type Shape = "board" | "timeline";

const shapes = (): SegmentedOption<Shape>[] => [
  { id: "board", label: t("structure.board"), icon: SquareKanban, hint: t("structure.boardHint") },
  { id: "timeline", label: t("structure.timeline"), icon: ChartGantt, hint: t("structure.timelineHint") },
];

const SHAPE_KEY = "oniric.structure.view";

/** Acts, sequences and scenes, shown as the board or as the timeline; the last one chosen is remembered on this computer. */
export function StructureView() {
  const { headerActions } = useProject();
  const [shape, setShape] = useState<Shape>(() => {
    try {
      return localStorage.getItem(SHAPE_KEY) === "timeline" ? "timeline" : "board";
    } catch {
      return "board";
    }
  });
  const choose = (s: Shape) => {
    setShape(s);
    try {
      localStorage.setItem(SHAPE_KEY, s);
    } catch {
      // Not remembered, still shown.
    }
  };

  return (
    <>
      {headerActions &&
        createPortal(
          <div className="header-tools structure-shape">
            <Segmented label={t("structure.shape")} options={shapes()} value={shape} onChange={choose} compact />
          </div>,
          headerActions,
        )}
      {shape === "board" ? <BoardView /> : <TimelineView />}
    </>
  );
}
