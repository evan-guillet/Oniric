import { memo } from "react";
import { lineHeightIn, type ScreenplayFormat } from "../domain/formats";
import type { TitlePage } from "../domain/titlePage";
import type { Pagination } from "../domain/types";

/** Pages built from the computed layout: each line sits at its row and never re-wraps. */
export const PrintPages = memo(function PrintPages({
  pagination,
  format,
  titlePage,
}: {
  pagination: Pagination;
  format: ScreenplayFormat;
  titlePage?: TitlePage | null;
}) {
  const lh = lineHeightIn(format);
  return (
    <div className="print-pages">
      {titlePage && <PrintTitlePage page={titlePage} format={format} />}
      {pagination.pages.map((page) => (
        <section key={page.number} className="print-page" style={{ width: `${format.page.width}in`, height: `${format.page.height}in` }}>
          {page.number > 1 && (
            <div className="pg-number" style={{ top: `${format.pageNumberTop}in`, right: `${format.margins.right}in` }}>
              {page.number}.
            </div>
          )}
          {page.lines.map((line, i) => (
            <div
              key={i}
              className={`el el-${line.type} pl`}
              style={{ top: `${format.margins.top + line.row * lh}in`, left: `${format.margins.left}in` }}
            >
              {line.text}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
});

/**
 * Title in capitals a third of the way down, the subtitle and the authors under it; at the bottom, side by side,
 * the contact on the left and the version, date and mention on the right, each growing upwards from the margin.
 */
export function PrintTitlePage({ page, format }: { page: TitlePage; format: ScreenplayFormat }) {
  const lh = lineHeightIn(format);
  const left = format.margins.left;
  const width = format.page.width - format.margins.left - format.margins.right;
  const half = (width - 0.3) / 2;
  const lines = (t: string) => (t.trim() ? t.split("\n").length : 0);
  const block = (at: { top?: number; bottom?: number }, text: string, align: "center" | "left" | "right", upper = false) =>
    text.trim() ? (
      <div
        className="tp-block"
        style={{
          top: at.top !== undefined ? `${at.top}in` : undefined,
          bottom: at.bottom !== undefined ? `${at.bottom}in` : undefined,
          left: `${align === "right" ? left + width - half : left}in`,
          width: `${align === "center" ? width : half}in`,
          textAlign: align,
          textTransform: upper ? "uppercase" : "none",
          lineHeight: `${lh}in`,
        }}
      >
        {text}
      </div>
    ) : null;
  const third = format.page.height / 3;
  let row = lines(page.title) || 1;
  const subtitleRow = row + 1;
  if (page.subtitle.trim()) row = subtitleRow + lines(page.subtitle);
  const authorsRow = row + 2;
  if (page.authors.trim()) row = authorsRow + 2 + lines(page.authors);
  const by = format.language === "fr" ? "Écrit par" : "Written by";
  return (
    <section className="print-page title-page" style={{ width: `${format.page.width}in`, height: `${format.page.height}in` }}>
      {block({ top: third }, page.title, "center", true)}
      {block({ top: third + subtitleRow * lh }, page.subtitle, "center")}
      {block({ top: third + authorsRow * lh }, page.authors.trim() ? `${by}\n\n${page.authors}` : "", "center")}
      {block({ top: third + (row + 1) * lh }, page.basedOn, "center")}
      {block({ bottom: format.margins.bottom }, page.contact, "left")}
      {block({ bottom: format.margins.bottom }, [page.version, page.date, page.notes].filter((t) => t.trim()).join("\n"), "right")}
    </section>
  );
}
