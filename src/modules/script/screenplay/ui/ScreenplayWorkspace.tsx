import {
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { commands } from "../../../../bindings";
import { db, nowIso, query, unwrap, write } from "../../../../core/db/client";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { uuidv7 } from "../../../../core/ids";
import { useWritingPrefs } from "../../../../core/writingPrefs";
import { confirmRemoval, useChoice } from "../../../../ui-kit/Dialog";
import { MoreMenu } from "../../../../ui-kit/MoreMenu";
import { useStoredState } from "../../../../ui-kit/useStoredState";
import { PAGE_KEY, useProject } from "../../../project/ui/projectContext";
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
import { noteRoom } from "../domain/noteRoom";
import {
  contactValue,
  emptyTitlePage,
  hasContent,
  type ContactKey,
  MENTIONS,
  type MentionId,
  resolveTitlePage,
  type TitleAuto,
  type TitlePage,
} from "../domain/titlePage";
import { schema } from "./editor/schema";
import { ScriptEditor, type EditorSnapshot, type MarkSpan } from "./editor/ScriptEditor";
import { sceneGapsPlugin } from "./editor/sceneGaps";
import { notePlugin, refreshNotes, type NoteHost } from "./editor/notePlugin";
import { ElementBar } from "./ElementBar";
import { expectedPdf } from "./expectedPdf";
import { PreviewDesk } from "./PreviewDesk";
import { PrintTitlePage } from "./PrintPages";
import { ScriptLedger } from "./ScriptLedger";
import { SceneList, type ListGroup, type ListTarget, type SceneRow } from "./SceneList";
import { STORY_TABLES, deleteAct, deleteSequence, loadStory, storyOutline, updateSceneMeta } from "../../views/application/story";
import { numberedParts } from "../../views/domain/outline";
import { useScenes } from "../application/scriptSession";
import { useLock } from "../application/lock";
import { useSceneNumbers } from "../application/sceneNumbers";
import { exportScreenplayPdf } from "./screenplayExport";

import { Select } from "../../../../ui-kit/Select";
import { t } from "../../../../core/i18n";
/** How far below the top of the desk the act/sequence pin sticks once the first scene has gone up past it. */
const PIN_TOP = 28;

/** Where a scene starts for the eye: the edge of its card, or without cards the top of its heading's text. */
function sceneStart(scene: HTMLElement, cards: boolean): number {
  const top = scene.getBoundingClientRect().top;
  if (cards) return top;
  const heading = scene.firstElementChild as HTMLElement | null;
  if (!heading) return top;
  return heading.getBoundingClientRect().top + parseFloat(getComputedStyle(heading).paddingTop);
}

/** Each scene's colour from the Tableau, and the scene of the cursor outlined, by the id its node carries. */
function sceneCardCss(ids: string[], color: (id: string) => string | null, current: string | undefined): string {
  const sel = (id: string) => `.desk.display-cards .mount .scene[data-id="${id}"]`;
  const rules = ids.flatMap((id) => {
    const c = color(id);
    return c && /^#[0-9a-f]{3,8}$/i.test(c) ? [`${sel(id)} { --scene: ${c}; }`] : [];
  });
  if (current)
    rules.push(`${sel(current)} { border-color: color-mix(in srgb, var(--scene, var(--line-strong)) 70%, var(--line-strong)); }`);
  return rules.join("\n");
}

/**
 * The Scénario's pages, chosen in the side bar: the writing beside its scenes, its notes facing their passages; the
 * title page beside its fields; the whole script as it prints.
 */
type Page = "text" | "info" | "preview";
const PAGES: readonly string[] = ["text", "info", "preview"];

/** How far a scene card reaches past the text on each side, as `.desk.display-cards` draws it, in pixels. */
const CARD_PAD = 0.6 * 96;

function sameRows(a: SceneRow[], b: SceneRow[]) {
  return (
    a.length === b.length &&
    a.every(
      (r, i) =>
        r.heading === b[i].heading &&
        r.page === b[i].page &&
        r.eighths === b[i].eighths &&
        r.number === b[i].number,
    )
  );
}

/** The screenplay view: the editor, its scene list and its notes. It stays mounted while other views are shown. */
export function ScreenplayWorkspace({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { project, session, notify, printPdf } = useProject();
  const mountRef = useRef<HTMLDivElement>(null);
  const deskRef = useRef<HTMLElement>(null);
  const editorRef = useRef<ScriptEditor | null>(null);
  const [format, setFormat] = useState<ScreenplayFormat | null>(null);
  const [snap, setSnap] = useState<EditorSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [kept] = useStoredState(PAGE_KEY.script, "text");
  const page = (PAGES.includes(kept) ? kept : "text") as Page;
  const preview = page === "preview";
  const info = page === "info";
  // How the writing shows on the desk, chosen in the settings: the pagination, exports and printing stay the same.
  const display = useWritingPrefs();
  const linksRef = useRef(display.links);
  linksRef.current = display.links;
  // The notes, for the card a passage opens in the text.
  const notes = useLive(loadNotes, ["note"]);
  const [popped, setPopped] = useState<{ id: string; card: HTMLElement } | null>(null);
  const [popEditing, setPopEditing] = useState(false);
  // The note a Ctrl+click on its passage brought up in the panel; `at` tells two clicks on the same one apart.
  const [shownNote, setShownNote] = useState<{ id: string; at: number } | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  // The room left beside the text on the desk: with enough of it each note faces its passage, without it the note opens
  // in a card over the text. A desk out of sight keeps its last width.
  const [deskWidth, setDeskWidth] = useState(0);
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const measure = () => {
      const box = getComputedStyle(desk);
      if (desk.clientWidth > 0) setDeskWidth(desk.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight));
    };
    const resized = new ResizeObserver(measure);
    resized.observe(desk);
    return () => resized.disconnect();
  }, []);
  const room =
    format && page === "text" && deskWidth > 0
      ? noteRoom(deskWidth, (format.page.width - format.margins.left - format.margins.right) * 96, display.cards ? CARD_PAD : 0, display.cards ? 20 : 40)
      : null;
  /** The note just made without room beside the text: its card opens ready to be written. */
  const pendingNote = useRef<string | null>(null);
  const noteHost = useRef<NoteHost | null>(null);
  noteHost.current = {
    open: (id) => !!notes?.some((n) => n.id === id),
    floats: () => !room,
    archived: () => new Set(),
    render: (id, card) => {
      setPopEditing(!!id && id === pendingNote.current);
      pendingNote.current = null;
      setPopped(id ? { id, card } : null);
    },
    reveal: (id) => setShownNote({ id, at: Date.now() }),
  };
  const hasRoom = !!room;
  useEffect(() => {
    const view = editorRef.current?.view;
    if (view && notes) refreshNotes(view);
  }, [notes, hasRoom]);
  const rowsRef = useRef<SceneRow[]>([]);
  /** « + Nouvelle scène » between two cards: set once the story is loaded. */
  const addAfterRef = useRef<(afterId: string) => void>(() => {});
  const plugins = useMemo(
    () => [
      wikiPlugin(schema.marks.wikilink, () => bibleIndex, () => linksRef.current),
      sceneGapsPlugin((id) => addAfterRef.current(id)),
      notePlugin(schema.marks.note, schema.marks.wikilink, () => noteHost.current),
    ],
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

  // Back on the writing, the caret is back too, and in view: the desk lost its place while another page showed.
  const lastPage = useRef(page);
  useEffect(() => {
    const changed = lastPage.current !== page;
    lastPage.current = page;
    if (!active || page !== "text") return;
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      editor?.focus();
      if (changed) editor?.view.dispatch(editor.view.state.tr.scrollIntoView());
    });
  }, [active, page]);

  // The writing preferences, changed in the settings, apply at once.
  const prefs = useWritingPrefs();
  const typewriter = prefs.typewriter;
  useEffect(() => {
    editorRef.current?.refreshPrefs();
  }, [prefs, format]);
  useEffect(() => {
    editorRef.current?.setTypewriter(typewriter ? deskRef.current : null);
  }, [typewriter, format]);
  // The format chosen in the settings for this project lays the pages out anew.
  const savedFormat = useLive(readProjectFormat, ["project_setting"]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!savedFormat || !editor || JSON.stringify(savedFormat) === JSON.stringify(editor.currentFormat)) return;
    setFormat(savedFormat);
    editor.setFormat(savedFormat);
  }, [savedFormat]);

  // The title page, edited in the side panel and saved as it is typed.
  const [titlePage, setTitlePage] = useState<TitleDraft | null>(null);
  const titleTimer = useRef<number | undefined>(undefined);
  const titlePending = useRef<TitlePage | null>(null);
  useEffect(() => {
    void Promise.all([readTitlePageRaw(), titleAuto()])
      .then(([p, auto]) =>
        setTitlePage({
          stored: p,
          draft: p ?? { ...emptyTitlePage(project.title), include: true },
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
    if (!info) void flushTitle();
  }, [info, flushTitle]);
  // The version in progress moves when a version is frozen, the date at midnight: both are read again on showing the page.
  useEffect(() => {
    if (!info && !preview) return;
    void titleAuto().then((auto) => setTitlePage((t) => t && { ...t, auto }));
  }, [info, preview]);
  const sceneNumbers = useSceneNumbers();
  // The preview prints what the PDF prints: the title page saved, the numbers of a locked script.
  const printedTitle = titlePage?.stored ? resolveTitlePage(titlePage.stored, titlePage.auto) : null;

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

  // Once the script is locked, the scenes keep their numbers [REE-07].
  const locked = !!useLock();
  const rows = useMemo(() => {
    if (!snap) return rowsRef.current;
    const labels = locked ? session.scenes().map((s) => s.number) : null;
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
      number: labels?.[i],
    }));
    if (!sameRows(next, rowsRef.current)) rowsRef.current = next;
    return rowsRef.current;
  }, [snap, locked, session]);

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

  const selectScene = useCallback((i: number) => editorRef.current?.goToScene(i), []);


  // A right click in the list deletes, as the board's « ⋯ » menus do: acts and sequences leave their scenes in
  // the screenplay, a scene goes to the bin of cut scenes.
  const [choice, ask] = useChoice();
  const removeFromList = async (target: ListTarget) => {
    const name = (num: string, title: string) => <strong>{title ? `${num} · ${title}` : num}</strong>;
    const request =
      target.kind === "scene"
        ? {
            title: t("script.removeScene"),
            text: (
              <p>
                {name(t("palette.scene", { n: target.index + 1 }), rowsRef.current[target.index]?.heading ?? "")}. {t("script.removeSceneText")}
              </p>
            ),
          }
        : target.kind === "act"
          ? {
              title: t("script.removeAct"),
              text: <p>{name(target.part.num, target.part.title)}. {t("script.removeActText")}</p>,
            }
          : {
              title: t("script.removeSequence"),
              text: <p>{name(target.part.num, target.part.title)}. {t("script.removeSequenceText")}</p>,
            };
    const c = await ask({ ...request, cancel: t("common.cancel"), choices: [{ label: t("common.delete"), value: "y", danger: true }] });
    if (c !== "y") return;
    try {
      if (target.kind === "scene") {
        const id = sceneInfos[target.index]?.id;
        if (id) editorRef.current?.removeScene(id);
      } else if (target.kind === "act") await deleteAct(target.part.id);
      else await deleteSequence(target.part.id);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  // A new scene under another joins its sequence, as on the board.
  addAfterRef.current = (afterId) => {
    const editor = editorRef.current;
    if (!editor) return;
    const at = editor.indexOfScene(afterId) + 1;
    const id = editor.insertScene(at);
    editor.goToScene(at);
    void session
      .flush()
      .then(() => updateSceneMeta(id, { sequenceId: story?.meta.get(afterId)?.sequenceId ?? null, status: "todo" }))
      .catch((e) => notify({ text: describeError(e), tone: "error" }));
  };

  // The act and sequence of the scene at the top of the desk, pinned beside the text.
  const [topScene, setTopScene] = useState(0);
  /** The pin's top under the rail: level with the first scene, then held `PIN_TOP` under the top of the desk. */
  const [pinTop, setPinTop] = useState(PIN_TOP);
  const sceneCount = snap?.headings.length ?? 0;
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const cards = desk.classList.contains("display-cards");
      const scenes = mountRef.current?.querySelectorAll<HTMLElement>(":scope > .ProseMirror > .scene") ?? [];
      // The rail sticks at the top of the desk's content box, where it also starts.
      const railTop = desk.getBoundingClientRect().top + parseFloat(getComputedStyle(desk).paddingTop);
      const top = scenes[0] ? Math.max(PIN_TOP, Math.round(sceneStart(scenes[0], cards) - railTop)) : PIN_TOP;
      setPinTop(top);
      // The line is the top of the pin itself: the pin changes as the scene it names comes level with it.
      const line = railTop + top;
      let i = 0;
      for (let k = 0; k < scenes.length; k++) {
        if (sceneStart(scenes[k], cards) > line + 0.5) break;
        i = k;
      }
      setTopScene(i);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    desk.addEventListener("scroll", onScroll, { passive: true });
    // The text is laid out after the first measure (fonts, format, scenes loading): measured then, every scene
    // stood at the same height and the pin named the last one. Measure again whenever the layout settles.
    const resized = new ResizeObserver(onScroll);
    resized.observe(desk);
    const text = mountRef.current?.querySelector<HTMLElement>(":scope > .ProseMirror");
    if (text) resized.observe(text);
    return () => {
      desk.removeEventListener("scroll", onScroll);
      resized.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [display.cards, sceneCount]);
  const pin = useMemo(() => {
    for (const g of groups)
      for (const q of g.sequences)
        if (q.scenes.includes(topScene)) {
          if (!g.act && !q.sequence) return null;
          const color = story?.acts.find((a) => a.id === g.act?.id)?.color;
          return {
            act: g.act,
            sequence: q.sequence,
            color: color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : null,
            // Where the scene stands in its sequence.
            at: q.scenes.indexOf(topScene),
            count: q.scenes.length,
          };
        }
    return null;
  }, [groups, topScene, story]);

  const currentId = sceneInfos[snap?.sceneIndex ?? 0]?.id;
  const cardCss = useMemo(
    () => (story ? sceneCardCss(sceneInfos.map((s) => s.id), (id) => story.meta.get(id)?.color ?? null, currentId) : ""),
    [story, sceneInfos, currentId],
  );

  // The notes beside the text. The text only moves over for notes that are there.
  const noteSpans = page === "text" && notes?.length ? (editorRef.current?.marks("note") ?? []).filter((s) => notes.some((n) => n.id === s.id)) : [];
  const sceneIds = noteSpans.length ? (editorRef.current?.sceneIds() ?? []) : [];
  const margin = !!room && noteSpans.length > 0;
  const shift = margin ? room.shift : 0;
  // What the act and sequence pin has left of the column on the left; too little, and it gives way to the notes.
  const pinRoom = format ? (deskWidth - format.page.width * 96) / 2 + ((format.margins.left + format.margins.right) / 2 - 0.6) * 96 - 38 - shift : 0;

  /** A note on the passage selected, or the caret's line: it opens ready to be written, beside the text or over it. */
  const addNote = async () => {
    const editor = editorRef.current;
    const range = editor?.selectionRange();
    if (!editor || !range) {
      notify({ text: t("script.notes.placeCursor"), tone: "warning" });
      return;
    }
    const id = uuidv7();
    const now = nowIso();
    // Before the mark: its card may open as soon as the mark is there.
    if (!room) pendingNote.current = id;
    try {
      await session.flush();
      await write("Note", ["note"], [
        db.insertInto("note").values({ id, scene_id: range.sceneId, quote: range.text.slice(0, 300), body: "", created_at: now, updated_at: now }),
      ]);
      editor.addMark(range.from, range.to, schema.marks.note.create({ id }));
      if (room) setEditingNote(id);
      else editor.caretAt(range.to);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  return (
    <>
      {format && <style>{formatCss(format, false)}</style>}
      {display.cards && story && <style>{cardCss}</style>}
      {choice}
      <div className={preview ? "workspace wide" : "workspace"}>
        {!preview && (
          <aside className="sidebar" aria-label={t("script.panel")}>
            <div className="sidebar-body">
              {page === "text" && (
                <SceneList
                  scenes={rows}
                  groups={groups}
                  current={snap?.sceneIndex ?? 0}
                  onSelect={selectScene}
                  foldKey={`oniric.script.folds.${project.id}`}
                  onRemove={(target) => void removeFromList(target)}
                />
              )}
              {info && titlePage && (
                <TitlePagePanel page={titlePage.draft} onChange={editTitle} />
              )}
            </div>
          </aside>
        )}

        {preview && format && snap && (
          <PreviewDesk
            active={active}
            pagination={snap.pagination}
            format={format}
            titlePage={printedTitle && hasContent(printedTitle) ? printedTitle : null}
            blocks={snap.blocks}
            sceneNumbers={locked && sceneNumbers === "none" ? "both" : sceneNumbers}
            labels={locked ? session.scenes().map((s) => s.number) : undefined}
          />
        )}

        {info && format && titlePage && <TitleSheet page={resolveTitlePage(titlePage.draft, titlePage.auto)} format={format} />}

        {/* Hidden, not taken down, on the pages without it: the editor holds the text and its caret. */}
        <main
          ref={deskRef}
          hidden={preview || info}
          className={`desk sheetless ${display.cards ? "display-cards" : "display-bare"}${display.links ? "" : " links-off"}${margin ? " with-notes" : ""}${shift > 0 && pinRoom < 66 ? " notes-tight" : ""}`}
        >
          {/* Beside the text, in the margin left of it. */}
          {format && (
            <div
              className="story-pin-rail"
              style={{
                width: `${format.page.width}in`,
                translate: `calc(${(format.margins.right - format.margins.left) / 2}in - ${shift}px)`,
              }}
            >
              <div
                className="story-pin"
                style={
                  {
                    top: pinTop,
                    right: `calc(100% - ${format.margins.left - 0.6}in + 22px)`,
                    // As wide as the room left of the cards, up to 180px.
                    maxWidth: `min(180px, calc((100cqw - ${format.page.width}in) / 2 + ${(format.margins.left + format.margins.right) / 2 - 0.6}in - 38px - ${shift}px))`,
                    "--act": pin?.color ?? undefined,
                  } as CSSProperties
                }
              >
                {display.pin && pin && (
                  <span key={`${pin.act?.id}:${pin.sequence?.id}`} className="story-pin-thread" aria-hidden="true">
                    {pin.act && (
                      <span className="story-pin-part story-pin-act">
                        <span className="story-pin-num">{pin.act.num}</span>
                        {pin.act.title && <span className="story-pin-title">{pin.act.title}</span>}
                      </span>
                    )}
                    {pin.sequence && (
                      <span className="story-pin-part story-pin-seq">
                        <span className="story-pin-num">{pin.sequence.num}</span>
                        {pin.sequence.title && <span className="story-pin-title">{pin.sequence.title}</span>}
                        <span className="story-pin-steps">
                          <span className="story-pin-count">
                            {t("script.pinCount", { n: pin.at + 1, total: pin.count })}
                          </span>
                          {pin.count <= 16 && pin.count > 1 && (
                            <span className="story-pin-dots">
                              {Array.from({ length: pin.count }, (_, i) => (
                                <span key={i} className={i < pin.at ? "past" : i === pin.at ? "now" : undefined} />
                              ))}
                            </span>
                          )}
                        </span>
                      </span>
                    )}
                  </span>
                )}
                <ScriptLedger session={session} />
              </div>
            </div>
          )}
          {format && (
            <div
              className="fmt page-column"
              style={{
                width: `${format.page.width}in`,
                // Without a sheet, the text block itself is centred rather than the page.
                translate: `calc(${(format.margins.right - format.margins.left) / 2}in - ${shift}px)`,
                ...({
                  "--text-w": `${format.page.width - format.margins.left - format.margins.right}in`,
                  "--text-left": `${format.margins.left}in`,
                  "--card-pad": display.cards ? `${CARD_PAD}px` : "0px",
                  "--note-gap": display.cards ? "20px" : "40px",
                  "--note-w": `${room?.width ?? 0}px`,
                } as CSSProperties),
              }}
            >
              <div
                ref={mountRef}
                className="mount"
                style={{
                  padding: `${format.margins.top}in ${format.margins.right}in 0 ${format.margins.left}in`,
                  // Room under the last line, so that it too can stand in the middle of the desk.
                  paddingBottom: typewriter ? "45vh" : undefined,
                }}
              />
              {page === "text" && notes && notes.length > 0 && (
                <NotesMargin
                  editor={editorRef.current}
                  notes={notes}
                  spans={noteSpans}
                  sceneIds={sceneIds}
                  margin={!!room}
                  shown={shownNote}
                  editing={editingNote}
                  onEditing={setEditingNote}
                />
              )}
            </div>
          )}
        </main>
        {/* The kinds of element, fixed at the bottom of the desk while writing. */}
        {format && page === "text" && <ElementBar editor={editorRef.current} snap={snap} onNote={() => void addNote()} />}
      </div>

      {/* The card of the note under the caret or the pointer, drawn where the editor placed it. */}
      {popped &&
        (() => {
          const n = notes?.find((x) => x.id === popped.id);
          const editor = editorRef.current;
          if (!n) return null;
          return createPortal(
            <NoteCard
              key={n.id}
              note={n}
              span={editor?.marks("note").find((s) => s.id === n.id) ?? null}
              editor={editor}
              editing={popEditing}
              onEditing={(on) => {
                setPopEditing(on);
                // Written, the note gives the caret back to the text, unless the focus went elsewhere.
                if (!on)
                  requestAnimationFrame(() => {
                    if (!document.activeElement || document.activeElement === document.body) editor?.focus();
                  });
              }}
              inText
            />,
            popped.card,
          );
        })()}

    </>
  );
}

/** The title page alone, on the desk, the whole sheet in view however small the window. */
function TitleSheet({ page, format }: { page: TitlePage; format: ScreenplayFormat }) {
  const deskRef = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  const { width, height } = format.page;
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const fit = () => {
      const box = getComputedStyle(desk);
      const room = (size: number, a: string, b: string) => (size - parseFloat(a) - parseFloat(b)) / 96;
      setZoom(Math.min(1, room(desk.clientWidth, box.paddingLeft, box.paddingRight) / width, room(desk.clientHeight, box.paddingTop, box.paddingBottom) / height));
    };
    const resized = new ResizeObserver(fit);
    resized.observe(desk);
    return () => resized.disconnect();
  }, [width, height]);
  return (
    <main ref={deskRef} className="desk desk-print desk-title">
      <div className="fmt" style={{ zoom }}>
        <PrintTitlePage page={page} format={format} />
      </div>
    </main>
  );
}

interface TitleDraft {
  /** What is saved, hence printed; null until the title page is first edited. */
  stored: TitlePage | null;
  /** What the panel shows: the saved page, or one prefilled from the project. */
  draft: TitlePage;
  /** The version in progress and today's date, for the automatic fields. */
  auto: TitleAuto;
}

/** The contact fields of the panel, in the order they print. */
const CONTACT_FIELDS: { key: ContactKey; type?: string; rows?: number }[] = [
  { key: "name" },
  { key: "address", rows: 2 },
  { key: "phone", type: "tel" },
  { key: "email", type: "email" },
  { key: "agent", rows: 2 },
];

function TitlePagePanel({ page, onChange }: { page: TitlePage; onChange: (p: TitlePage) => void }) {
  const { ask } = useProject();
  const setContact = (k: ContactKey, value: string) => set({ contactFields: { ...page.contactFields, [k]: value } });
  const set = (patch: Partial<TitlePage>) => onChange({ ...page, ...patch });
  const [added, setAdded] = useState(-1);
  const names = page.authors.split("\n");
  const setNames = (n: string[]) => set({ authors: n.join("\n") });
  const field = (
    k: "title" | "subtitle" | "basedOn",
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
          autoComplete="off"
          onChange={(e) => set({ [k]: e.target.value })}
        />
      ) : (
        <input value={page[k]} placeholder={placeholder} autoComplete="off" onChange={(e) => set({ [k]: e.target.value })} />
      )}
    </label>
  );
  const custom = page.mention === "custom";
  return (
    <div className="side-form form">
      {field("title", t("script.info.title"))}
      {field("subtitle", t("script.info.subtitle"), 1, t("script.info.subtitlePlaceholder"))}
      <fieldset className="field">
        <legend>{t("settings.writtenBy")}</legend>
        <div className="name-list">
          {names.map((n, i) => (
            <div key={i} className="name-row">
              <input
                value={n}
                aria-label={t("script.info.author", { n: i + 1 })}
                placeholder={t("script.contact.namePlaceholder")}
                autoComplete="off"
                autoFocus={i === added}
                onChange={(e) => setNames(names.map((m, j) => (j === i ? e.target.value : m)))}
              />
              {names.length > 1 && (
                <button
                  type="button"
                  className="btn ghost small icon-only"
                  aria-label={n.trim() ? t("script.info.removeName", { name: n.trim() }) : t("script.info.removeAuthor", { n: i + 1 })}
                  title={t("script.info.remove")}
                  onClick={async () => {
                    if (n.trim() && !(await confirmRemoval(ask, { title: t("script.info.removeAsk", { name: n.trim() }), text: t("script.info.removeText"), label: t("script.info.remove") }))) return;
                    setNames(names.filter((_m, j) => j !== i));
                  }}
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
          {t("script.info.more")}
        </button>
      </fieldset>
      {field("basedOn", t("script.info.basedOn"), 1, t("script.info.basedOnPlaceholder"))}
      <fieldset className="field contact-fields">
        <legend>{t("script.info.contact")}</legend>
        {CONTACT_FIELDS.map((f) => {
          const id = `title-contact-${f.key}`;
          const value = contactValue(page, null, f.key);
          return (
            <div key={f.key} className="contact-field">
              <div className="contact-field-head">
                <label htmlFor={id}>{t(`script.contact.${f.key}`)}</label>
              </div>
              {f.rows ? (
                <textarea id={id} rows={f.rows} value={value} placeholder={t(`script.contact.${f.key}Placeholder`)} autoComplete="off" onChange={(e) => setContact(f.key, e.target.value)} />
              ) : (
                <input id={id} type={f.type ?? "text"} value={value} placeholder={t(`script.contact.${f.key}Placeholder`)} spellCheck={false} autoComplete="off" onChange={(e) => setContact(f.key, e.target.value)} />
              )}
            </div>
          );
        })}
        <div className="contact-field">
          <label htmlFor="title-contact-more">{t("script.info.otherLines")}</label>
          <textarea
            id="title-contact-more"
            rows={2}
            value={page.contact}
            autoComplete="off"
            placeholder={t("script.info.otherLinesPlaceholder")}
            onChange={(e) => set({ contact: e.target.value })}
          />
        </div>
      </fieldset>
      <label className="field">
        <span>{t("script.info.mentions")}</span>
        <Select value={page.mention} onChange={(e) => set({ mention: e.target.value as MentionId })}>
          {MENTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {t(`titlePage.mentions.${m.id}`)}
            </option>
          ))}
        </Select>
      </label>
      {custom && (
        <label className="field">
          <span>{t("script.info.yourMention")}</span>
          <textarea
            rows={3}
            value={page.notes}
            placeholder={t("script.info.yourMentionPlaceholder")}
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

/**
 * The notes beside the text [EDT-07]: each stands level with its passage, in a column that scrolls with the text. Notes
 * too close for that follow one another, and a scene whose notes run past its end grows to hold them. Without room
 * beside the text (`margin` false) only the notes whose passage is gone show, under it.
 */
function NotesMargin({
  editor,
  notes,
  spans,
  sceneIds,
  margin,
  shown,
  editing,
  onEditing,
}: {
  editor: ScriptEditor | null;
  notes: NoteRow[];
  spans: MarkSpan[];
  sceneIds: string[];
  margin: boolean;
  shown: { id: string; at: number } | null;
  editing: string | null;
  onEditing: (id: string | null) => void;
}) {
  const rootRef = useRef<HTMLUListElement>(null);
  const tallRef = useRef<HTMLStyleElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const spanOf = new Map(spans.map((s) => [s.id, s]));
  const scenes = margin ? sceneIds.filter((id) => spans.some((s) => s.sceneId === id)) : [];
  const noteIn = (sceneId: string) =>
    notes
      .filter((n) => spanOf.get(n.id)?.sceneId === sceneId)
      .sort((a, b) => spanOf.get(a.id)!.from - spanOf.get(b.id)!.from);
  const orphans = notes.filter((n) => !spanOf.has(n.id));

  const place = () => {
    const root = rootRef.current;
    const column = root?.closest<HTMLElement>(".page-column");
    const desk = column?.closest<HTMLElement>(".desk");
    const tallStyle = tallRef.current;
    if (!root || !column || !desk || !tallStyle || !editor || !desk.offsetWidth) return;
    // Read from the layout as it stands, nothing undone first: the desk must not lose its place, nor an open menu close.
    const origin = column.getBoundingClientRect().top;
    const tall: string[] = [];
    let moved = 0;
    let bottom = -Infinity;
    for (const id of scenes) {
      const scene = column.querySelector<HTMLElement>(`.mount .scene[data-id="${id}"]`);
      if (!scene?.lastElementChild) continue;
      for (const n of noteIn(id)) {
        const card = root.querySelector<HTMLElement>(`[data-note="${CSS.escape(n.id)}"]`);
        if (!card) continue;
        const top = Math.max(editor.view.coordsAtPos(spanOf.get(n.id)!.from).top - origin + moved, bottom + 8);
        card.style.top = `${top}px`;
        bottom = top + card.offsetHeight;
      }
      const box = scene.getBoundingClientRect();
      const css = getComputedStyle(scene);
      const own = scene.lastElementChild.getBoundingClientRect().bottom - box.top + parseFloat(css.paddingBottom) + parseFloat(css.borderBottomWidth);
      const start = box.top - origin + moved;
      const height = Math.max(own, Math.ceil(bottom - start));
      if (height > own) tall.push(`.desk.with-notes .mount .scene[data-id="${id}"] { min-height: ${height}px; }`);
      moved += height - box.height;
    }
    const rules = tall.join("\n");
    if (tallStyle.textContent !== rules) tallStyle.textContent = rules;
  };
  const placeRef = useRef(place);
  placeRef.current = place;
  useLayoutEffect(place);
  useEffect(() => {
    const column = rootRef.current?.closest<HTMLElement>(".page-column");
    const text = column?.querySelector<HTMLElement>(".ProseMirror");
    const desk = column?.closest<HTMLElement>(".desk");
    if (!text || !desk) return;
    const resized = new ResizeObserver(() => placeRef.current());
    resized.observe(text);
    resized.observe(desk);
    return () => resized.disconnect();
  }, []);

  // The note asked for from the text: brought into view, and lit for a moment.
  useEffect(() => {
    if (!shown) return;
    const card = rootRef.current?.querySelector<HTMLElement>(`[data-note="${CSS.escape(shown.id)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setFlash(shown.id);
    const timer = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(timer);
  }, [shown, spans.length]);

  const head = editor?.view.state.selection.head ?? -1;
  const card = (n: NoteRow) => {
    const span = spanOf.get(n.id) ?? null;
    return (
      <NoteCard
        key={n.id}
        note={n}
        span={span}
        editor={editor}
        editing={editing === n.id}
        onEditing={(on) => onEditing(on ? n.id : null)}
        flash={flash === n.id}
        here={!!span && span.from <= head && head <= span.to}
      />
    );
  };

  return (
    <>
      <style ref={tallRef} />
      <ul className="note-margin" ref={rootRef}>
        {scenes.flatMap((id) => noteIn(id).map(card))}
      </ul>
      {orphans.length > 0 && (
        <section className="notes-orphans" aria-label={t("script.notes.orphans")}>
          <h2>{t("script.notes.orphans")}</h2>
          <ul className="notes">{orphans.map(card)}</ul>
        </section>
      )}
    </>
  );
}

/**
 * A note's card, the same beside the text and over it: the passage quoted, the « ⋯ » menu, the note.
 * Over the text (`inText`) the passage is right under it: it is quoted, not a way to reach it.
 */
function NoteCard({
  note: n,
  span,
  editor,
  editing,
  onEditing,
  inText = false,
  flash = false,
  here = false,
}: {
  note: NoteRow;
  span: { from: number; to: number; text: string } | null;
  editor: ScriptEditor | null;
  editing: boolean;
  onEditing: (on: boolean) => void;
  inText?: boolean;
  flash?: boolean;
  /** The caret is in its passage. */
  here?: boolean;
}) {
  const { notify, ask } = useProject();
  const Tag = inText ? "div" : "li";
  const update = (patch: { body?: string; deleted_at?: string }) =>
    write("Note", ["note"], [db.updateTable("note").set({ ...patch, updated_at: nowIso() }).where("id", "=", n.id)]).catch((e) =>
      notify({ text: describeError(e), tone: "error" }),
    );
  const quote = t("dash.quote", { quote: span?.text ?? n.quote });
  return (
    <Tag className={["note", flash && "flash", here && "here"].filter(Boolean).join(" ")} data-note={inText ? undefined : n.id}>
      <div className="note-top">
        {inText ? (
          <p className="note-quote">{quote}</p>
        ) : (
          <button
            type="button"
            className="note-quote"
            disabled={!span}
            onClick={() => span && editor?.reveal(span.from, span.to)}
            title={span ? t("script.notes.show") : t("script.notes.gone")}
          >
            {quote}
            {!span && <span className="badge warn">{t("script.notes.goneBadge")}</span>}
          </button>
        )}
        <MoreMenu
          label={t("script.notes.actions")}
          items={[
            { label: t("script.notes.edit"), icon: Pencil, onClick: () => onEditing(true) },
            {
              label: t("script.notes.delete"),
              icon: Trash2,
              danger: true,
              onClick: async () => {
                if (!(await confirmRemoval(ask, { title: t("script.notes.deleteAsk"), text: t("script.notes.deleteText") }))) return;
                editor?.removeMarkById("note", n.id);
                void update({ deleted_at: nowIso() });
              },
            },
          ]}
        />
      </div>
      {editing ? (
        <NoteBody
          value={n.body}
          onDone={(body) => {
            onEditing(false);
            if (body !== n.body) void update({ body });
          }}
        />
      ) : n.body.trim() ? (
        <p className="note-body">{n.body}</p>
      ) : (
        <p className="note-body muted">{t("script.notes.empty")}</p>
      )}
    </Tag>
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
      aria-label={t("script.notes.note")}
      placeholder={t("script.notes.placeholder")}
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
