import { memo } from "react";
import { useTranslation } from "react-i18next";
import { formatEighths } from "../domain/duration";

export interface SceneRow {
  heading: string;
  page: number;
  eighths: number;
}

export const SceneList = memo(function SceneList({
  scenes,
  current,
  onSelect,
}: {
  scenes: SceneRow[];
  current: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav className="scene-list" aria-labelledby="scenes-title">
      <h2 id="scenes-title">{t("workspace.scenes")}</h2>
      <ol>
        {scenes.map((s, i) => (
          <li key={i} className={i === current ? "on" : ""}>
            <button type="button" onClick={() => onSelect(i)} aria-current={i === current ? "location" : undefined}>
              <span className="scene-num">{i + 1}</span>
              <span className="scene-heading">{s.heading || t("workspace.noHeading")}</span>
              <span className="scene-meta">
                {t("workspace.scenePage", { page: s.page })} · {formatEighths(s.eighths)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
});
