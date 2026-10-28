import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { rankBetween } from "../../../../core/ordering";
import { markEditorStep } from "../../../../core/history";
import { Dialog } from "../../../../ui-kit/Dialog";
import { pagesOf, RichText, richAppend, richFromParts, richPlainText, richSchema, wordCount } from "../../../../ui-kit/RichText";
import { useProject } from "../../../project/ui/projectContext";
import { parseFountain } from "../../../../interop/fountain/parse";
import { bibleIndex } from "../../bible/application/bible";
import { wikiPlugin } from "../../bible/ui/wikiPlugin";
import { docFromBlocks } from "../../screenplay/ui/editor/schema";
import { applyFrenchSpacing } from "../../screenplay/domain/typography";
import { addSequence, deleteSequence, loadStory, STORY_TABLES, updateSequence, type Sequence } from "../../views/application/story";
import { documentVersions, freezeDocument, loadDocument, saveDocument, type DocumentKind } from "../application/workshop";
import { exportDocumentPdf } from "./documentExport";
import { Help } from "./fields";

import { Select } from "../../../../ui-kit/Select";
import { dateFormat, plural, t } from "../../../../core/i18n";
type Tab = "synopsis" | "sequencer" | "treatment" | "continuity";

const TABS: Tab[] = ["synopsis", "sequencer", "treatment", "continuity"];

const dates = () => dateFormat({ dateStyle: "medium", timeStyle: "short" });

/** Step 4: synopsis, sequencer, treatment, dialogue continuity, linked together [DOC-01, DOC-02]. */
export function StepDocuments() {
  const [tab, setTab] = useState<Tab>("synopsis");
  return (
    <div className="step-body">
      <div className="tabs" role="tablist">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "tab on" : "tab"} onClick={() => setTab(id)}>
            {t(`docs.tabs.${id}`)}
          </button>
        ))}
      </div>
      {tab === "synopsis" && (
        <DocEditor
          kind="synopsis"
          title={t("docs.tabs.synopsis")}
          goal={[1, 2]}
          help={t("docs.synopsisHelp")}
        />
      )}
      {tab === "sequencer" && <Sequencer />}
      {tab === "treatment" && (
        <DocEditor
          kind="treatment"
          title={t("docs.tabs.treatment")}
          goal={[5, 20]}
          help={t("docs.treatmentHelp")}
          skeleton
        />
      )}
      {tab === "continuity" && <Continuity />}
    </div>
  );
}

