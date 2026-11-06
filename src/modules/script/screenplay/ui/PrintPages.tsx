import { Fragment, memo } from "react";
import { lineHeightIn, type FormatLanguage, type ScreenplayFormat } from "../domain/formats";
import type { TitlePage } from "../domain/titlePage";
import type { LaidBlock, Pagination, PageLine } from "../domain/types";
import type { SceneNumbers } from "../application/sceneNumbers";

/** Pages built from the computed layout: each line sits at its row and never re-wraps. */
export const PrintPages = memo(function PrintPages({
  pagination,
  format,
  titlePage,
  blocks,
  sceneNumbers = "none",
  labels,
  revised,
  revision,
  watermark,
  pageHeight,
}: {
  pagination: Pagination;
  format: ScreenplayFormat;
  titlePage?: TitlePage | null;
  /** The laid elements, to number each scene as the scene list does. */
  blocks?: LaidBlock[];
  sceneNumbers?: SceneNumbers;
  /** The number of each scene, by its place, once the script is locked (« 12A »); else its place. */
  labels?: string[];
  /** The elements changed in the current revision, by their index in `blocks`: an asterisk in the right margin [REE-07]. */
  revised?: Set<number>;
  /** The revision at the top of every page: its colour and date. */
  revision?: string;
  /** A reader's copy: their name across every page [RET-01]. */
  watermark?: string;
  /** The height of the pages when not the format's: the text in one piece on the desk. */
  pageHeight?: number;
}) {
  const lh = lineHeightIn(format);
  // A heading split over two pages is numbered once, on its first line.
  const numbered = new Set<number>();
  const sceneNumber = (line: PageLine): string | null => {
    if (sceneNumbers === "none" || !blocks || line.type !== "scene_heading" || line.kind !== "text" || numbered.has(line.blockIndex)) return null;
    numbered.add(line.blockIndex);
    const i = blocks[line.blockIndex].sceneIndex;
    return labels?.[i] ?? String(i + 1);
  };
  const numberAt = (top: string, n: string) => (
    <>
      {sceneNumbers !== "right" && (
        <div className="pl scene-no" style={{ top, right: `${format.page.width - format.margins.left + 0.3}in` }}>
          {n}
        </div>
      )}
      {sceneNumbers !== "left" && (
        <div className="pl scene-no" style={{ top, left: `${format.page.width - format.margins.right + 0.3}in` }}>
          {n}
        </div>
      )}
    </>
  );
  return (
    <div className="print-pages">
      {titlePage && <PrintTitlePage page={titlePage} format={format} />}
      {pagination.pages.map((page) => (
        <section key={page.number} className="print-page" style={{ width: `${format.page.width}in`, height: `${pageHeight ?? format.page.height}in` }}>
          {page.number > 1 && (
            <div className="pg-number" style={{ top: `${format.pageNumberTop}in`, right: `${format.margins.right}in` }}>
              {page.number}.
            </div>
          )}
          {revision && (
            <div className="pg-revision" style={{ top: `${format.pageNumberTop}in`, left: `${format.margins.left}in` }}>
              {revision}
            </div>
          )}
          {watermark && (
            <>
              <div className="pg-watermark" aria-hidden="true">
                {watermark}
              </div>
              <div className="pg-copy" style={{ bottom: `${format.margins.bottom / 2}in`, left: `${format.margins.left}in` }}>
                {watermark}
              </div>
            </>
          )}
          {page.lines.map((line, i) => {
            const top = `${format.margins.top + line.row * lh}in`;
            const n = sceneNumber(line);
            return (
              <Fragment key={i}>
                <div className={`el el-${line.type} pl`} style={{ top, left: `${format.margins.left}in` }}>
                  {line.text}
                </div>
                {n !== null && numberAt(top, n)}
                {revised?.has(line.blockIndex) && line.kind === "text" && (
                  <div className="pl pg-mark" style={{ top, left: `${format.page.width - format.margins.right + (sceneNumbers === "left" || sceneNumbers === "none" ? 0.3 : 0.75)}in` }}>
                    *
                  </div>
                )}
              </Fragment>
            );
          })}
        </section>
      ))}
    </div>
  );
});

const WRITTEN_BY: Record<FormatLanguage, string> = { fr: "Écrit par", en: "Written by", de: "Geschrieben von", es: "Escrito por" };

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
          // Centred lines sit on the middle of the sheet, not of the text block: the binding margin is wider.
          left: `${align === "center" ? (format.page.width - width) / 2 : align === "right" ? left + width - half : left}in`,
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
  const by = WRITTEN_BY[format.language];
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
