import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { rankBetween } from "../../../../core/ordering";
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

type Tab = "synopsis" | "sequencer" | "treatment" | "continuity";

const TABS: { id: Tab; label: string }[] = [
  { id: "synopsis", label: "Synopsis" },
  { id: "sequencer", label: "Séquencier" },
  { id: "treatment", label: "Traitement" },
  { id: "continuity", label: "Continuité dialoguée" },
];

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Step 4: synopsis, sequencer, treatment, dialogue continuity, linked together [DOC-01, DOC-02]. */
export function StepDocuments() {
  const [tab, setTab] = useState<Tab>("synopsis");
  return (
    <div className="step-body">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "tab on" : "tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "synopsis" && (
        <DocEditor
          kind="synopsis"
          title="Synopsis"
          goal={[1, 2]}
          help="Toute l'histoire, fin comprise, en une ou deux pages, au présent. Ce n'est pas un texte de vente : on y dit tout."
        />
      )}
      {tab === "sequencer" && <Sequencer />}
      {tab === "treatment" && (
        <DocEditor
          kind="treatment"
          title="Traitement"
          goal={[5, 20]}
          help="La version racontée du film, de 5 à 20 pages, au présent, presque sans dialogues. Les séquences du séquencier en sont les intertitres."
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

  if (!doc) return <p className="muted">Chargement…</p>;
  const words = wordCount(richPlainText(doc.content));
  const pages = pagesOf(words);
  const within = pages >= goal[0] && pages <= goal[1];

  const generate = async () => {
    const seqs = orderedSequences(story);
    if (!seqs.length) {
      notify({ text: "Le séquencier est vide : ajoutez d'abord des séquences.", tone: "warning" });
      return;
    }
    const empty = words === 0;
    const choice = empty
      ? "replace"
      : await ask({
          title: "Squelette du traitement",
          text: <p>Les titres des {seqs.length} séquences deviennent les intertitres du traitement, avec leur résumé.</p>,
          cancel: "Annuler",
          choices: [
            { label: "Ajouter à la fin", value: "append" },
            { label: "Remplacer le texte", value: "replace", danger: true },
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
          {words} mots · ≈ {pages.toLocaleString("fr-FR")} page{pages > 1 ? "s" : ""} (objectif {goal[0]} à {goal[1]})
        </span>
        <span className="spacer" />
        {skeleton && (
          <button type="button" className="btn small" onClick={() => void generate()}>
            Générer depuis le séquencier
          </button>
        )}
        <button type="button" className="btn small" onClick={() => setVersions(true)}>
          Versions…
        </button>
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            await flush();
            const name = await prompt(`Figer le ${title.toLowerCase()}`, "Nom de la version", `V${dateFormat.format(new Date())}`);
            if (name) await freezeDocument(kind, name, latest.current).then(() => notify({ text: `Version « ${name} » figée.` }));
          }}
        >
          Figer une version
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => void exportDocumentPdf({ printPdf, project }, title, latest.current)}
        >
          Exporter en PDF
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
            notify({ text: "Version reprise. Ctrl+Z ne la défait pas : figez d'abord la version actuelle si besoin." });
          }}
        />
      )}
    </section>
  );
}

function VersionsDialog({ kind, onClose, onRestore }: { kind: DocumentKind; onClose: () => void; onRestore: (content: string) => void }) {
  const versions = useLive(() => documentVersions(kind), ["document_version", "document"], [kind]);
  return (
    <Dialog title="Versions du document" wide onCancel={onClose} actions={[{ label: "Fermer", onClick: onClose }]}>
      {!versions ? (
        <p className="muted">Chargement…</p>
      ) : versions.length === 0 ? (
        <p className="muted">Aucune version figée. « Figer une version » garde une copie nommée du document.</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{v.name}</strong> <span className="muted small">{dateFormat.format(new Date(v.createdAt))}</span>
                <span className="history-text">{richPlainText(v.content).slice(0, 160)}</span>
              </span>
              <button type="button" className="btn small" onClick={() => onRestore(v.content)}>
                Reprendre
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
  if (!story) return <p className="muted">Chargement…</p>;
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
      <Help>La liste ordonnée des grandes séquences du film. Chaque séquence ajoutée ici apparaît dans le Tableau et, s'il est commencé, dans le traitement.</Help>
      <ol className="sequencer">
        {seqs.map((s, i) => (
          <li key={s.id}>
            <span className="seq-n">{i + 1}</span>
            <div className="seq-fields">
              <input defaultValue={s.title} aria-label="Titre de la séquence" onBlur={(e) => e.target.value !== s.title && void updateSequence(s.id, { title: e.target.value })} />
              <textarea rows={2} defaultValue={s.summary} placeholder="Ce qui s'y passe…" aria-label="Résumé de la séquence" onBlur={(e) => e.target.value !== s.summary && void updateSequence(s.id, { summary: e.target.value })} />
            </div>
            <select value={s.actId ?? ""} onChange={(e) => void updateSequence(s.id, { act_id: e.target.value || null })} aria-label="Acte">
              <option value="">Sans acte</option>
              {story.acts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
            <span className="row-actions">
              <button type="button" className="btn ghost small" disabled={i === 0} onClick={() => void move(i, -1)} aria-label="Monter">
                <ArrowUp aria-hidden="true" />
              </button>
              <button type="button" className="btn ghost small" disabled={i === seqs.length - 1} onClick={() => void move(i, 1)} aria-label="Descendre">
                <ArrowDown aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn ghost small"
                aria-label="Supprimer la séquence"
                onClick={async () => {
                  const c = await ask({ title: "Supprimer la séquence ?", text: <p>Ses scènes restent dans le scénario.</p>, cancel: "Annuler", choices: [{ label: "Supprimer", value: "y", danger: true }] });
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la nouvelle séquence" aria-label="Nouvelle séquence" />
        <button type="submit" className="btn" disabled={!title.trim()}>
          Ajouter la séquence
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
  if (text === null) return <p className="muted">Chargement…</p>;

  const convert = async () => {
    const editor = session.editor;
    if (!editor) return;
    const blocks = parseFountain(text).blocks.map((b) => ({ ...b, text: applyFrenchSpacing(b.text) }));
    if (!blocks.length) return;
    const empty = editor.doc.textContent.trim() === "";
    const choice = empty
      ? "replace"
      : await ask({
          title: "Convertir en scénario",
          text: <p>{blocks.length} éléments reconnus. Ctrl+Z dans le scénario permet de revenir en arrière.</p>,
          cancel: "Annuler",
          choices: [
            { label: "Ajouter à la fin du scénario", value: "append", primary: true },
            { label: "Remplacer le scénario", value: "replace", danger: true },
          ],
        });
    if (!choice) return;
    const doc = docFromBlocks(blocks);
    if (choice === "replace") editor.replaceContent(doc);
    else editor.appendDoc(doc);
    go("script");
  };

  return (
    <section className="step-section">
      <Help>
        Facultatif. Les scènes une à une avec les premiers dialogues, écrites librement : un en-tête « INT. CUISINE – NUIT », un nom en majuscules sur sa ligne
        avant chaque réplique. Une fois prête, la continuité se convertit en scénario formaté.
      </Help>
      <textarea className="continuity" rows={22} value={text} onChange={(e) => save(e.target.value)} aria-label="Continuité dialoguée" spellCheck={false} />
      <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => void convert()}>
        Convertir en scénario
      </button>
    </section>
  );
}
