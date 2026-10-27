import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  BookOpen,
  Eye,
  FileText,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { commands } from "../../../../bindings";
import { db, nowIso, query, unwrap, write } from "../../../../core/db/client";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { uuidv7 } from "../../../../core/ids";
import { confirmRemoval, useChoice } from "../../../../ui-kit/Dialog";
import { CheckMenu } from "../../../../ui-kit/CheckMenu";
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
import { sceneGapsPlugin } from "./editor/sceneGaps";
import { ElementBar } from "./ElementBar";
import { expectedPdf } from "./expectedPdf";
import { PrintPages } from "./PrintPages";
import { SceneList, type ListGroup, type ListTarget, type SceneRow } from "./SceneList";
import { STORY_TABLES, deleteAct, deleteSequence, loadStory, storyOutline, updateSceneMeta } from "../../views/application/story";
import { numberedParts } from "../../views/domain/outline";
import { useScenes } from "../application/scriptSession";
import { exportScreenplayPdf } from "./screenplayExport";

import { Select } from "../../../../ui-kit/Select";
/**
 * How the writing shows on screen, on a white desk: each scene framed in a card or not, the bible links coloured and
 * clickable or not, the act and sequence pinned beside the text or not. The pagination, exports and printing stay
 * the same.
 */
type Display = { cards: boolean; links: boolean; pin: boolean };
const DISPLAY_KEY = "oniric.script.display";
const LINKS_KEY = "oniric.script.links";
const PIN_KEY = "oniric.script.pin";

function savedDisplay(): Display {
  try {
    return {
      cards: localStorage.getItem(DISPLAY_KEY) === "cards",
      links: localStorage.getItem(LINKS_KEY) !== "off",
      pin: localStorage.getItem(PIN_KEY) !== "off",
    };
  } catch {
    // Storage unavailable: the default display.
    return { cards: false, links: true, pin: true };
  }
}

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
 * Two choices that do not depend on each other: what the side panel shows (the scenes, the notes or the script's
 * information) and what the desk shows (the writing, or the whole script as it prints with « Aperçu »). The notes
 * annotate the text, so they leave the preview; the information can be filled in with the preview beside it.
 */