function DocEditor({ kind, title, goal, help, skeleton }: { kind: DocumentKind; title: string; goal: [number, number]; help: string; skeleton?: boolean }) {
  const { notify, ask, prompt, printPdf, project } = useProject();
  const [doc, setDoc] = useState<{ content: string; key: number } | null>(null);
  const [versions, setVersions] = useState(false);
  const latest = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plugins = useMemo(() => [wikiPlugin(richSchema.marks.wikilink, () => bibleIndex)], []);
  const story = useLive(loadStory, [...STORY_TABLES]);

  useEffect(() => {
    void loadDocument(kind).then((d) => {
      latest.current = d.content;
      setDoc({ content: d.content, key: 0 });
    });
  }, [kind]);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    try {
      await saveDocument(kind, latest.current);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  useEffect(
    () => () => {
      if (timer.current) void flush();
    },
    [],
  );

  const change = (json: string) => {
    latest.current = json;
    setDoc((d) => d && { ...d, content: json });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  };

  const replace = (content: string) => {
    latest.current = content;
    setDoc((d) => ({ content, key: (d?.key ?? 0) + 1 }));
    void flush();
  };

  if (!doc) return <p className="muted">{t("dash.loading")}</p>;
  const words = wordCount(richPlainText(doc.content));
  const pages = pagesOf(words);
  const within = pages >= goal[0] && pages <= goal[1];

  const generate = async () => {
    const seqs = orderedSequences(story);
    if (!seqs.length) {
      notify({ text: t("docs.sequencerEmpty"), tone: "warning" });
      return;
    }
    const empty = words === 0;
    const choice = empty
      ? "replace"
      : await ask({
          title: t("docs.skeleton"),
          text: <p>{t("docs.skeletonText", { n: seqs.length })}</p>,
          cancel: t("common.cancel"),
          choices: [
            { label: t("docs.append"), value: "append" },
            { label: t("docs.replaceText"), value: "replace", danger: true },
          ],
        });
    if (!choice) return;
    const parts = seqs.map((s) => [{ heading: s.title }, { text: s.summary }]).flat();
    const built = richFromParts(parts);
    replace(choice === "replace" ? built : richAppend(latest.current, built));
  };

  return (
    <section className="step-section doc-editor">
      <Help>{help}</Help>
      <div className="doc-bar">
        <span className={within ? "badge ok" : "badge"}>
          {t("docs.length", { words: plural("dash.words", words), pages: plural("versions.pages", pages), min: goal[0], max: goal[1] })}
        </span>
        <span className="spacer" />
        {skeleton && (
          <button type="button" className="btn small" onClick={() => void generate()}>
            {t("docs.generate")}
          </button>
        )}
        <button type="button" className="btn small" onClick={() => setVersions(true)}>
          {t("docs.versions")}
        </button>
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            await flush();
            const name = await prompt(t("docs.freezeTitle", { title: title.toLowerCase() }), t("versions.name"), `V${dates().format(new Date())}`);
            if (name) await freezeDocument(kind, name, latest.current).then(() => notify({ text: t("docs.frozen", { name }) }));
          }}
        >
          {t("docs.freeze")}
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => void exportDocumentPdf({ printPdf, project }, title, latest.current)}
        >
          {t("workspace.exportPdf")}
        </button>
      </div>
      <RichText key={doc.key} value={doc.content} onChange={change} label={title} plugins={plugins} minHeight={420} className="paper-like" />
      {versions && (
        <VersionsDialog
          kind={kind}
          onClose={() => setVersions(false)}
          onRestore={(content) => {
            replace(content);
            setVersions(false);
            notify({ text: t("docs.restored") });
          }}
        />
      )}
    </section>
  );
}

