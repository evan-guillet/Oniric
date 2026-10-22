import { commands } from "../../../../bindings";
import { unwrap } from "../../../../core/db/client";
import { writeFdx } from "../../../../interop/fdx/write";
import { writeFountain } from "../../../../interop/fountain/write";
import type { ProjectApi } from "../../../project/ui/projectContext";
import { readTitlePage } from "../application/titlePageSettings";
import { formatCss, type ScreenplayFormat } from "../domain/formats";
import { hasContent } from "../domain/titlePage";
import type { Pagination } from "../domain/types";
import { blocksFromDoc } from "./editor/schema";
import { PrintPages } from "./PrintPages";

/** The PDF of the screenplay, in the current format or another one [EDT-02, EDT-06]. */
export async function exportScreenplayPdf(api: Pick<ProjectApi, "session" | "printPdf" | "project">, other?: ScreenplayFormat, withTitle?: boolean) {
  const editor = api.session.editor;
  if (!editor) return;
  const f = other ?? editor.currentFormat;
  const pagination: Pagination = other ? editor.paginationFor(other).pagination : editor.snapshot.pagination;
  const tp = await readTitlePage();
  const title = (withTitle ?? hasContent(tp)) ? tp : null;
  await api.printPdf(
    `${api.project.title} (${f.paper}).pdf`,
    <div className="fmt">
      <style>{formatCss(f, false)}</style>
      <PrintPages pagination={pagination} format={f} titlePage={title} />
    </div>,
    { width: f.page.width, height: f.page.height },
  );
}

/** Writes the screenplay as Fountain or FDX in `exports/` and returns the file's path. */
export async function exportScreenplayText(api: Pick<ProjectApi, "session" | "project">, kind: "fountain" | "fdx"): Promise<string | null> {
  const editor = api.session.editor;
  if (!editor) return null;
  await api.session.flush();
  const blocks = blocksFromDoc(editor.doc);
  const tp = await readTitlePage();
  const page = hasContent(tp) ? tp : null;
  const contents = kind === "fountain" ? writeFountain(blocks, api.project.title, page) : writeFdx(blocks, page, editor.currentFormat.language === "fr");
  return unwrap(await commands.exportText(`${api.project.title}.${kind}`, contents));
}
