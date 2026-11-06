import { useStoredState } from "../../../../ui-kit/useStoredState";
import { PAGE_KEY } from "../../../project/ui/projectContext";
import { BoardView } from "./BoardView";
import { TimelineView } from "./TimelineView";

/** Acts, sequences and scenes, shown as the board or as the timeline, the page chosen in the side bar. */
export function StructureView() {
  const [shape] = useStoredState(PAGE_KEY.structure, "board");
  return shape === "timeline" ? <TimelineView /> : <BoardView />;
}
