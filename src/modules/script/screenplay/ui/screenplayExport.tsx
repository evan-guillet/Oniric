import { commands } from "../../../../bindings";
import { unwrap } from "../../../../core/db/client";
import { dateFormat, t } from "../../../../core/i18n";
import { writeFdx } from "../../../../interop/fdx/write";
import { writeFountain } from "../../../../interop/fountain/write";
import type { ProjectApi } from "../../../project/ui/projectContext";
import { loadLock } from "../application/lock";
import { readSceneNumbers } from "../application/sceneNumbers";
import { readTitlePage } from "../application/titlePageSettings";
import type { VersionFile } from "../application/versions";
import { formatCss, type ScreenplayFormat } from "../domain/formats";
import { revisedElements } from "../domain/lock";
import { hasContent } from "../domain/titlePage";
import type { LaidBlock, Pagination } from "../domain/types";
import { blocksFromDoc } from "./editor/schema";
import { paginateStored } from "./editor/ScriptEditor";
import { PrintPages } from "./PrintPages";

/** A copy made for one reader [RET-01]: their name across the pages, and a frozen version instead of the text as it is. */
export interface ReaderCopy {
  watermark: string;
  fileName: string;
  version?: VersionFile;
}

/** The PDF of the screenplay, in the current format or another one [EDT-02, EDT-06]; locked, with its numbers and revision marks [REE-07]. */
export async function exportScreenplayPdf(api: Pick<ProjectApi, "session" | "printPdf" | "project">, other?: ScreenplayFormat, withTitle?: boolean, copy?: ReaderCopy) {
  const editor = api.session.editor;
  if (!editor) return;
  const f = copy?.version?.screenplayFormat ?? other ?? editor.currentFormat;
  const { pagination, blocks }: { pagination: Pagination; blocks: LaidBlock[] } = copy?.version
    ? paginateStored(copy.version.scenes, f)
    : other
      ? editor.paginationFor(other)
      : editor.snapshot;
  const [tp, numbers, lock] = await Promise.all([readTitlePage(), readSceneNumbers(), loadLock()]);
  const title = copy?.version ? copy.version.titlePage : (withTitle ?? hasContent(tp)) ? tp : null;
  const scenes = api.session.scenes();
  // The marks of the revision under way, on the text as it is now; the first revision (white) is the locked text.
  const revision = !copy?.version && lock && lock.revisions.length > 1 ? lock.revisions[lock.revisions.length - 1] : null;
  let revised: Set<number> | undefined;
  if (revision) {
    const marks = revisedElements(
      scenes.map((s) => {
        const elements: string[] = [];
        s.node.forEach((b) => elements.push(b.textContent));
        return { id: s.id, elements };
      }),
      revision.baseline,
    );
    revised = new Set();
    const seen = new Map<number, number>();
    blocks.forEach((b, i) => {
      const k = seen.get(b.sceneIndex) ?? 0;
      seen.set(b.sceneIndex, k + 1);
      if (marks.get(scenes[b.sceneIndex]?.id)?.[k]) revised!.add(i);
    });
  }
  await api.printPdf(
    copy?.fileName ?? `${api.project.title} (${f.paper}).pdf`,
    <div className="fmt">
      <style>{formatCss(f, false)}</style>
      <PrintPages
        pagination={pagination}
        format={f}
        titlePage={title && hasContent(title) ? title : null}
        blocks={blocks}
        sceneNumbers={lock && !copy?.version && numbers === "none" ? "both" : numbers}
        labels={lock && !copy?.version ? scenes.map((s) => s.number) : undefined}
        revised={revised}
        revision={revision ? t("lock.pageHeader", { color: t(`lock.colors.${revision.color}`), date: dateFormat({ dateStyle: "short" }).format(new Date(revision.startedAt)) }) : undefined}
        watermark={copy?.watermark}
      />
    </div>,
    { width: f.page.width, height: f.page.height },
  );
}

/** Writes the screenplay as Fountain or FDX in `exports/` and returns the file's path. */
export async function exportScreenplayText(api: Pick<ProjectApi, "session" | "project">, kind: "fountain" | "fdx"): Promise<string | null> {
  const editor = api.session.editor;
  if (!editor) return null;
  await api.session.flush();
  const [tp, numbers] = await Promise.all([readTitlePage(), readSceneNumbers()]);
  const blocks = blocksFromDoc(editor.doc, numbers !== "none");
  const page = hasContent(tp) ? tp : null;
  const contents = kind === "fountain" ? writeFountain(blocks, api.project.title, page) : writeFdx(blocks, page, editor.currentFormat.language === "fr");
  return unwrap(await commands.exportText(`${api.project.title}.${kind}`, contents));
}