function VersionsDialog({ kind, onClose, onRestore }: { kind: DocumentKind; onClose: () => void; onRestore: (content: string) => void }) {
  const versions = useLive(() => documentVersions(kind), ["document_version", "document"], [kind]);
  return (
    <Dialog title={t("docs.versionsTitle")} wide onCancel={onClose} actions={[{ label: t("common.close"), onClick: onClose }]}>
      {!versions ? (
        <p className="muted">{t("dash.loading")}</p>
      ) : versions.length === 0 ? (
        <p className="muted">{t("docs.noVersion")}</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{v.name}</strong> <span className="muted small">{dates().format(new Date(v.createdAt))}</span>
                <span className="history-text">{richPlainText(v.content).slice(0, 160)}</span>
              </span>
              <button type="button" className="btn small" onClick={() => onRestore(v.content)}>
                {t("fields.takeBack")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function orderedSequences(story: Awaited<ReturnType<typeof loadStory>> | undefined): Sequence[] {
  if (!story) return [];
  const actRank = new Map(story.acts.map((a) => [a.id, a.rank]));
  return [...story.sequences].sort((a, b) => {
    const ra = a.actId ? (actRank.get(a.actId) ?? "") : "";
    const rb = b.actId ? (actRank.get(b.actId) ?? "") : "";
    return ra < rb ? -1 : ra > rb ? 1 : a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
  });
}

/** The sequencer is the list of the project's sequences: the same ones as in the board [DOC-01]. */
function Sequencer() {
  const { notify, ask } = useProject();
  const story = useLive(loadStory, [...STORY_TABLES]);
  const [title, setTitle] = useState("");
  if (!story) return <p className="muted">{t("dash.loading")}</p>;
  const seqs = orderedSequences(story);

  const add = async () => {
    if (!title.trim()) return;
    try {
      const lastAct = seqs.at(-1)?.actId ?? null;
      await addSequence(story, lastAct, title.trim());
      const treatment = await loadDocument("treatment");
      if (wordCount(richPlainText(treatment.content)) > 0) await saveDocument("treatment", richAppend(treatment.content, richFromParts([{ heading: title.trim() }, { text: "" }])));
      setTitle("");
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const move = async (i: number, d: number) => {
    const a = seqs[i];
    const b = seqs[i + d];
    if (!a || !b) return;
    const siblings = seqs.filter((s) => s.actId === b.actId && s.id !== a.id);
    const at = siblings.indexOf(b) + (d > 0 ? 1 : 0);
    const rank = rankBetween(siblings[at - 1]?.rank ?? null, siblings[at]?.rank ?? null);
    await updateSequence(a.id, { act_id: b.actId, rank });
  };

  return (
    <section className="step-section">
      <Help>{t("docs.sequencerHelp")}</Help>
      <ol className="sequencer">
        {seqs.map((s, i) => (
          <li key={s.id}>
            <span className="seq-n">{i + 1}</span>
            <div className="seq-fields">
              <input defaultValue={s.title} aria-label={t("board.sequenceTitle")} onBlur={(e) => e.target.value !== s.title && void updateSequence(s.id, { title: e.target.value })} />
              <textarea rows={2} defaultValue={s.summary} placeholder={t("docs.sequenceSummaryPlaceholder")} aria-label={t("docs.sequenceSummary")} onBlur={(e) => e.target.value !== s.summary && void updateSequence(s.id, { summary: e.target.value })} />
            </div>
            <Select value={s.actId ?? ""} onChange={(e) => void updateSequence(s.id, { act_id: e.target.value || null })} aria-label={t("docs.act")}>
              <option value="">{t("board.noAct")}</option>
              {story.acts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
            <span className="row-actions">
              <button type="button" className="btn ghost small" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={t("typeEditor.up")}>
                <ArrowUp aria-hidden="true" />
              </button>
              <button type="button" className="btn ghost small" disabled={i === seqs.length - 1} onClick={() => void move(i, 1)} aria-label={t("typeEditor.down")}>
                <ArrowDown aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn ghost small"
                aria-label={t("docs.deleteSequence")}
                onClick={async () => {
                  const c = await ask({ title: t("script.removeSequence"), text: <p>{t("docs.removeSequenceText")}</p>, cancel: t("common.cancel"), choices: [{ label: t("common.delete"), value: "y", danger: true }] });
                  if (c === "y") await deleteSequence(s.id);
                }}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <form
        className="input-row"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("docs.newSequencePlaceholder")} aria-label={t("board.newSequence")} />
        <button type="submit" className="btn" disabled={!title.trim()}>
          {t("docs.addSequence")}
        </button>
      </form>
    </section>
  );
}

/** Scene by scene, with first dialogue; converted into a formatted screenplay when ready. */
function Continuity() {
  const { notify, ask, session, go } = useProject();
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void loadDocument("continuity").then((d) => {
      try {
        setText((JSON.parse(d.content) as { text?: string }).text ?? "");
      } catch {
        setText("");
      }
    });
  }, []);
  const save = (t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveDocument("continuity", JSON.stringify({ type: "text", text: t })).catch((e) => notify({ text: describeError(e), tone: "error" })), 800);
  };
  if (text === null) return <p className="muted">{t("dash.loading")}</p>;

  const convert = async () => {
    const editor = session.editor;
    if (!editor) return;
    const blocks = parseFountain(text).blocks.map((b) => ({ ...b, text: applyFrenchSpacing(b.text) }));
    if (!blocks.length) return;
    const empty = editor.doc.textContent.trim() === "";
    const choice = empty
      ? "replace"
      : await ask({
          title: t("docs.convert"),
          text: <p>{t("docs.convertText", { n: blocks.length })}</p>,
          cancel: t("common.cancel"),
          choices: [
            { label: t("docs.appendScript"), value: "append", primary: true },
            { label: t("docs.replaceScript"), value: "replace", danger: true },
          ],
        });
    if (!choice) return;
    const doc = docFromBlocks(blocks);
    if (choice === "replace") editor.replaceContent(doc);
    else editor.appendDoc(doc);
    void markEditorStep(editor, "Document converti en scénario");
    go("script");
  };

  return (
    <section className="step-section">
      <Help>{t("docs.continuityHelp")}</Help>
      <textarea className="continuity" rows={22} value={text} onChange={(e) => save(e.target.value)} aria-label={t("docs.continuity")} spellCheck={false} />
      <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => void convert()}>
        {t("docs.convert")}
      </button>
    </section>
  );
}
