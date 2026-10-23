import {
  BookOpen,
  Feather,
  Files,
  FileText,
  Plus,
  ScrollText,
  StickyNote,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { commands } from "../../../../bindings";
import { db, nowIso, query, unwrap, write } from "../../../../core/db/client";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { uuidv7 } from "../../../../core/ids";
import { Segmented, type SegmentedOption } from "../../../../ui-kit/Segmented";
import { readProfile } from "../../../project/application/profile";
import { useProject } from "../../../project/ui/projectContext";
import { bibleIndex } from "../../bible/application/bible";
import { wikiPlugin } from "../../bible/ui/wikiPlugin";
import {
  availableFormats,
  readProjectFormat,
} from "../application/formatSettings";
import { SaveScheduler } from "../application/saveScheduler";
import { SceneStore } from "../application/sceneStore";
import {
  readTitlePage,
  readTitlePageRaw,
  titleAuto,
  writeTitlePage,
} from "../application/titlePageSettings";
import { formatCss, type ScreenplayFormat } from "../domain/formats";
import {
  emptyTitlePage,
  hasContent,
  MENTIONS,
  resolveTitlePage,
  type MentionId,
  type TitleAuto,
  type TitlePage,
} from "../domain/titlePage";
import { schema } from "./editor/schema";
import { ScriptEditor, type EditorSnapshot } from "./editor/ScriptEditor";
import { ElementBar } from "./ElementBar";
import { expectedPdf } from "./expectedPdf";
import { PrintPages, PrintTitlePage } from "./PrintPages";
import { SceneList, type ListGroup, type SceneRow } from "./SceneList";
import { STORY_TABLES, loadStory, storyOutline } from "../../views/application/story";
import { numberedParts } from "../../views/domain/outline";
import { useScenes } from "../application/scriptSession";
import { exportScreenplayPdf } from "./screenplayExport";

/** How the screenplay shows on screen; the pagination, exports and printing stay the same. */
type Display = "pages" | "continuous" | "bare";
const DISPLAY_KEY = "oniric.script.display";
const DISPLAYS: SegmentedOption<Display>[] = [
  { id: "pages", label: "Pages", hint: "Les pages comme à l'impression", icon: Files },
  { id: "continuous", label: "Continu", hint: "Une seule feuille, un trait à chaque saut de page", icon: ScrollText },
  { id: "bare", label: "Sans feuille", hint: "Le texte seul, à même le fond", icon: Feather },
];

/** What the side panel holds; the title page also takes the body, to show the page as it prints. */
type Panel = "scenes" | "notes" | "title";
const PANELS: Record<Panel, string> = { scenes: "Scènes", notes: "Notes", title: "Page de titre" };

function savedDisplay(): Display {
  try {
    const d = localStorage.getItem(DISPLAY_KEY);
    if (d === "continuous" || d === "bare") return d;
  } catch {
    // Storage unavailable: the default display.
  }
  return "pages";
}

function sameRows(a: SceneRow[], b: SceneRow[]) {
  return (
    a.length === b.length &&
    a.every(
      (r, i) =>
        r.heading === b[i].heading &&
        r.page === b[i].page &&
        r.eighths === b[i].eighths,
    )
  );
}

/** The screenplay view: the editor, its scene list and its notes. It stays mounted while other views are shown. */
export function ScreenplayWorkspace({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { project, session, notify, printPdf, headerActions } = useProject();
  const mountRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLElement>(null);
  const editorRef = useRef<ScriptEditor | null>(null);
  const [format, setFormat] = useState<ScreenplayFormat | null>(null);
  const [snap, setSnap] = useState<EditorSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>("scenes");
  const [preview, setPreview] = useState(false);
  const [display, setDisplayState] = useState<Display>(savedDisplay);
  const backToEditor = () => requestAnimationFrame(() => editorRef.current?.focus());
  const togglePanel = (p: Panel) => {
    const next = panel === p ? "scenes" : p;
    setPanel(next);
    if (panel === "title" && !preview) backToEditor();
  };
  const togglePreview = (on: boolean) => {
    setPreview(on);
    if (on) requestAnimationFrame(() => deskRef.current?.scrollTo({ top: 0 }));
    else if (panel !== "title") backToEditor();
  };
  const togglePreviewRef = useRef(togglePreview);
  togglePreviewRef.current = togglePreview;
  const setDisplay = (d: Display) => {
    setDisplayState(d);
    try {
      localStorage.setItem(DISPLAY_KEY, d);
    } catch {
      // Not remembered: it still applies until the project is closed.
    }
    requestAnimationFrame(() => editorRef.current?.focus());
  };
  const rowsRef = useRef<SceneRow[]>([]);
  const plugins = useMemo(
    () => [wikiPlugin(schema.marks.wikilink, () => bibleIndex)],
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const store = new SceneStore();
    let scheduler: SaveScheduler | null = null;
    (async () => {
      const [f, doc] = await Promise.all([readProjectFormat(), store.load()]);
      if (cancelled) return;
      flushSync(() => setFormat(f));
      scheduler = new SaveScheduler(
        async () => {
          const editor = editorRef.current;
          if (editor)
            await store.save(
              editor.doc,
              editor.snapshot.pagination.sceneEighths,
            );
        },
        (s) => session.setSaveState(s),
      );
      const editor = new ScriptEditor(mountRef.current!, f, doc, {
        onUpdate: (s) => {
          setSnap(s);
          session.setSnapshot(s);
        },
        onDocChange: () => {
          scheduler!.touch();
          session.docChanged();
        },
        hint: (type) => t(`hints.${type}`),
        plugins,
      });
      editorRef.current = editor;
      session.attach(editor, scheduler);
      editor.goToScene(0);
      Object.assign(window, {
        __oniric: {
          editor,
          flush: () => scheduler!.flush(),
          /** Lays the pages out in another format, without saving it (tests: export in both formats). */
          setFormat: async (id: string) => {
            const other = (await availableFormats()).find((x) => x.id === id);
            if (!other) return;
            setFormat(other);
            editor.setFormat(other);
          },
          expectedPdf: async () => ({
            ...expectedPdf(editor.snapshot.pagination, editor.currentFormat),
            titlePages: hasContent(await readTitlePage()) ? 1 : 0,
          }),
        },
      });
    })().catch((e) => notify({ text: describeError(e), tone: "error" }));
    return () => {
      cancelled = true;
      session.detach();
      scheduler?.dispose();
      editorRef.current?.destroy();
      editorRef.current = null;
      delete (window as { __oniric?: unknown }).__oniric;
    };
  }, [t, notify, session, plugins]);

  useEffect(() => {
    if (active) requestAnimationFrame(() => editorRef.current?.focus());
  }, [active]);

  // The title page, edited in the side panel and saved as it is typed.
  const [titlePage, setTitlePage] = useState<TitleDraft | null>(null);
  const titleTimer = useRef<number | undefined>(undefined);
  const titlePending = useRef<TitlePage | null>(null);
  useEffect(() => {
    void Promise.all([readTitlePageRaw(), readProfile(), titleAuto()])
      .then(([p, profile, auto]) =>
        setTitlePage({
          stored: p,
          draft: p ?? { ...emptyTitlePage(project.title, profile), include: true },
          auto,
        }),
      )
      .catch((e) => notify({ text: describeError(e), tone: "error" }));
  }, [project.title, notify]);
  const flushTitle = useCallback(async () => {
    window.clearTimeout(titleTimer.current);
    const p = titlePending.current;
    titlePending.current = null;
    if (!p) return;
    try {
      await writeTitlePage(p);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  }, [notify]);
  const editTitle = (p: TitlePage) => {
    setTitlePage((t) => t && { ...t, stored: p, draft: p });
    titlePending.current = p;
    window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => void flushTitle(), 400);
  };
  useEffect(() => () => void flushTitle(), [flushTitle]);
  useEffect(() => {
    if (panel !== "title") void flushTitle();
  }, [panel, flushTitle]);
  // The version in progress moves when a version is frozen, the date at midnight: both are read again on showing the page.
  useEffect(() => {
    if (panel !== "title" && !preview) return;
    void titleAuto().then((auto) => setTitlePage((t) => t && { ...t, auto }));
  }, [panel, preview]);

  const saveNow = useCallback(async () => {
    try {
      await session.flush();
      unwrap(await commands.projectFlush());
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  }, [notify, session]);

  /** Ctrl+P: the PDF in the current format. */
  const exportPdf = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await flushTitle();
      await exportScreenplayPdf({ session, printPdf, project });
    } finally {
      setBusy(false);
    }
  }, [busy, session, printPdf, project, flushTitle]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && preview && !e.defaultPrevented) {
        togglePreviewRef.current(false);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveNow();
      } else if (key === "p") {
        e.preventDefault();
        void exportPdf();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, saveNow, exportPdf, preview]);

  const rows = useMemo(() => {
    if (!snap) return rowsRef.current;
    const firstPage: number[] = [];
    for (const page of snap.pagination.pages) {
      for (const line of page.lines) {
        const s = snap.blocks[line.blockIndex]?.sceneIndex;
        if (s !== undefined && firstPage[s] === undefined)
          firstPage[s] = page.number;
      }
    }
    const next = snap.headings.map((heading, i) => ({
      heading,
      page: firstPage[i] ?? 1,
      eighths: snap.pagination.sceneEighths[i] ?? 0,
    }));
    if (!sameRows(next, rowsRef.current)) rowsRef.current = next;
    return rowsRef.current;
  }, [snap]);

  // Acts and sequences around the scenes, as the board arranges them.
  const story = useLive(loadStory, [...STORY_TABLES]);
  const sceneInfos = useScenes(session);
  const groups = useMemo<ListGroup[]>(() => {
    if (!story) return [];
    const outlined = storyOutline(story, sceneInfos.map((s) => s.id));
    const parts = numberedParts(outlined);
    const index = new Map(sceneInfos.map((s, i) => [s.id, i]));
    const label = (id: string) => ({ id, ...parts.get(id)! });
    return outlined.map((g) => ({
      act: g.act ? label(g.act.id) : null,
      sequences: g.sequences.map((q) => ({
        sequence: q.sequence ? label(q.sequence.id) : null,
        scenes: q.scenes.map((id) => index.get(id)).filter((i): i is number => i !== undefined),
      })),
    }));
  }, [story, sceneInfos]);

  const selectScene = useCallback(
    (i: number) => {
      if (preview) {
        // The preview has no cursor: it scrolls to the page the scene starts on.
        const page = rowsRef.current[i]?.page ?? 1;
        deskRef.current
          ?.querySelectorAll(".print-page:not(.title-page)")
          [page - 1]?.scrollIntoView({ block: "start" });
      } else editorRef.current?.goToScene(i);
    },
    [preview],
  );


  const shownTitle = titlePage && resolveTitlePage(titlePage.draft, titlePage.auto);
  const storedTitle = titlePage?.stored ? resolveTitlePage(titlePage.stored, titlePage.auto) : null;
  const printedTitle = hasContent(storedTitle) ? storedTitle : null;
  const body: "editor" | "title" | "preview" = preview ? "preview" : panel === "title" ? "title" : "editor";

  return (
    <>
      {format && <style>{formatCss(format, false)}</style>}
      <div className="workspace">
        <aside className="sidebar" aria-label={PANELS[panel]}>
          {panel === "scenes" && (
            <SceneList
              scenes={rows}
              groups={groups}
              current={snap?.sceneIndex ?? 0}
              onSelect={selectScene}
              foldKey={`oniric.script.folds.${project.id}`}
            />
          )}
          {panel === "notes" && (
            <NotesPanel
              editor={editorRef.current}
              onReveal={() => setPreview(false)}
            />
          )}
          {panel === "title" && titlePage && (
            <TitlePagePanel page={titlePage.draft} auto={titlePage.auto} onChange={editTitle} />
          )}
        </aside>

        <main
          ref={deskRef}
          className={body === "editor" ? `desk display-${display}` : "desk desk-print"}
        >
          {format && (
            <div
              ref={columnRef}
              className="fmt page-column"
              hidden={body !== "editor"}
              style={{
                width: `${format.page.width}in`,
                // Without a sheet, the text block itself is centred rather than the page.
                translate:
                  display === "bare"
                    ? `${(format.margins.right - format.margins.left) / 2}in`
                    : undefined,
              }}
            >
              <div
                ref={mountRef}
                className="mount"
                style={{
                  padding: `${format.margins.top}in ${format.margins.right}in 0 ${format.margins.left}in`,
                }}
              />
              <ElementBar
                editor={editorRef.current}
                column={columnRef}
                snap={snap}
              />
            </div>
          )}
          {format && body === "title" && titlePage && shownTitle && (
            <div className="fmt">
              {!titlePage.draft.include && (
                <p className="print-caption">
                  Pas imprimée : cochez « Imprimer la page de titre » pour
                  l'ajouter au PDF.
                </p>
              )}
              <div className={titlePage.draft.include ? undefined : "print-off"}>
                <PrintTitlePage page={shownTitle} format={format} />
              </div>
            </div>
          )}
          {format && body === "preview" && snap && (
            <div className="fmt">
              <p className="print-caption">
                Le script tel qu'il s'imprime :{" "}
                {printedTitle ? "page de titre, puis " : ""}
                {snap.pagination.pages.length} page
                {snap.pagination.pages.length > 1 ? "s" : ""}.
              </p>
              <PrintPages
                pagination={snap.pagination}
                format={format}
                titlePage={printedTitle}
              />
            </div>
          )}
        </main>
      </div>

      {active &&
        headerActions &&
        createPortal(
          <div className="header-tools">
            <Segmented
              label="Affichage"
              options={DISPLAYS}
              value={display}
              onChange={setDisplay}
              compact
              disabled={body !== "editor"}
            />
            <span className="bar-sep" aria-hidden="true" />
            <button
              type="button"
              className={panel === "notes" ? "btn on" : "btn"}
              aria-pressed={panel === "notes"}
              title="Les notes à la place des scènes"
              onClick={() => togglePanel("notes")}
            >
              <StickyNote aria-hidden="true" />
              Notes
            </button>
            <button
              type="button"
              className={panel === "title" ? "btn on" : "btn"}
              aria-pressed={panel === "title"}
              title="Éditer la page de titre, son rendu au centre"
              onClick={() => togglePanel("title")}
            >
              <FileText aria-hidden="true" />
              Page de titre
            </button>
            <button
              type="button"
              className={preview ? "btn on" : "btn"}
              aria-pressed={preview}
              title="Le script entier tel qu'il s'imprime (Échap pour revenir)"
              onClick={() => togglePreview(!preview)}
            >
              <BookOpen aria-hidden="true" />
              Aperçu
            </button>
          </div>,
          headerActions,
        )}
    </>
  );
}

