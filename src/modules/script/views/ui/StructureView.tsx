import { useState } from "react";
import { createPortal } from "react-dom";
import { ChartGantt, SquareKanban } from "lucide-react";
import { Segmented, type SegmentedOption } from "../../../../ui-kit/Segmented";
import { useProject } from "../../../project/ui/projectContext";
import { BoardView } from "./BoardView";
import { TimelineView } from "./TimelineView";

type Shape = "board" | "timeline";

const SHAPES: SegmentedOption<Shape>[] = [
  { id: "board", label: "Tableau", icon: SquareKanban, hint: "Les actes, séquences et scènes sur un canevas" },
  { id: "timeline", label: "Chronologie", icon: ChartGantt, hint: "Les scènes au fil des pages, avec leurs personnages" },
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
            <Segmented label="Affichage de la structure" options={SHAPES} value={shape} onChange={choose} compact />
          </div>,
          headerActions,
        )}
      {shape === "board" ? <BoardView /> : <TimelineView />}
    </>
  );
}
