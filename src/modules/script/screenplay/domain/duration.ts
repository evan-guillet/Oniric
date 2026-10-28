import { t } from "../../../../core/i18n";
/** "2 3/8": a length in eighths of a page, as production uses it [EDT-04]. */
export function formatEighths(eighths: number): string {
  const pages = Math.floor(eighths / 8);
  const rest = eighths % 8;
  return [pages > 0 ? `${pages}` : "", rest > 0 ? `${rest}/8` : ""].filter(Boolean).join(" ") || "0";
}

/** One page is about one minute of film. */
export function formatMinutes(pages: number): string {
  const minutes = Math.max(1, Math.round(pages));
  if (minutes < 60) return t("dash.minutes", { m: minutes });
  return t("dash.hours", { h: Math.floor(minutes / 60), m: String(minutes % 60).padStart(2, "0") });
}
