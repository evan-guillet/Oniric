import type { ScriptBlock } from "../modules/script/screenplay/domain/blocks";
import { emptyTitlePage, type TitlePage } from "../modules/script/screenplay/domain/titlePage";
import { applyFrenchSpacing } from "../modules/script/screenplay/domain/typography";
import { parseFdx } from "./fdx/parse";
import { parseFountain } from "./fountain/parse";

export interface ScriptImport {
  fileName: string;
  title: string;
  blocks: ScriptBlock[];
  titlePage: TitlePage | null;
}

export const IMPORT_ACCEPT = ".fdx,.fountain,.spmd,.txt";

/** Any supported screenplay file, by its extension or its content [EDT-10]. */
export function importScript(fileName: string, text: string, french: boolean): ScriptImport {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const isFdx = /\.fdx$/i.test(fileName) || /^\s*(<\?xml[^>]*>\s*)?<FinalDraft/i.test(text);
  let blocks: ScriptBlock[];
  let title: string;
  let titlePage: TitlePage | null = null;
  if (isFdx) {
    const s = parseFdx(text);
    blocks = s.blocks;
    title = s.title ? s.title.charAt(0) + s.title.slice(1).toLocaleLowerCase("fr") : stem;
    if (s.titlePage) titlePage = { ...emptyTitlePage(title), ...s.titlePage, title, include: true };
  } else {
    const s = parseFountain(text);
    blocks = s.blocks;
    title = s.title ?? stem;
    if (Object.keys(s.meta).length > 0) {
      titlePage = {
        ...emptyTitlePage(title),
        authors: s.meta.author ?? s.meta.authors ?? "",
        basedOn: s.meta.source ?? "",
        version: s.meta["draft date"] ?? "",
        contact: s.meta.contact ?? "",
        notes: [s.meta.copyright, s.meta.notes].filter(Boolean).join("\n"),
        include: true,
      };
    }
  }
  if (french) blocks = blocks.map((b) => ({ ...b, text: applyFrenchSpacing(b.text) }));
  return { fileName, title, blocks, titlePage };
}
