import type { ScriptBlock } from "../../modules/script/screenplay/domain/blocks";
import type { TitlePage } from "../../modules/script/screenplay/domain/titlePage";
import { HEADING, isUpper, TRANSITION } from "./parse";

const SPECIAL_START = /^[.@>!#=~\[]/;

function action(text: string): string {
  return isUpper(text) || HEADING.test(text) || SPECIAL_START.test(text) ? `!${text}` : text;
}

/**
 * Fountain 1.1 writer. Character names are printed in capitals, so they are written in capitals.
 * Fountain has no shot nor on-screen text: both are written as forced action, and come back as action.
 */
function key(name: string, value: string): string[] {
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  return lines.length === 1 ? [`${name}: ${lines[0]}`] : [`${name}:`, ...lines.map((l) => `    ${l}`)];
}

export function writeFountain(blocks: ScriptBlock[], title?: string, page?: TitlePage | null): string {
  const out: string[] = [];
  if (page) {
    out.push(
      ...key("Title", [page.title || title || "", page.subtitle].join("\n")),
      ...(page.authors.trim() ? ["Credit: Écrit par", ...key("Author", page.authors)] : []),
      ...key("Source", page.basedOn),
      ...key("Draft date", [page.version, page.date].filter((s) => s.trim()).join(" – ")),
      ...key("Contact", page.contact),
      ...key("Notes", page.notes),
      "",
    );
  } else if (title) out.push(`Title: ${title}`, "");
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1]?.type;
    const insideDialogue = (b.type === "dialogue" || b.type === "parenthetical") && prev !== undefined && ["character", "dialogue", "parenthetical"].includes(prev);
    if (!insideDialogue && out.length > 0 && out[out.length - 1] !== "") out.push("");
    const text = b.text.replace(/\n/g, " ");
    switch (b.type) {
      case "scene_heading": {
        const h = text.toLocaleUpperCase("fr");
        const n = b.sceneNumber !== undefined ? ` #${b.sceneNumber}#` : "";
        out.push((HEADING.test(h) ? h : `.${h}`) + n);
        break;
      }
      case "character": {
        const name = text.toLocaleUpperCase("fr");
        out.push(isUpper(name.replace(/\(.*\)/, "")) ? name : `@${name}`);
        break;
      }
      case "parenthetical":
        out.push(text.startsWith("(") ? text : `(${text})`);
        break;
      case "dialogue":
        out.push(text.length > 0 ? text : " ");
        break;
      case "transition": {
        const tr = text.toLocaleUpperCase("fr");
        out.push(TRANSITION.test(tr) ? tr : `>${tr}`);
        break;
      }
      case "shot":
        out.push(`!${text.toLocaleUpperCase("fr")}`);
        break;
      default:
        if (text.length > 0) out.push(action(text));
    }
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
