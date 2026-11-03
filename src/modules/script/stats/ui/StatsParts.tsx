import { plural, t } from "../../../../core/i18n";
import { SCENE_STATUSES } from "../../views/application/story";

// Shared with the dashboard, which must not load the whole view.

export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stats-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** How far the scenes are, by status: one bar in the colors of the states. */
export function Progress({ counts, total }: { counts: number[]; total: number }) {
  const none = total - counts.reduce((a, b) => a + b, 0);
  const parts = [...SCENE_STATUSES.map((s, i) => ({ id: s.id, label: s.label, n: counts[i] })), { id: "none", label: t("stats.noStatus"), n: none }].filter((p) => p.n > 0);
  return (
    <div className="stats-card stats-progress">
      <div className="stats-progress-head">
        <h3>{t("stats.progress")}</h3>
        <span className="muted">
          {plural("stats.validated", counts[3], { total })}
        </span>
      </div>
      <div className="stats-progress-bar" role="img" aria-label={parts.map((p) => t("stats.part", { label: p.label, n: p.n })).join(", ")}>
        {parts.map((p) => (
          <span key={p.id} className={`stats-p-${p.id}`} style={{ flexGrow: p.n }} />
        ))}
      </div>
      <ul className="stats-progress-legend">
        {parts.map((p) => (
          <li key={p.id}>
            <span className={`stats-dot stats-p-${p.id}`} aria-hidden="true" />
            {p.label}
            <strong>{p.n}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
