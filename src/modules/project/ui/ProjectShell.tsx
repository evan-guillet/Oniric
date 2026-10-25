import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  ChartGantt,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  ClipboardList,
  FileCheck2,
  FileInput,
  FileOutput,
  FileText,
  History,
  Images,
  LayoutPanelTop,
  ListChecks,
  LogOut,
  MapPin,
  Monitor,
  Moon,
  NotebookPen,
  Search,
  Settings,
  SquareKanban,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { commands, events, type OpenState } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { describeCoreError, describeError } from "../../../core/errors";
import { setThemePreference } from "../../../core/theme";
import { importScript, IMPORT_ACCEPT } from "../../../interop/importScript";
import { Dialog, type ChoiceRequest } from "../../../ui-kit/Dialog";
import type { ToastMessage } from "../../../ui-kit/Toast";
import {
  bibleIndex,
  importBible,
  loadEntries,
} from "../../script/bible/application/bible";
import { BibleView } from "../../script/bible/ui/BibleView";
import {
  ScriptSession,
  useSessionState,
} from "../../script/screenplay/application/scriptSession";
import { readSetting } from "../../script/screenplay/application/settings";
import {
  readTitlePage,
  writeTitlePage,
} from "../../script/screenplay/application/titlePageSettings";
import { hasContent } from "../../script/screenplay/domain/titlePage";
import {
  blocksFromDoc,
  docFromBlocks,
} from "../../script/screenplay/ui/editor/schema";
import { formatMinutes } from "../../script/screenplay/domain/duration";
import { ScreenplayWorkspace } from "../../script/screenplay/ui/ScreenplayWorkspace";
import { VersionsView } from "../../script/screenplay/ui/VersionsView";
import { useWritingJournal } from "../../script/stats/application/journal";
import { StatsView } from "../../script/stats/ui/StatsView";
import { BoardView } from "../../script/views/ui/BoardView";
import { TimelineView } from "../../script/views/ui/TimelineView";
import { WorkshopView } from "../../script/workshop/ui/WorkshopView";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { LaterView } from "./LaterView";
import {
  ProjectContext,
  type Crumb,
  type ProjectApi,
  type TransferMode,
  type TransferSection,
  type ViewId,
} from "./projectContext";
import { PARTS_HIDDEN_SETTING, SettingsDialog } from "./SettingsView";
import { TransferDialog } from "./TransferDialog";

export interface WorkspaceHandle {
  /** Writes whatever the editor has not saved yet. */
  flush(): Promise<void>;
}

type Notify = (m: Omit<ToastMessage, "id">) => void;

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  later?: string;
}

export const NAV: { part: string; label: string; items: NavItem[] }[] = [
  {
    part: "script",
    label: "Script",
    items: [
      { id: "workshop", label: "Atelier", icon: NotebookPen },
      { id: "bible", label: "Bible", icon: BookOpen },
      { id: "script", label: "Scénario", icon: FileText },
      { id: "board", label: "Tableau", icon: SquareKanban },
      { id: "timeline", label: "Chronologie", icon: ChartGantt },
      { id: "versions", label: "Versions", icon: History },
      { id: "stats", label: "Statistiques", icon: ChartColumn },
    ],
  },
  {
    part: "realisation",
    label: "Réalisation",
    items: [
      { id: "moodboard", label: "Moodboard", icon: Images, later: "2.0" },
      { id: "shotlist", label: "Découpage", icon: Clapperboard, later: "2.0" },
      {
        id: "storyboard",
        label: "Storyboard",
        icon: LayoutPanelTop,
        later: "2.0",
      },
    ],
  },
  {
    part: "production",
    label: "Production",
    items: [
      { id: "team", label: "Équipe", icon: Users, later: "2.0" },
      {
        id: "breakdown",
        label: "Dépouillement",
        icon: ListChecks,
        later: "2.0",
      },
      {
        id: "schedule",
        label: "Plan de travail",
        icon: CalendarDays,
        later: "2.0",
      },
      {
        id: "callsheets",
        label: "Feuilles de service",
        icon: ClipboardList,
        later: "2.0",
      },
      { id: "budget", label: "Budget", icon: Wallet, later: "3.0" },
      { id: "scouting", label: "Repérages", icon: MapPin, later: "3.0" },
      { id: "permits", label: "Autorisations", icon: FileCheck2, later: "3.0" },
    ],
  },
];

