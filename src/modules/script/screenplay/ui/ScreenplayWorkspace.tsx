import { Download, FileText, Plus, StickyNote } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { commands } from "../../../../bindings";
import { db, nowIso, query, unwrap, write } from "../../../../core/db/client";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { uuidv7 } from "../../../../core/ids";
import { Dialog } from "../../../../ui-kit/Dialog";
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
  writeTitlePage,
} from "../application/titlePageSettings";
import { formatCss, type ScreenplayFormat } from "../domain/formats";
import {
  emptyTitlePage,
  hasContent,
  type TitlePage,
} from "../domain/titlePage";
import { schema } from "./editor/schema";
import { ScriptEditor, type EditorSnapshot } from "./editor/ScriptEditor";
import { ElementBar } from "./ElementBar";
import { expectedPdf } from "./expectedPdf";
import { SceneList, type SceneRow } from "./SceneList";
import { exportScreenplayPdf } from "./screenplayExport";

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
  const { project, session, notify, printPdf, headerActions, transfer } = useProject();
  const mountRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ScriptEditor | null>(null);
  const [format, setFormat] = useState<ScreenplayFormat | null>(null);
  const [snap, setSnap] = useState<EditorSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"title" | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
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
      await exportScreenplayPdf({ session, printPdf, project });
    } finally {
      setBusy(false);
    }
  }, [busy, session, printPdf, project]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
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
  }, [active, saveNow, exportPdf]);

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

  const selectScene = useCallback(
    (i: number) => editorRef.current?.goToScene(i),
    [],
  );

  return (
    <>
      {format && <style>{formatCss(format, false)}</style>}
      <div className={notesOpen ? "workspace with-notes" : "workspace"}>
        <aside className="sidebar">
          <SceneList
            scenes={rows}
            current={snap?.sceneIndex ?? 0}
            onSelect={selectScene}
          />
        </aside>

        <main className="desk">
          {format && (
            <div
              ref={columnRef}
              className="fmt page-column"
              style={{ width: `${format.page.width}in` }}
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
        </main>

        {notesOpen && <NotesPanel editor={editorRef.current} />}
      </div>

      {active &&
        headerActions &&
        createPortal(
          <div className="actions script-actions">
            <button
              type="button"
              className={notesOpen ? "btn on" : "btn"}
              aria-pressed={notesOpen}
              onClick={() => setNotesOpen((o) => !o)}
            >
              <StickyNote aria-hidden="true" />
              Notes
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setDialog("title")}
            >
              <FileText aria-hidden="true" />
              Page de titre
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => transfer("export", "script")}
              disabled={busy}
              title="Exporter en PDF, Fountain ou FDX"
            >
              <Download aria-hidden="true" />
              {busy ? t("workspace.exporting") : "Exporter"}
            </button>
          </div>,
          headerActions,
        )}
      {dialog === "title" && (
        <TitlePageDialog
          title={project.title}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function TitlePageDialog({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const { notify } = useProject();
  const [page, setPage] = useState<TitlePage | null>(null);
  useEffect(() => {
    void Promise.all([readTitlePage(), readProfile()]).then(([p, profile]) =>
      setPage(p ?? { ...emptyTitlePage(title, profile), include: true }),
    );
  }, [title]);
  if (!page) return null;
  const set = (patch: Partial<TitlePage>) => setPage({ ...page, ...patch });
  const save = async () => {
    try {
      await writeTitlePage(page);
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  const field = (
    k: keyof Omit<TitlePage, "include">,
    label: string,
    rows = 1,
  ) => (
    <label className="field">
      <span>{label}</span>
      {rows > 1 ? (
        <textarea
          rows={rows}
          value={page[k]}
          onChange={(e) => set({ [k]: e.target.value })}
        />
      ) : (
        <input value={page[k]} onChange={(e) => set({ [k]: e.target.value })} />
      )}
    </label>
  );
  return (
    <Dialog
      title="Page de titre"
      wide
      onCancel={onClose}
      actions={[
        { label: "Annuler", onClick: onClose },
        { label: "Enregistrer", primary: true, onClick: () => void save() },
      ]}
    >
      <div className="form">
        <label className="choice">
          <input
            type="checkbox"
            checked={page.include}
            onChange={(e) => set({ include: e.target.checked })}
          />
          Imprimer la page de titre au début du PDF et des exports
        </label>
        {field("title", "Titre")}
        {field("authors", "Écrit par (un nom par ligne)", 2)}
        {field("basedOn", "D'après")}
        <div className="input-row">
          {field("version", "Version")}
          {field("date", "Date")}
        </div>
        {field("contact", "Contact", 3)}
        {field("notes", "Mentions (dépôt SACD, droits…)", 2)}
      </div>
    </Dialog>
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
  const [showResolved, setShowResolved] = useState(false);
  const docVersion = useRef(0);
  const [, force] = useState(0);
  useEffect(() => {
    const stop = session.subscribeDoc(() => force(++docVersion.current));
    return () => {
      stop();
    };
  }, [session]);
  if (!notes) return <aside className="notes-panel" />;
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
    <aside className="notes-panel" aria-label="Notes">
      <div className="notes-head">
        <h2>Notes</h2>
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
                onClick={() => span && editor?.reveal(span.from, span.to)}
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
    </aside>
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
