import type { ScriptBlock } from "../../modules/script/screenplay/domain/blocks";
import type { ElementType } from "../../modules/script/screenplay/domain/formats";
import { elements, find, parseXml, textOf, type XmlElement } from "../xml";

export interface ImportedTitlePage {
  title: string;
  authors: string;
  basedOn: string;
  contact: string;
  notes: string;
}

export interface ImportedScript {
  title: string | null;
  blocks: ScriptBlock[];
  titlePage: ImportedTitlePage | null;
}

const TYPES: Record<string, ElementType> = {
  "scene heading": "scene_heading",
  action: "action",
  general: "action",
  character: "character",
  parenthetical: "parenthetical",
  dialogue: "dialogue",
  lyrics: "dialogue",
  transition: "transition",
  shot: "shot",
};

/** The text of a paragraph: its <Text> runs, without scene properties or notes. */
function paragraphText(p: XmlElement): string {
  return elements(p, "Text")
    .map(textOf)
    .join("")
    .replace(/\r?\n/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function paragraphs(content: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (const p of elements(content, "Paragraph")) {
    const dual = find(p, "DualDialogue");
    if (dual) out.push(...elements(dual, "Paragraph"));
    else out.push(p);
  }
  return out;
}

const BY = /^(written\s+by|écrit\s+par|by|de|scénario\s+de|un\s+film\s+de)$/i;

function titlePageOf(root: XmlElement): ImportedTitlePage | null {
  const tp = find(root, "TitlePage");
  const content = tp && find(tp, "Content");
  if (!content) return null;
  const items = elements(content, "Paragraph")
    .map((p) => ({ text: paragraphText(p), align: (p.attrs.Alignment ?? "").toLowerCase() }))
    .filter((p) => p.text);
  if (!items.length) return null;
  const page: ImportedTitlePage = { title: items[0].text, authors: "", basedOn: "", contact: "", notes: "" };
  for (let i = 1; i < items.length; i++) {
    const it = items[i];
    if (BY.test(it.text) && items[i + 1]) {
      page.authors = [page.authors, items[++i].text].filter(Boolean).join("\n");
    } else if (/^(d'après|based on|inspiré)/i.test(it.text)) {
      page.basedOn = [page.basedOn, it.text].filter(Boolean).join("\n");
    } else if (it.align === "right") {
      page.notes = [page.notes, it.text].filter(Boolean).join("\n");
    } else if (it.align === "left" || it.align === "") {
      page.contact = [page.contact, it.text].filter(Boolean).join("\n");
    } else if (!page.authors) {
      page.authors = it.text;
    } else {
      page.notes = [page.notes, it.text].filter(Boolean).join("\n");
    }
  }
  return page;
}

/** Final Draft (.fdx) reader: the paragraphs of the script and its title page [EDT-10]. */
export function parseFdx(source: string): ImportedScript {
  const root = parseXml(source);
  const doc = find(root, "FinalDraft");
  if (!doc) throw new Error("Ce fichier n'est pas un scénario Final Draft (.fdx).");
  const content = elements(doc, "Content")[0];
  const blocks: ScriptBlock[] = [];
  if (content) {
    for (const p of paragraphs(content)) {
      const raw = (p.attrs.Type ?? "Action").toLowerCase();
      if (raw === "cast list" || raw === "new act" || raw === "end of act") continue;
      const type = TYPES[raw] ?? "action";
      const text = paragraphText(p);
      if (!text && type !== "scene_heading") continue;
      blocks.push({ type, text });
    }
  }
  const titlePage = titlePageOf(doc);
  return { title: titlePage?.title ?? null, blocks, titlePage };
}