interface TitleDraft {
  /** What is saved, hence printed; null until the title page is first edited. */
  stored: TitlePage | null;
  /** What the panel shows: the saved page, or one prefilled from the project and the profile. */
  draft: TitlePage;
  /** The version in progress and today's date, for the automatic fields. */
  auto: TitleAuto;
}

/** The title page fields, in the side panel; the page itself shows in the body as it will print. */
function TitlePagePanel({
  page,
  auto,
  onChange,
}: {
  page: TitlePage;
  auto: TitleAuto;
  onChange: (p: TitlePage) => void;
}) {
  const id = useId();
  const set = (patch: Partial<TitlePage>) => onChange({ ...page, ...patch });
  const field = (
    k: "title" | "subtitle" | "authors" | "basedOn" | "contact",
    label: string,
    rows = 1,
    placeholder?: string,
  ) => (
    <label className="field">
      <span>{label}</span>
      {rows > 1 ? (
        <textarea
          rows={rows}
          value={page[k]}
          placeholder={placeholder}
          onChange={(e) => set({ [k]: e.target.value })}
        />
      ) : (
        <input value={page[k]} placeholder={placeholder} onChange={(e) => set({ [k]: e.target.value })} />
      )}
    </label>
  );
  /** Version and date: filled in by the project until typed over; « Auto » brings the project's value back. */
  const autoField = (k: "version" | "date", flag: "autoVersion" | "autoDate", label: string, hint: string) => (
    <div className="field">
      <span className="field-head">
        <label htmlFor={`${id}-${k}`}>{label}</label>
        <button
          type="button"
          className="auto-chip"
          aria-pressed={page[flag]}
          title={page[flag] ? `${hint} Tapez pour écrire la vôtre.` : `Revenir à : ${auto[k]}`}
          onClick={() => set(page[flag] ? { [flag]: false, [k]: auto[k] } : { [flag]: true })}
        >
          Auto
        </button>
      </span>
      <input
        id={`${id}-${k}`}
        value={page[flag] ? auto[k] : page[k]}
        onChange={(e) => set({ [k]: e.target.value, [flag]: false })}
      />
    </div>
  );
  const custom = page.mention === "custom";
  return (
    <div className="side-form form">
      <label className="choice">
        <input
          type="checkbox"
          checked={page.include}
          onChange={(e) => set({ include: e.target.checked })}
        />
        Imprimer la page de titre au début du PDF et des exports
      </label>
      {field("title", "Titre")}
      {field("subtitle", "Sous-titre", 1, "Un genre, une accroche, un épisode…")}
      {field("authors", "Écrit par (un nom par ligne)", 2)}
      {field("basedOn", "D'après", 1, "D'après le roman de…")}
      <div className="input-row">
        {autoField("version", "autoVersion", "Version", "Suit la version en cours : celle que proposera « Figer » dans Versions.")}
        {autoField("date", "autoDate", "Date", "Suit la date du jour, à chaque impression.")}
      </div>
      {field("contact", "Contact", 5, "Nom, agent, téléphone, e-mail")}
      <label className="field">
        <span>Mentions</span>
        <select value={page.mention} onChange={(e) => set({ mention: e.target.value as MentionId })}>
          {MENTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {custom && (
        <label className="field">
          <span>Votre mention</span>
          <textarea
            rows={3}
            value={page.notes}
            placeholder="Dépôt, droits, diffusion…"
            autoFocus={!page.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
      )}
      <p className="muted small">Enregistré à mesure que vous écrivez.</p>
    </div>
  );
}

interface NoteRow {
  id: string;
  sceneId: string | null;
  quote: string;
  body: string;
  resolved: boolean;
  createdAt: string;
}

async function loadNotes(): Promise<NoteRow[]> {
  const rows = await query(
    db
      .selectFrom("note")
      .selectAll()
      .where("deleted_at", "is", null)
      .orderBy("created_at"),
  );
  return rows.map((r) => ({
    id: r.id,
    sceneId: r.scene_id,
    quote: r.quote,
    body: r.body,
    resolved: !!r.resolved,
    createdAt: r.created_at,
  }));
}

/** Margin notes anchored to a passage of the screenplay [EDT-07]. */
function NotesPanel({ editor, onReveal }: { editor: ScriptEditor | null; onReveal: () => void }) {
  const { session, notify } = useProject();
  const notes = useLive(loadNotes, ["note"]);
  const [showResolved, setShowResolved] = useState(false);
  const docVersion = useRef(0);
  const [, force] = useState(0);
  useEffect(() => {
    const stop = session.subscribeDoc(() => force(++docVersion.current));
    return () => {
      stop();
    };
  }, [session]);
  if (!notes) return <div className="notes-panel" />;
  const spans = new Map((editor?.marks("note") ?? []).map((s) => [s.id, s]));
  const order = (n: NoteRow) =>
    spans.get(n.id)?.from ?? Number.MAX_SAFE_INTEGER;
  const shown = notes
    .filter((n) => showResolved || !n.resolved)
    .sort((a, b) => order(a) - order(b));

  const add = async () => {
    const range = editor?.selectionRange();
    if (!editor || !range) {
      notify({
        text: "Placez le curseur dans le scénario, ou sélectionnez le passage à annoter.",
        tone: "warning",
      });
      return;
    }
    const id = uuidv7();
    const now = nowIso();
    try {
      await session.flush();
      await write(
        "Note",
        ["note"],
        [
          db
            .insertInto("note")
            .values({
              id,
              scene_id: range.sceneId,
              quote: range.text.slice(0, 300),
              body: "",
              created_at: now,
              updated_at: now,
            }),
        ],
      );
      editor.addMark(range.from, range.to, schema.marks.note.create({ id }));
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const update = (
    id: string,
    patch: { body?: string; resolved?: number; deleted_at?: string },
  ) =>
    write(
      "Note",
      ["note"],
      [
        db
          .updateTable("note")
          .set({ ...patch, updated_at: nowIso() })
          .where("id", "=", id),
      ],
    ).catch((e) => notify({ text: describeError(e), tone: "error" }));

  return (
    <div className="notes-panel">
      <div className="notes-head">
        <button
          type="button"
          className="btn small primary"
          onClick={() => void add()}
        >
          <Plus aria-hidden="true" />
          Note sur la sélection
        </button>
      </div>
      <label className="choice small">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
        />
        Afficher les notes résolues
      </label>
      {shown.length === 0 && (
        <p className="muted small">
          Aucune note. Sélectionnez un passage puis « + Note ».
        </p>
      )}
      <ul className="notes">
        {shown.map((n) => {
          const span = spans.get(n.id);
          return (
            <li key={n.id} className={n.resolved ? "note resolved" : "note"}>
              <button
                type="button"
                className="note-quote"
                disabled={!span}
                onClick={() => {
                  if (!span) return;
                  onReveal();
                  requestAnimationFrame(() => editor?.reveal(span.from, span.to));
                }}
                title={
                  span ? "Afficher le passage" : "Le passage a été supprimé"
                }
              >
                « {span?.text ?? n.quote} »
                {!span && <span className="badge warn">passage supprimé</span>}
              </button>
              <NoteBody
                value={n.body}
                onSave={(body) => void update(n.id, { body })}
              />
              <div className="row-actions">
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() =>
                    void update(n.id, { resolved: n.resolved ? 0 : 1 })
                  }
                >
                  {n.resolved ? "Rouvrir" : "Résolue"}
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    editor?.removeMarkById("note", n.id);
                    void update(n.id, { deleted_at: nowIso() });
                  }}
                >
                  Supprimer
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NoteBody({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      rows={2}
      value={v}
      placeholder="Votre note…"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      autoFocus={!value}
    />
  );
}
