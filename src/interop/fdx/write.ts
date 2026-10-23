import type { ScriptBlock } from "../../modules/script/screenplay/domain/blocks";
import type { ElementType } from "../../modules/script/screenplay/domain/formats";
import type { TitlePage } from "../../modules/script/screenplay/domain/titlePage";
import { escapeXml } from "../xml";

const TYPES: Record<ElementType, string> = {
  scene_heading: "Scene Heading",
  action: "Action",
  character: "Character",
  parenthetical: "Parenthetical",
  dialogue: "Dialogue",
  transition: "Transition",
  shot: "Shot",
  on_screen_text: "Action",
};

const UPPER: ElementType[] = ["scene_heading", "character", "transition", "shot"];

function paragraph(type: string, text: string, alignment?: string): string {
  const align = alignment ? ` Alignment="${alignment}"` : "";
  return `    <Paragraph${align} Type="${type}">\n      <Text>${escapeXml(text)}</Text>\n    </Paragraph>`;
}

function titlePageXml(p: TitlePage, french: boolean): string {
  const lines: string[] = [];
  const add = (text: string, alignment: string) => lines.push(paragraph("Action", text, alignment).replace(/^ {4}/gm, "      "));
  for (let i = 0; i < 12; i++) add("", "Center");
  add(p.title.toLocaleUpperCase("fr"), "Center");
  if (p.subtitle.trim()) {
    add("", "Center");
    for (const s of p.subtitle.split("\n")) add(s, "Center");
  }
  if (p.authors.trim()) {
    add("", "Center");
    add(french ? "Écrit par" : "Written by", "Center");
    add("", "Center");
    for (const a of p.authors.split("\n")) add(a, "Center");
  }
  if (p.basedOn.trim()) {
    add("", "Center");
    for (const b of p.basedOn.split("\n")) add(b, "Center");
  }
  for (let i = 0; i < 16; i++) add("", "Left");
  for (const c of p.contact.split("\n").filter(Boolean)) add(c, "Left");
  for (const n of [p.version, p.date, ...p.notes.split("\n")].filter((s) => s.trim())) add(n, "Right");
  return `  <TitlePage>\n    <Content>\n${lines.join("\n")}\n    </Content>\n  </TitlePage>`;
}

/**
 * Final Draft (.fdx) writer. Final Draft has no on-screen text element: it is written as action.
 * Elements printed in capitals are written in capitals, as Final Draft expects them.
 */
export function writeFdx(blocks: ScriptBlock[], titlePage: TitlePage | null, french = true): string {
  const body = blocks
    .filter((b) => b.text.length > 0 || b.type === "scene_heading")
    .map((b) => paragraph(TYPES[b.type], UPPER.includes(b.type) ? b.text.toLocaleUpperCase("fr") : b.text.replace(/\n/g, " ")))
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    "  <Content>",
    body,
    "  </Content>",
    ...(titlePage ? [titlePageXml(titlePage, french)] : []),
    "</FinalDraft>",
    "",
  ].join("\n");
}
