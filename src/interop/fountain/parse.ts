import type { ScriptBlock } from "../../modules/script/screenplay/domain/blocks";

export const HEADING = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
export const TRANSITION = /^[A-ZÀ-Ý\s]+(TO|À):$/;

const clean = (s: string) =>
  s
    .replace(/\s*#[^#]+#\s*$/, "")
    .replace(/(\*{1,3}|_)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/[ \t]+/g, " ")
    .trim();

export const isUpper = (s: string) => /\p{Lu}/u.test(s) && s === s.toLocaleUpperCase("fr");

export interface FountainScript {
  title: string | null;
  blocks: ScriptBlock[];
  /** Keys of the title page, in lower case (`title`, `author`, `contact`…). */
  meta: Record<string, string>;
}

/** Fountain 1.1 reader (fountain.io): headings, action, characters, parentheticals, dialogue, transitions. */
export function parseFountain(source: string): FountainScript {
  const text = source
    .replace(/\r\n?/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\[\[[\s\S]*?\]\]/g, "");
  const lines = text.split("\n");
  let i = 0;
  const meta: Record<string, string> = {};
  if (/^\s*[\w ]+:/.test(lines[0] ?? "")) {
    let key = "";
    while (i < lines.length && lines[i].trim() !== "") {
      const m = /^([\w ]+):\s*(.*)$/.exec(lines[i]);
      if (m && !/^\s/.test(lines[i])) {
        key = m[1].trim().toLowerCase();
        meta[key] = clean(m[2]);
      } else if (key) {
        meta[key] = [meta[key], clean(lines[i])].filter(Boolean).join("\n");
      }
      i++;
    }
  }
  const title = meta.title?.split("\n")[0] || null;

  const out: ScriptBlock[] = [];
  const blank = (k: number) => k < 0 || k >= lines.length || lines[k].trim() === "";
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "" || t === "===" || t.startsWith("#") || /^=(?!=)/.test(t)) {
      i++;
      continue;
    }
    if (t.startsWith("!")) {
      const para: string[] = [t.slice(1)];
      while (!blank(++i)) para.push(lines[i].trim());
      out.push({ type: "action", text: clean(para.join(" ")) });
      continue;
    }
    if ((/^\.[^.]/.test(t) || HEADING.test(t)) && blank(i - 1)) {
      out.push({ type: "scene_heading", text: clean(t.replace(/^\./, "")) });
      i++;
      continue;
    }
    if ((TRANSITION.test(t) || (t.startsWith(">") && !t.endsWith("<"))) && blank(i - 1) && blank(i + 1)) {
      out.push({ type: "transition", text: clean(t.replace(/^>/, "")) });
      i++;
      continue;
    }
    const forcedCharacter = t.startsWith("@");
    if ((forcedCharacter || isUpper(t.replace(/\(.*\)/, ""))) && blank(i - 1) && !blank(i + 1)) {
      out.push({ type: "character", text: clean(t.replace(/^@/, "").replace(/\s*\^$/, "")) });
      i++;
      let dialogue: string[] = [];
      const flush = () => {
        if (dialogue.length) out.push({ type: "dialogue", text: clean(dialogue.join(" ")) });
        dialogue = [];
      };
      while (!blank(i)) {
        const d = lines[i].trim();
        if (d.startsWith("(")) {
          flush();
          out.push({ type: "parenthetical", text: clean(d) });
        } else {
          dialogue.push(d);
        }
        i++;
      }
      flush();
      continue;
    }
    const para: string[] = [];
    while (!blank(i)) para.push(lines[i++].trim().replace(/^>(.*)<$/, "$1"));
    out.push({ type: "action", text: clean(para.join(" ")) });
  }
  return { title, blocks: out, meta };
}
