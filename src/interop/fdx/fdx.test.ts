import { describe, expect, it } from "vitest";
import type { ScriptBlock } from "../../modules/script/screenplay/domain/blocks";
import { parseFdx } from "./parse";
import { writeFdx } from "./write";

const sample = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">]>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading">
      <SceneProperties Length="1/8" Page="1" Title=""/>
      <Text>INT. CUISINE - NUIT</Text>
    </Paragraph>
    <Paragraph Type="Action"><Text>Marie boit du </Text><Text Style="Italic">lait</Text><Text> &amp; attend&#8230;</Text></Paragraph>
    <Paragraph Type="Character"><Text>MARIE</Text></Paragraph>
    <Paragraph Type="Parenthetical"><Text>(bas)</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Paul ? &lt;C'est toi&gt;</Text></Paragraph>
    <Paragraph>
      <DualDialogue>
        <Paragraph Type="Character"><Text>PAUL</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text>Oui.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
    <Paragraph Type="Cast List"><Text>MARIE, PAUL</Text></Paragraph>
    <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
    <Paragraph Type="General"><Text>&xxe;</Text></Paragraph>
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center" Type="Action"><Text>LES HEURES BLEUES</Text></Paragraph>
      <Paragraph Alignment="Center" Type="Action"><Text>Written by</Text></Paragraph>
      <Paragraph Alignment="Center" Type="Action"><Text>Evan</Text></Paragraph>
      <Paragraph Alignment="Left" Type="Action"><Text>evan@example.org</Text></Paragraph>
      <Paragraph Alignment="Right" Type="Action"><Text>Dépôt SACD 2026</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>`;

describe("parseFdx", () => {
  it("reads the paragraphs, dual dialogue and title page, and never resolves external entities", () => {
    const s = parseFdx(sample);
    expect(s.blocks).toEqual([
      { type: "scene_heading", text: "INT. CUISINE - NUIT" },
      { type: "action", text: "Marie boit du lait & attend…" },
      { type: "character", text: "MARIE" },
      { type: "parenthetical", text: "(bas)" },
      { type: "dialogue", text: "Paul ? <C'est toi>" },
      { type: "character", text: "PAUL" },
      { type: "dialogue", text: "Oui." },
      { type: "transition", text: "CUT TO:" },
      { type: "action", text: "&xxe;" },
    ]);
    expect(s.titlePage).toEqual({ title: "LES HEURES BLEUES", authors: "Evan", basedOn: "", contact: "evan@example.org", notes: "Dépôt SACD 2026" });
  });

  it("refuses a file that is not Final Draft", () => {
    expect(() => parseFdx("<html><body>non</body></html>")).toThrow(/Final Draft/);
  });
});

describe("writeFdx", () => {
  it("round-trips through the reader", () => {
    const blocks: ScriptBlock[] = [
      { type: "scene_heading", text: "int. toit – aube" },
      { type: "action", text: "Le ciel pâlit & <rougit>." },
      { type: "character", text: "Marie" },
      { type: "parenthetical", text: "(bas)" },
      { type: "dialogue", text: "Tu pars ?" },
      { type: "transition", text: "fondu au noir :" },
      { type: "shot", text: "gros plan" },
    ];
    const xml = writeFdx(blocks, {
      title: "Les Heures Bleues",
      subtitle: "",
      autoVersion: false,
      autoDate: false,
      mention: "custom",
      authors: "Evan",
      basedOn: "",
      version: "V2",
      date: "",
      contact: "evan@example.org",
      notes: "",
      include: true,
    });
    const back = parseFdx(xml);
    expect(back.blocks).toEqual(blocks.map((b) => (["scene_heading", "character", "transition", "shot"].includes(b.type) ? { ...b, text: b.text.toLocaleUpperCase("fr") } : b)));
    expect(back.titlePage?.title).toBe("LES HEURES BLEUES");
    expect(back.titlePage?.authors).toBe("Evan");
    expect(back.titlePage?.contact).toBe("evan@example.org");
  });
});