type Panel = "scenes" | "notes" | "info";
/** Tabs over the scenes: pressed again, a tab brings the scenes back. */
const PANEL_TABS: SegmentedOption<Exclude<Panel, "scenes">>[] = [
  { id: "notes", label: "Notes", hint: "Les notes à la place des scènes", icon: StickyNote },
  { id: "info", label: "Informations", hint: "Titre, auteurs, contact, mention : ce qu'imprime la page de titre", icon: FileText },
];
const PANELS: Record<Panel, string> = { scenes: "Scènes", notes: "Notes", info: "Informations" };

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
  const body: "editor" | "preview" = preview ? "preview" : "editor";
  const [display, setDisplayState] = useState<Display>(savedDisplay);
  const linksRef = useRef(display.links);
  linksRef.current = display.links;
  const setDisplay = (d: Display) => {
    setDisplayState(d);
    try {
      localStorage.setItem(DISPLAY_KEY, d.cards ? "cards" : "bare");
      localStorage.setItem(LINKS_KEY, d.links ? "on" : "off");
      localStorage.setItem(PIN_KEY, d.pin ? "on" : "off");
    } catch {
      // Not remembered: it still applies until the project is closed.
    }
  };
  /** A panel's tab shows it in place of the scenes; pressed again, the scenes come back. */
  const togglePanel = (p: Exclude<Panel, "scenes">) => {
    const next = panel === p ? "scenes" : p;
    setPanel(next);
    if (next === "notes") setPreview(false);
    if (next !== "info" && (!preview || next === "notes")) requestAnimationFrame(() => editorRef.current?.focus());
  };
  /** « Aperçu » shows the whole script as it prints; pressed again, or Échap, it goes back to writing. */
  const togglePreview = () => {
    const next = !preview;
    setPreview(next);
    if (next) {
      if (panel === "notes") setPanel("scenes");
      requestAnimationFrame(() => deskRef.current?.scrollTo({ top: 0 }));
    } else requestAnimationFrame(() => editorRef.current?.focus());
  };
  const togglePreviewRef = useRef(togglePreview);
  togglePreviewRef.current = togglePreview;
  const rowsRef = useRef<SceneRow[]>([]);
  /** « + Nouvelle scène » between two cards: set once the story is loaded. */
  const addAfterRef = useRef<(afterId: string) => void>(() => {});
  const plugins = useMemo(
    () => [
      wikiPlugin(schema.marks.wikilink, () => bibleIndex, () => linksRef.current),
      sceneGapsPlugin((id) => addAfterRef.current(id)),
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
    if (panel !== "info") void flushTitle();
  }, [panel, flushTitle]);
  // The version in progress moves when a version is frozen, the date at midnight: both are read again on showing the page.
  useEffect(() => {
    if (panel !== "info" && !preview) return;
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
        togglePreviewRef.current();
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


  // A right click in the list deletes, as the board's « ⋯ » menus do: acts and sequences leave their scenes in
  // the screenplay, a scene goes to the bin of cut scenes.
  const [choice, ask] = useChoice();
  const removeFromList = async (target: ListTarget) => {
    const name = (num: string, title: string) => <strong>{title ? `${num} · ${title}` : num}</strong>;
    const request =
      target.kind === "scene"
        ? {
            title: "Supprimer la scène ?",
            text: (
              <p>
                {name(`Scène ${target.index + 1}`, rowsRef.current[target.index]?.heading ?? "")}. Elle quitte le scénario mais reste dans la
                corbeille des scènes coupées (vue Versions), d'où elle peut être réintégrée.
              </p>
            ),
          }
        : target.kind === "act"
          ? {
              title: "Supprimer l'acte ?",
              text: <p>{name(target.part.num, target.part.title)}. Ses séquences et ses scènes sont conservées, sans acte.</p>,
            }
          : {
              title: "Supprimer la séquence ?",
              text: <p>{name(target.part.num, target.part.title)}. Ses scènes restent dans le scénario et rejoignent la séquence précédente.</p>,
            };
    const c = await ask({ ...request, cancel: "Annuler", choices: [{ label: "Supprimer", value: "y", danger: true }] });
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
    if (!desk || body !== "editor") return;
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
    return () => {
      desk.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [body, display.cards, sceneCount]);
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

  const shownTitle = titlePage && resolveTitlePage(titlePage.draft, titlePage.auto);
  // The preview prints the information as it is being typed, saved or not.
  const printedTitle = hasContent(shownTitle) ? shownTitle : null;

  return (
    <>
      {format && <style>{formatCss(format, false)}</style>}
      {display.cards && story && <style>{cardCss}</style>}
      {choice}
      <div className="workspace">
        <aside className="sidebar" aria-label={PANELS[panel]}>
          {panel === "scenes" && (
            <SceneList
              scenes={rows}
              groups={groups}
              current={snap?.sceneIndex ?? 0}
              onSelect={selectScene}
              foldKey={`oniric.script.folds.${project.id}`}
              onRemove={(target) => void removeFromList(target)}
            />
          )}
          {panel === "notes" && (
            <NotesPanel editor={editorRef.current} />
          )}
          {panel === "info" && titlePage && (
            <TitlePagePanel page={titlePage.draft} onChange={editTitle} />
          )}
        </aside>

        <main
          ref={deskRef}
          className={
            body === "editor"
              ? `desk sheetless ${display.cards ? "display-cards" : "display-bare"}${display.links ? "" : " links-off"}`
              : "desk desk-print"
          }
        >
          {format && body === "editor" && display.pin && pin && (
            <div
              className="story-pin-rail"
              aria-hidden="true"
              style={{
                width: `${format.page.width}in`,
                translate: `${(format.margins.right - format.margins.left) / 2}in`,
              }}
            >
              <div
                key={`${pin.act?.id}:${pin.sequence?.id}`}
                className="story-pin"
                style={
                  {
                    top: pinTop,
                    right: `calc(100% - ${format.margins.left - 0.6}in + 22px)`,
                    // As wide as the room left of the cards, up to 180px.
                    maxWidth: `min(180px, calc((100cqw - ${format.page.width}in) / 2 + ${(format.margins.left + format.margins.right) / 2 - 0.6}in - 38px))`,
                    "--act": pin.color ?? undefined,
                  } as CSSProperties
                }
              >
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
                        Scène {pin.at + 1} sur {pin.count}
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
              </div>
            </div>
          )}
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
            <CheckMenu
              label="Affichage"
              icon={Eye}
              disabled={body !== "editor"}
              items={[
                {
                  id: "cards",
                  label: "Cartes de scène",
                  hint: "Chaque scène dans sa carte, à la couleur du Tableau",
                  checked: display.cards,
                },
                {
                  id: "links",
                  label: "Liens de la Bible",
                  hint: "Les éléments de la Bible en couleur, leur fiche au survol",
                  checked: display.links,
                },
                {
                  id: "pin",
                  label: "Acte et séquence",
                  hint: "Le repère à gauche du texte, qui suit la scène en haut du bureau",
                  checked: display.pin,
                },
              ]}
              onToggle={(id) => setDisplay({ ...display, [id]: !display[id] })}
            />
            <button
              type="button"
              className={preview ? "btn on" : "btn"}
              aria-pressed={preview}
              title="Le script entier tel qu'il s'imprime (Échap pour revenir)"
              onClick={togglePreview}
            >
              <BookOpen aria-hidden="true" />
              <span>Aperçu</span>
            </button>
            <span className="bar-sep" aria-hidden="true" />
            <Segmented
              label="Panneau"
              options={PANEL_TABS}
              value={panel === "scenes" ? null : panel}
              onChange={togglePanel}
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

/** The script's information, in the side panel: what the title page prints, seen with « Aperçu ». */
function TitlePagePanel({
  page,
  onChange,
}: {
  page: TitlePage;
  onChange: (p: TitlePage) => void;
}) {
  const { ask } = useProject();
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
                  onClick={async () => {
                    if (n.trim() && !(await confirmRemoval(ask, { title: `Retirer « ${n.trim()} » des auteurs ?`, text: "Son nom quitte la page de titre.", label: "Retirer" }))) return;
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
          Plus
        </button>
      </fieldset>
      {field("basedOn", "D'après", 1, "D'après le roman de…")}
      {field("contact", "Contact", 5, "Nom, agent, téléphone, e-mail")}
      <label className="field">
        <span>Mentions</span>
        <Select value={page.mention} onChange={(e) => set({ mention: e.target.value as MentionId })}>
          {MENTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
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
  const { session, notify, ask } = useProject();
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
  const sorted = [...notes].sort((a, b) => order(a) - order(b));
  const open = sorted.filter((n) => !n.resolved);
  const archived = sorted.filter((n) => n.resolved);

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

  const card = (n: NoteRow) => {
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
                    onClick: () => void update(n.id, { resolved: 0 }),
                  }
                : {
                    label: "Archiver",
                    icon: Archive,
                    hint: "Range la note sous la liste, dans « Archivées », sans l'effacer.",
                    onClick: () => void update(n.id, { resolved: 1 }),
                  },
              {
                label: "Supprimer",
                icon: Trash2,
                danger: true,
                onClick: async () => {
                  if (!(await confirmRemoval(ask, { title: "Supprimer la note ?", text: "Elle quitte le scénario et la liste des notes." }))) return;
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
  };

  return (
    <div className="notes-panel">
      <ul className="notes">
        {/* The next note, as a card still to fill: it says where the note will go. */}
        <li>
          <button type="button" className="note-new" onClick={() => void add()}>
            <span className="note-new-label">
              <Plus aria-hidden="true" />
              Créer une note
            </span>
            <span className="note-new-hint">Sur le passage sélectionné, ou la ligne du curseur</span>
          </button>
        </li>
        {open.map(card)}
      </ul>
      {/* The archived notes, folded under the others. */}
      {archived.length > 0 && (
        <section className="notes-archived">
          <button type="button" className="notes-archived-toggle" aria-expanded={archives} onClick={() => setArchives(!archives)}>
            <ChevronRight className="notes-archived-chevron" aria-hidden="true" />
            Archivées
            <span className="notes-archived-count">{archived.length}</span>
          </button>
          {archives && <ul className="notes">{archived.map(card)}</ul>}
        </section>
      )}
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
