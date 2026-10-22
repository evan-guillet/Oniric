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

/** Title in capitals a third of the way down, authors under it, contact at the bottom left, version at the bottom right. */
function PrintTitlePage({ page, format }: { page: TitlePage; format: ScreenplayFormat }) {
  const lh = lineHeightIn(format);
  const left = format.margins.left;
  const width = format.page.width - format.margins.left - format.margins.right;
  const block = (top: number, text: string, align: "center" | "left" | "right", upper = false) =>
    text.trim() ? (
      <div className="tp-block" style={{ top: `${top}in`, left: `${left}in`, width: `${width}in`, textAlign: align, textTransform: upper ? "uppercase" : "none", lineHeight: `${lh}in` }}>
        {text}
      </div>
    ) : null;
  const third = format.page.height / 3;
  const bottom = format.page.height - format.margins.bottom;
  const contactLines = page.contact.split("\n").length;
  const rightLines = [page.version, page.date].filter((s) => s.trim()).length + (page.notes ? page.notes.split("\n").length : 0);
  return (
    <section className="print-page title-page" style={{ width: `${format.page.width}in`, height: `${format.page.height}in` }}>
      {block(third, page.title, "center", true)}
      {block(third + 3 * lh, page.authors.trim() ? `${format.language === "fr" ? "Écrit par" : "Written by"}\n\n${page.authors}` : "", "center")}
      {block(third + (6 + page.authors.split("\n").length) * lh, page.basedOn, "center")}
      {block(bottom - contactLines * lh, page.contact, "left")}
      {block(bottom - rightLines * lh, [page.version, page.date, page.notes].filter((s) => s.trim()).join("\n"), "right")}
    </section>
  );
}
