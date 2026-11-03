import type { ViewId } from "./projectContext";
import { t } from "../../../core/i18n";

/** The version each view arrives in; its name and what it will hold are in the catalog. */
const LATER: Partial<Record<ViewId, string>> = {
  team: "3.0",
  breakdown: "3.0",
  schedule: "3.0",
  callsheets: "3.0",
  budget: "4.0",
  scouting: "4.0",
  permits: "4.0",
};

/** The views of the next versions, shown so that the whole film is visible from the start [PRJ-02]. */
export function LaterView({ view }: { view: ViewId }) {
  const version = LATER[view];
  if (!version) return null;
  return (
    <div className="view view-pad">
      <div className="empty-state">
        <h2>{t(`nav.views.${view}`)}</h2>
        <p>{t(`later.text.${view}`)}</p>
        <p className="muted">{t("later.comes", { version })}</p>
      </div>
    </div>
  );
}
