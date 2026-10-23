import {
  Archive,
  ArchiveRestore,
  BookOpen,
  FileText,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { commands } from "../../../../bindings";
import { db, nowIso, query, unwrap, write } from "../../../../core/db/client";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { uuidv7 } from "../../../../core/ids";
import { MoreMenu } from "../../../../ui-kit/MoreMenu";
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

/**
 * One view at a time: writing with the scenes beside it, writing with the notes, the title page (its fields beside,
 * the page as it prints in the body), or the whole script as it prints with the scenes beside it.
 */
type Mode = "write" | "notes" | "title" | "preview";
type Panel = "scenes" | "notes" | "title";
/** Tabs over the writing: pressed again, a tab goes back to it. */
const VIEWS: SegmentedOption<Exclude<Mode, "write">>[] = [
  { id: "notes", label: "Notes", hint: "Les notes à la place des scènes", icon: StickyNote },
  { id: "title", label: "Page de titre", hint: "Éditer la page de titre, son rendu au centre", icon: FileText },
  { id: "preview", label: "Aperçu", hint: "Le script entier tel qu'il s'imprime (Échap pour revenir)", icon: BookOpen },
];
const PANELS: Record<Panel, string> = { scenes: "Scènes", notes: "Notes", title: "Page de titre" };

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
  const [mode, setMode] = useState<Mode>("write");
  const panel: Panel = mode === "notes" ? "notes" : mode === "title" ? "title" : "scenes";
  const preview = mode === "preview";
  /** A view's button opens it in place of the one shown; pressed again, it goes back to writing. */
  const toggleMode = (m: Mode) => {
    const next = mode === m ? "write" : m;
    setMode(next);
    if (next === "write" || next === "notes") requestAnimationFrame(() => editorRef.current?.focus());
    else requestAnimationFrame(() => deskRef.current?.scrollTo({ top: 0 }));
  };
  const toggleModeRef = useRef(toggleMode);
  toggleModeRef.current = toggleMode;
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
        toggleModeRef.current("preview");
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
  const body: "editor" | "title" | "preview" = preview ? "preview" : mode === "title" ? "title" : "editor";

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
            <NotesPanel editor={editorRef.current} />
          )}
          {panel === "title" && titlePage && (
            <TitlePagePanel page={titlePage.draft} onChange={editTitle} />
          )}
        </aside>

        <main
          ref={deskRef}
          className={body === "editor" ? "desk display-bare" : "desk desk-print"}
        >
          {format && (
            <div
              ref={columnRef}
              className="fmt page-column"
              hidden={body !== "editor"}
              style={{
                width: `${format.page.width}in`,
                // Without a sheet, the text block itself is centred rather than the page.
                translate: `${(format.margins.right - format.margins.left) / 2}in`,
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
              <PrintTitlePage page={shownTitle} format={format} />
            </div>
          )}
          {format && body === "preview" && snap && (
            <div className="fmt">
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
              label="Vue"
              options={VIEWS}
              value={mode === "write" ? null : mode}
              onChange={toggleMode}
              compact
            />
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
  onChange,
}: {
  page: TitlePage;
  onChange: (p: TitlePage) => void;
}) {
  const set = (patch: Partial<TitlePage>) => onChange({ ...page, ...patch });
  const [added, setAdded] = useState(-1);
  const names = page.authors.split("\n");
  const setNames = (n: string[]) => set({ authors: n.join("\n") });
  const field = (
    k: "title" | "subtitle" | "basedOn" | "contact",
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
  const custom = page.mention === "custom";
  return (
    <div className="side-form form">
      {field("title", "Titre")}
      {field("subtitle", "Sous-titre", 1, "Un genre, une accroche, un épisode…")}
      <fieldset className="field">
        <legend>Écrit par</legend>
        <div className="name-list">
          {names.map((n, i) => (
            <div key={i} className="name-row">
              <input
                value={n}
                aria-label={`Auteur ${i + 1}`}
                placeholder="Prénom Nom"
                autoFocus={i === added}
                onChange={(e) => setNames(names.map((m, j) => (j === i ? e.target.value : m)))}
              />
              {names.length > 1 && (
                <button
                  type="button"
                  className="btn ghost small icon-only"
                  aria-label={`Retirer ${n.trim() || `l'auteur ${i + 1}`}`}
                  title="Retirer"
                  onClick={() => setNames(names.filter((_m, j) => j !== i))}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn ghost small name-add"
          onClick={() => {
            setAdded(names.length);
            setNames([...names, ""]);
          }}
        >
          <Plus aria-hidden="true" />
          Plus
        </button>
      </fieldset>
      {field("basedOn", "D'après", 1, "D'après le roman de…")}
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
function NotesPanel({ editor }: { editor: ScriptEditor | null }) {
  const { session, notify } = useProject();
  const notes = useLive(loadNotes, ["note"]);
  const [archives, setArchives] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
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
  // `resolved` holds « archivée »: the note leaves the list, its passage stays marked.
  const archivedCount = notes.filter((n) => n.resolved).length;
  const showArchives = archives && archivedCount > 0;
  const shown = notes
    .filter((n) => n.resolved === showArchives)
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
      setArchives(false);
      setEditing(id);
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
          Créer une note
        </button>
        {archivedCount > 0 && (
          <button
            type="button"
            className={showArchives ? "btn small on" : "btn small"}
            aria-pressed={showArchives}
            onClick={() => setArchives(!showArchives)}
          >
            <Archive aria-hidden="true" />
            Archivées
            <span className="btn-count">{archivedCount}</span>
          </button>
        )}
      </div>
      {shown.length === 0 && (
        <p className="muted small">
          Aucune note. Sélectionnez un passage puis « Créer une note ».
        </p>
      )}
      <ul className="notes">
        {shown.map((n) => {
          const span = spans.get(n.id);
          const isEditing = editing === n.id;
          return (
            <li key={n.id} className={n.resolved ? "note resolved" : "note"}>
              <div className="note-top">
                <button
                  type="button"
                  className="note-quote"
                  disabled={!span}
                  onClick={() => span && editor?.reveal(span.from, span.to)}
                  title={
                    span ? "Afficher le passage" : "Le passage a été supprimé"
                  }
                >
                  « {span?.text ?? n.quote} »
                  {!span && (
                    <span className="badge warn">passage supprimé</span>
                  )}
                </button>
                <MoreMenu
                  label="Actions sur la note"
                  items={[
                    {
                      label: "Modifier",
                      icon: Pencil,
                      onClick: () => setEditing(n.id),
                    },
                    n.resolved
                      ? {
                          label: "Désarchiver",
                          icon: ArchiveRestore,
                          onClick: () => {
                            if (archivedCount === 1) setArchives(false);
                            void update(n.id, { resolved: 0 });
                          },
                        }
                      : {
                          label: "Archiver",
                          icon: Archive,
                          hint: "Retire la note de la liste sans l'effacer. Pour la revoir : « Archivées ».",
                          onClick: () => void update(n.id, { resolved: 1 }),
                        },
                    {
                      label: "Supprimer",
                      icon: Trash2,
                      danger: true,
                      onClick: () => {
                        editor?.removeMarkById("note", n.id);
                        void update(n.id, { deleted_at: nowIso() });
                      },
                    },
                  ]}
                />
              </div>
              {isEditing ? (
                <NoteBody
                  value={n.body}
                  onDone={(body) => {
                    setEditing(null);
                    if (body !== n.body) void update(n.id, { body });
                  }}
                />
              ) : n.body.trim() ? (
                <p className="note-body">{n.body}</p>
              ) : (
                <p className="note-body muted">Note vide</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The note being edited: saved on leaving the field or Ctrl + Entrée, Échap drops the change. */
function NoteBody({
  value,
  onDone,
}: {
  value: string;
  onDone: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  // Leaving the field after Échap or Ctrl + Entrée must not save a second time.
  const closed = useRef(false);
  const done = (body: string) => {
    if (closed.current) return;
    closed.current = true;
    onDone(body);
  };
  return (
    <textarea
      rows={3}
      value={v}
      aria-label="Note"
      placeholder="Votre note…"
      autoFocus
      onFocus={(e) => e.currentTarget.setSelectionRange(v.length, v.length)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(v)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          done(value);
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          done(v);
        }
      }}
    />
  );
}