const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" });
const DAY_MS = 24 * 3600 * 1000;

interface PromptRequest {
  title: string;
  label: string;
  value: string;
  resolve: (v: string | null) => void;
}

/** An open project: navigation between the views, the shared screenplay session, the status bar. */
export function ProjectShell({
  project,
  handle,
  notify,
  ask,
  onClose,
}: {
  project: OpenState;
  handle: RefObject<WorkspaceHandle | null>;
  notify: Notify;
  ask: (r: ChoiceRequest) => Promise<string | null>;
  onClose: () => void;
}) {
  const session = useMemo(() => new ScriptSession(), []);
  const [view, setView] = useState<ViewId>("script");
  const [entry, setEntry] = useState<string | null>(null);
  const [bibleHome, setBibleHome] = useState(0);
  const [settings, setSettings] = useState(false);
  const [promptReq, setPromptReq] = useState<PromptRequest | null>(null);
  const [print, setPrint] = useState<{
    content: ReactNode;
    css: string;
  } | null>(null);
  const [headerActions, setHeaderActions] = useState<HTMLElement | null>(null);
  const [trail, setTrail] = useState<Crumb[] | null>(null);
  const [transferReq, setTransferReq] = useState<{
    mode: TransferMode;
    section?: TransferSection;
  } | null>(null);
  const transfer = useCallback(
    (mode: TransferMode, section?: TransferSection) =>
      setTransferReq({
        mode,
        // Sans section précise, la fenêtre s'ouvre sur la vue en cours.
        section:
          section ??
          (view === "bible" || view === "workshop" ? view : "script"),
      }),
    [view],
  );
  const hiddenParts =
    useLive(
      async () =>
        JSON.parse(
          (await readSetting(PARTS_HIDDEN_SETTING)) ?? "[]",
        ) as string[],
      ["project_setting"],
    ) ?? [];

  useEffect(() => {
    handle.current = { flush: () => session.flush() };
    return () => {
      handle.current = null;
    };
  }, [handle, session]);

  const openScene = useCallback(
    (id: string) => {
      setView("script");
      requestAnimationFrame(() => session.editor?.goToSceneId(id));
    },
    [session],
  );

  const openEntry = useCallback((id: string) => {
    setEntry(id);
    setView("bible");
  }, []);

  useEffect(() => {
    bibleIndex.start();
    bibleIndex.opener = openEntry;
    return () => {
      bibleIndex.opener = () => {};
      bibleIndex.dispose();
    };
  }, [openEntry]);

  const prompt = useCallback(
    (title: string, label: string, initial = "") =>
      new Promise<string | null>((resolve) =>
        setPromptReq({ title, label, value: initial, resolve }),
      ),
    [],
  );

  const printPdf = useCallback(
    async (
      fileName: string,
      content: ReactNode,
      page: { width: number; height: number; css?: string },
    ) => {
      try {
        await session.flush();
        flushSync(() =>
          setPrint({
            content,
            css:
              page.css ??
              `@page { size: ${page.width}in ${page.height}in; margin: 0; }`,
          }),
        );
        await document.fonts.ready;
        const path = unwrap(
          await commands.exportPdf(fileName, page.width, page.height),
        );
        notify({
          text: `Fichier enregistré dans le dossier du projet : ${path.split(/[\\/]/).slice(-2).join("\\")}`,
          actions: [
            {
              label: "Ouvrir",
              onClick: () => void commands.reveal(path, true),
            },
            {
              label: "Afficher dans le dossier",
              onClick: () => void commands.reveal(path, false),
            },
          ],
        });
      } catch (e) {
        notify({ text: describeError(e), tone: "error" });
      } finally {
        setPrint(null);
      }
    },
    [notify, session],
  );

  const api: ProjectApi = useMemo(
    () => ({
      project,
      session,
      notify,
      ask,
      prompt,
      go: setView,
      openScene,
      openEntry,
      printPdf,
      headerActions,
      transfer,
      setTrail,
    }),
    [
      project,
      session,
      notify,
      ask,
      prompt,
      openScene,
      openEntry,
      printPdf,
      headerActions,
      transfer,
      setTrail,
    ],
  );

  useBackupWatch(notify);
  useWritingJournal(session);

  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const bibleFileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  /** A view from the side bar; the Bible opens on its home page. */
  const goView = useCallback((id: ViewId) => {
    if (id === "bible") {
      setEntry(null);
      setBibleHome((n) => n + 1);
    }
    setView(id);
  }, []);

  // Ctrl+K opens the palette from anywhere in the project, unless a dialog is already open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "k") return;
      if (document.querySelector("dialog[open]:not(.palette)")) return;
      e.preventDefault();
      setPalette((p) => !p);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const paletteItems = useMemo((): PaletteItem[] => {
    const views = NAV.filter((g) => !hiddenParts.includes(g.part)).flatMap(
      (g) =>
        g.items.map((item) => ({
          id: `view-${item.id}`,
          group: "Vues",
          label: item.label,
          detail: item.later ? `${g.label} · ${item.later}` : g.label,
          icon: item.icon,
          searchOnly: !!item.later,
          run: () => goView(item.id),
        })),
    );
    const action = (
      id: string,
      label: string,
      icon: LucideIcon,
      run: () => void,
      keywords?: string,
    ): PaletteItem => ({ id, group: "Actions", label, icon, run, keywords });
    return [
      ...views,
      action("import", "Importer…", FileInput, () => transfer("import"), "fountain fdx fichier"),
      action("export", "Exporter…", FileOutput, () => transfer("export"), "pdf fountain fdx fichier"),
      action("settings", "Réglages", Settings, () => setSettings(true), "préférences options"),
      action("light", "Thème clair", Sun, () => void setThemePreference("light"), "apparence jour"),
      action("dark", "Thème sombre", Moon, () => void setThemePreference("dark"), "apparence nuit"),
      action("system", "Thème du système", Monitor, () => void setThemePreference("system"), "apparence windows"),
      action("close", "Fermer le projet", LogOut, onClose, "quitter accueil"),
    ];
  }, [hiddenParts, goView, transfer, onClose]);

  /** Replaces the screenplay by a Fountain or FDX file [EDT-05]. */
  const importFile = async (file: File | undefined) => {
    const editor = session.editor;
    if (!file || !editor) return;
    try {
      const imported = importScript(
        file.name,
        await file.text(),
        editor.currentFormat.language === "fr",
      );
      const hasText = blocksFromDoc(editor.doc).some(
        (b) => b.text.trim().length > 0,
      );
      if (hasText) {
        const choice = await ask({
          title: t("workspace.importConfirmTitle"),
          text: (
            <p>
              {t("workspace.importConfirmText", {
                file: file.name,
                count: imported.blocks.length,
              })}
            </p>
          ),
          cancel: t("newProject.cancel"),
          choices: [
            {
              label: t("workspace.importReplace"),
              value: "replace",
              primary: true,
            },
          ],
        });
        if (choice !== "replace") return;
      }
      setView("script");
      editor.replaceContent(docFromBlocks(imported.blocks));
      editor.goToScene(0);
      if (imported.titlePage && !hasContent(await readTitlePage()))
        await writeTitlePage(imported.titlePage);
      notify({
        text: t("workspace.imported", {
          file: file.name,
          count: imported.blocks.length,
        }),
      });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** Adds the entries of an exported Oniric bible, updating those already here. */
  const importBibleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = await importBible(await file.text());
      setView("bible");
      notify({
        text: `Bible importée : ${r.added} fiche(s) ajoutée(s), ${r.updated} mise(s) à jour.`,
      });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    } finally {
      if (bibleFileRef.current) bibleFileRef.current.value = "";
    }
  };

  return (
    <ProjectContext.Provider value={api}>
      <div className="shell">
        <nav className="shell-nav" aria-label="Vues du projet">
          <ProjectMenu
            title={project.title}
            dir={project.dir}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            items={[
              {
                label: t("workspace.import"),
                icon: FileInput,
                onClick: () => transfer("import"),
              },
              {
                label: t("workspace.export"),
                icon: FileOutput,
                onClick: () => transfer("export"),
              },
              {
                label: "Réglages",
                icon: Settings,
                onClick: () => setSettings(true),
              },
              {
                label: "Fermer le projet",
                icon: LogOut,
                onClick: onClose,
                separated: true,
              },
            ]}
          />
          <button
            type="button"
            className="nav-link nav-search"
            aria-keyshortcuts="Control+K"
            onClick={() => setPalette(true)}
          >
            <Search aria-hidden="true" />
            <span>Rechercher</span>
            <kbd aria-hidden="true">Ctrl K</kbd>
          </button>
          <input
            ref={fileRef}
            type="file"
            className="script-import"
            accept={IMPORT_ACCEPT}
            hidden
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
          <input
            ref={bibleFileRef}
            type="file"
            className="bible-import"
            accept=".json"
            hidden
            onChange={(e) => void importBibleFile(e.target.files?.[0])}
          />
          {NAV.filter((g) => !hiddenParts.includes(g.part)).map((g) => (
            <section key={g.part}>
              <h2>{g.label}</h2>
              <ul>
                {g.items.map((item) => (
                  <li key={item.id}>
                    <NavButton
                      item={item}
                      on={view === item.id}
                      onClick={() => goView(item.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <div className="shell-panel">
          <ViewHeader
            project={project}
            view={view}
            session={session}
            trail={trail}
            actionsRef={setHeaderActions}
          />
          <div className="shell-main">
            <div className="view-host" hidden={view !== "script"}>
              <ScreenplayWorkspace active={view === "script"} />
            </div>
            {view === "workshop" && <WorkshopView />}
            {view === "bible" && (
              <BibleView selected={entry} onSelected={setEntry} home={bibleHome} />
            )}
            {view === "board" && <BoardView />}
            {view === "timeline" && <TimelineView />}
            {view === "versions" && <VersionsView />}
            {view === "stats" && <StatsView />}
            {LATER.has(view) && <LaterView view={view} />}
          </div>

          <StatusBar session={session} project={project} />
        </div>
      </div>

      {print && (
        <div id="print-root" aria-hidden="true">
          <style>{print.css}</style>
          {print.content}
        </div>
      )}
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      {transferReq && (
        <TransferDialog
          mode={transferReq.mode}
          section={transferReq.section}
          onImport={(kind) =>
            (kind === "script" ? fileRef : bibleFileRef).current?.click()
          }
          onClose={() => setTransferReq(null)}
        />
      )}
      {palette && (
        <CommandPalette
          items={paletteItems}
          scenes={session.snapshot?.headings ?? []}
          onScene={(i) => {
            setView("script");
            requestAnimationFrame(() => session.editor?.goToScene(i));
          }}
          onEntry={openEntry}
          onClose={() => setPalette(false)}
        />
      )}
      {promptReq && (
        <PromptDialog req={promptReq} onDone={() => setPromptReq(null)} />
      )}
    </ProjectContext.Provider>
  );
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  separated?: boolean;
}

/** The project's name at the top of the side bar, opening the project actions: import, settings, close. */
function ProjectMenu({
  title,
  dir,
  open,
  onOpenChange,
  items,
}: {
  title: string;
  dir: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: MenuItem[];
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: r.left });
    requestAnimationFrame(() =>
      menuRef.current?.querySelector("button")?.focus(),
    );
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      )
        onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
        buttonRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const all = [...(menuRef.current?.querySelectorAll("button") ?? [])];
        const i = all.indexOf(document.activeElement as HTMLButtonElement);
        all[
          (i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length
        ]?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={open ? "shell-brand on" : "shell-brand"}
        title={dir}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <img src="/oniric.svg" alt="" width="22" height="22" />
        <span className="shell-brand-title">{title}</span>
        <ChevronDown aria-hidden="true" className="shell-brand-chevron" />
      </button>
      {open && at && (
        <div
          ref={menuRef}
          className="project-menu"
          role="menu"
          style={{ top: at.top, left: at.left }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.separated ? "separated" : undefined}
                onClick={() => {
                  onOpenChange(false);
                  item.onClick();
                }}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function NavButton({
  item,
  on,
  onClick,
}: {
  item: NavItem;
  on: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={["nav-link", on && "on", item.later && "later"]
        .filter(Boolean)
        .join(" ")}
      aria-current={on ? "page" : undefined}
      title={item.label}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
      {item.later && (
        <span className="nav-later" aria-hidden="true">
          {item.later}
        </span>
      )}
    </button>
  );
}

const SCENE_VIEWS = new Set<ViewId>(["script", "board", "timeline"]);

/** Where the user is: project, part, view, and how many things the view holds. */
function ViewHeader({
  project,
  view,
  session,
  trail,
  actionsRef,
}: {
  project: OpenState;
  view: ViewId;
  session: ScriptSession;
  trail: Crumb[] | null;
  actionsRef: (el: HTMLElement | null) => void;
}) {
  useSessionState(session);
  const entries = useLive(
    async () => (await loadEntries()).filter((e) => !e.archivedAt).length,
    ["bible_entry"],
  );
  const group = NAV.find((g) => g.items.some((i) => i.id === view));
  const label = group?.items.find((i) => i.id === view)?.label ?? "Réglages";
  const viewCount = SCENE_VIEWS.has(view)
    ? session.snapshot?.headings.length
    : view === "bible"
      ? entries
      : undefined;
  // A view that went down a level (an act on the board…) names it; the levels above become links.
  const here = trail?.at(-1);
  const count = here ? here.count : viewCount;
  return (
    <header className="view-header">
      <div className="view-header-text">
        <ol className="crumbs" aria-label="Emplacement">
          <li>{project.title}</li>
          {group && (
            <li>
              <ChevronRight aria-hidden="true" />
              {group.label}
            </li>
          )}
          {trail?.slice(0, -1).map((c, i) => (
            <li key={i}>
              <ChevronRight aria-hidden="true" />
              <button type="button" className="crumb-link" onClick={c.onClick}>
                {c.label}
              </button>
            </li>
          ))}
        </ol>
        <h1 className="view-title">
          {here?.label ?? label}
          {count !== undefined && count > 0 && (
            <span className="count">{count}</span>
          )}
        </h1>
      </div>
      <div ref={actionsRef} className="view-header-actions" />
    </header>
  );
}

const LATER = new Set<ViewId>([
  "moodboard",
  "shotlist",
  "storyboard",
  "team",
  "breakdown",
  "schedule",
  "callsheets",
  "budget",
  "scouting",
  "permits",
]);

function PromptDialog({
  req,
  onDone,
}: {
  req: PromptRequest;
  onDone: () => void;
}) {
  const [value, setValue] = useState(req.value);
  const answer = (v: string | null) => {
    req.resolve(v);
    onDone();
  };
  const ok = () => value.trim() && answer(value.trim());
  return (
    <Dialog
      title={req.title}
      onCancel={() => answer(null)}
      actions={[
        { label: "Annuler", onClick: () => answer(null) },
        {
          label: "Valider",
          onClick: ok,
          primary: true,
          disabled: !value.trim(),
        },
      ]}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
      >
        <label className="field">
          <span>{req.label}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
        </label>
      </form>
    </Dialog>
  );
}

function StatusBar({
  session,
  project,
}: {
  session: ScriptSession;
  project: OpenState;
}) {
  const { t } = useTranslation();
  useSessionState(session);
  const [flushedAt, setFlushedAt] = useState<Date | null>(null);
  const [flushError, setFlushError] = useState<string | null>(null);
  const [backupAt, setBackupAt] = useState<Date | null>(null);

  useEffect(() => {
    const flushed = events.projectFlushed.listen(() => {
      setFlushedAt(new Date());
      setFlushError(null);
    });
    const failed = events.projectFlushFailed.listen((e) =>
      setFlushError(e.payload.message),
    );
    const backup = events.backupDone.listen(() => setBackupAt(new Date()));
    return () => {
      for (const u of [flushed, failed, backup]) void u.then((f) => f());
    };
  }, []);

  const snap = session.snapshot;
  const saveState = session.saveState;
  const pages = snap?.pagination.pages ?? [];
  const exactPages =
    pages.length === 0
      ? 0
      : pages.length -
        1 +
        pages[pages.length - 1].usedRows / (snap?.pagination.linesPerPage ?? 1);
  const sceneCount = snap?.headings.length ?? 0;

  let status: { text: string; title: string; tone: string };
  if (saveState === "error")
    status = { text: t("status.error"), title: "", tone: "error" };
  else if (flushError)
    status = {
      text: t("status.notInFolder"),
      title: t("status.notInFolderTitle", { detail: flushError }),
      tone: "warning",
    };
  else if (saveState !== "saved")
    status = { text: t(`status.${saveState}`), title: "", tone: "busy" };
  else
    status = {
      text: t("status.saved"),
      title: flushedAt
        ? t("status.savedTitle", {
            time: new Intl.DateTimeFormat("fr-FR", {
              timeStyle: "medium",
            }).format(flushedAt),
          })
        : t("status.savedNoFlush"),
      tone: "ok",
    };

  return (
    <footer className="statusbar">
      <span
        className={`save-state ${status.tone}`}
        title={status.title}
        role="status"
      >
        {status.text}
      </span>
      <span>{t("status.pages", { count: pages.length })}</span>
      <span>
        {t("status.duration", { duration: formatMinutes(exactPages) })}
      </span>
      {snap && sceneCount > 0 && (
        <span>
          {t("status.scene", { n: snap.sceneIndex + 1, total: sceneCount })}
        </span>
      )}
      {backupAt && (
        <span>Sauvegarde faite à {timeFormat.format(backupAt)}</span>
      )}
      <span className="statusbar-dir" title={project.dir}>
        {project.dir}
      </span>
    </footer>
  );
}

/** Says when a backup fails, and reminds when the last copy is getting old [SAV-05]. */
function useBackupWatch(notify: Notify) {
  const reminded = useRef(false);
  useEffect(() => {
    const failed = events.backupFailed.listen((e) =>
      notify({
        text: `La sauvegarde automatique n'a pas pu être faite : ${e.payload.message}`,
        tone: "warning",
      }),
    );
    void commands.backupState().then((r) => {
      if (r.status !== "ok" || reminded.current) return;
      const days = r.data.settings.remindDays ?? 7;
      const last = r.data.copies[0];
      if (!days || !last || Date.now() - Date.parse(last.at) < days * DAY_MS)
        return;
      reminded.current = true;
      notify({
        text: `La dernière sauvegarde de ce projet date de plus de ${days} jours.`,
        tone: "warning",
        timeout: 0,
        actions: [
          {
            label: "Sauvegarder maintenant",
            onClick: () =>
              void commands
                .backupNow()
                .then((x) =>
                  notify(
                    x.status === "ok"
                      ? { text: "Sauvegarde faite." }
                      : { text: describeCoreError(x.error), tone: "error" },
                  ),
                ),
          },
        ],
      });
    });
    return () => {
      void failed.then((u) => u());
    };
  }, [notify]);
}
