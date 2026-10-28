import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  ClipboardList,
  FileCheck2,
  FileInput,
  FolderOpen,
  FileOutput,
  FileText,
  History,
  Images,
  Keyboard,
  Layers,
  LayoutDashboard,
  LayoutPanelTop,
  ListChecks,
  Languages,
  LogOut,
  MapPin,
  Monitor,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Search,
  Settings,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { commands, events, type OpenState } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { describeCoreError, describeError } from "../../../core/errors";
import { markEditorStep, stepHistory } from "../../../core/history";
import { PromptDialog, type PromptRequest } from "../../../ui-kit/PromptDialog";
import { dateFormat, getLanguage, LANGUAGES, setLanguage, t } from "../../../core/i18n";
import {
  getThemePreference,
  onThemePreference,
  resolveTheme,
  setThemePreference,
} from "../../../core/theme";
import { importScript, IMPORT_ACCEPT } from "../../../interop/importScript";
import type { ChoiceRequest } from "../../../ui-kit/Dialog";
import { FloatingMenu } from "../../../ui-kit/MoreMenu";
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
import { StructureView } from "../../script/views/ui/StructureView";
import { WorkshopView } from "../../script/workshop/ui/WorkshopView";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { DashboardView, lastSceneKey } from "./DashboardView";
import { LaterView } from "./LaterView";
import {
  ProjectContext,
  type Crumb,
  type ProjectApi,
  type TransferMode,
  type TransferSection,
  type SettingsPage,
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
  /** Other words the palette finds it by. */
  keywords?: string;
}

/** A view of the side bar; its name and keywords are read in the language of the moment. */
function navItem(id: ViewId, icon: LucideIcon, later?: string): NavItem {
  return {
    id,
    icon,
    later,
    get label() {
      return t(`nav.views.${id}`);
    },
    get keywords() {
      return t(`nav.keywords.${id}`, { defaultValue: "" }) || undefined;
    },
  };
}

/** The first page of a project, above the parts. */
const DASHBOARD = navItem("dashboard", LayoutDashboard);

function navPart(part: string, items: NavItem[]) {
  return {
    part,
    items,
    get label() {
      return t(`nav.parts.${part}`);
    },
  };
}

export const NAV: { part: string; label: string; items: NavItem[] }[] = [
  navPart("script", [
    navItem("workshop", NotebookPen),
    navItem("bible", BookOpen),
    navItem("script", FileText),
    navItem("structure", Layers),
    navItem("versions", History),
    navItem("stats", ChartColumn),
  ]),
  navPart("realisation", [
    navItem("moodboard", Images, "2.0"),
    navItem("shotlist", Clapperboard, "2.0"),
    navItem("storyboard", LayoutPanelTop, "2.0"),
  ]),
  navPart("production", [
    navItem("team", Users, "2.0"),
    navItem("breakdown", ListChecks, "2.0"),
    navItem("schedule", CalendarDays, "2.0"),
    navItem("callsheets", ClipboardList, "2.0"),
    navItem("budget", Wallet, "3.0"),
    navItem("scouting", MapPin, "3.0"),
    navItem("permits", FileCheck2, "3.0"),
  ]),
];

const DAY_MS = 24 * 3600 * 1000;

/** An open project: navigation between the views, the shared screenplay session, the status bar. */
export function ProjectShell({
  project,
  handle,
  notify,
  ask,
  onClose,
  onRenamed,
}: {
  project: OpenState;
  handle: RefObject<WorkspaceHandle | null>;
  notify: Notify;
  ask: (r: ChoiceRequest) => Promise<string | null>;
  onClose: () => void;
  onRenamed: (title: string) => void;
}) {
  const session = useMemo(() => new ScriptSession(), []);
  const [view, setView] = useState<ViewId>("dashboard");
  const [entry, setEntry] = useState<string | null>(null);
  const [bibleHome, setBibleHome] = useState(0);
  // The settings window and the page it opens on.
  const [settings, setSettings] = useState<SettingsPage | null>(null);
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

  // Only the title changes: the folder keeps its name, so the window and the recent list still find it.
  const rename = useCallback(async () => {
    const title = await prompt(t("shell.renameProject"), t("shell.projectTitle"), project.title);
    if (!title || title === project.title) return;
    try {
      onRenamed(unwrap(await commands.projectRename(project.dir, title)));
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  }, [prompt, project.title, project.dir, onRenamed, notify]);

  // Ctrl+Z and Ctrl+Y outside a text field undo and redo the project's last action; a field keeps its own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("textarea, select, [contenteditable='true'], input:not([type='checkbox']):not([type='radio']):not([type='button'])")) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      const redo = key === "y" || e.shiftKey;
      const run = (again: boolean) =>
        stepHistory(again, session.editor)
          .then((done) => {
            if (done === "none") notify({ text: t(again ? "history.nothingToRedo" : "history.nothingToUndo") });
            else if (done === "textChanged") notify({ text: t("history.textChanged"), tone: "warning" });
            else
              notify({
                text: t(again ? "history.redone" : "history.undone", { label: done.label }),
                actions: [{ label: t(again ? "history.undo" : "history.redo"), onClick: () => void run(!again) }],
              });
          })
          .catch((err) => notify({ text: describeError(err), tone: "error" }));
      void run(redo);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, notify]);

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
          text: t("workspace.exported", { file: path.split(/[\\/]/).slice(-2).join("\\") }),
          actions: [
            {
              label: t("workspace.openFile"),
              onClick: () => void commands.reveal(path, true),
            },
            {
              label: t("workspace.showInFolder"),
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
      openSettings: (page: SettingsPage = "profile") => setSettings(page),
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

  // The scene the cursor is in while writing: the dashboard opens it again.
  useEffect(() => {
    if (view !== "script") return;
    const key = lastSceneKey(project.id);
    let last: string | null = null;
    const stop = session.subscribeState(() => {
      const index = session.snapshot?.sceneIndex;
      const id = index === undefined ? undefined : (session.editor?.doc.maybeChild(index)?.attrs.id as string | undefined);
      if (!id || id === last) return;
      last = id;
      try {
        localStorage.setItem(key, id);
      } catch {
        // Not remembered: the dashboard offers the first scene.
      }
    });
    return () => {
      stop();
    };
  }, [view, session, project.id]);

  // Re-renders in the language just chosen.
  const { i18n } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const bibleFileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Folded to a rail of icons, and the sections folded in it: remembered on this computer.
  const [rail, setRail] = useStoredState("oniric.nav.rail", false);
  const [foldedParts, setFoldedParts] = useStoredState<string[]>("oniric.nav.folded", []);
  // A narrow window has room for the rail only.
  const narrow = useSyncExternalStore(subscribeNarrow, () => NARROW.matches);
  const railed = rail || narrow;
  // The theme on screen: following Windows, it is still one of the two.
  const [theme, setTheme] = useState(() => resolveTheme(getThemePreference()));
  useEffect(() => onThemePreference((p) => setTheme(resolveTheme(p))), []);
  const [palette, setPalette] = useState(false);

  /** A view from the side bar; the Bible opens on its home page. */
  const goView = useCallback((id: ViewId) => {
    if (id === "bible") {
      setEntry(null);
      setBibleHome((n) => n + 1);
    }
    setView(id);
  }, []);

  // Ctrl+K opens the palette from anywhere in the project, unless a dialog is already open; Ctrl+/ the shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === "/" || e.code === "Slash") {
        if (document.querySelector("dialog[open]:not(.palette)")) return;
        e.preventDefault();
        setPalette(false);
        setSettings("shortcuts");
        return;
      }
      if (e.shiftKey || e.key.toLowerCase() !== "k") return;
      if (document.querySelector("dialog[open]:not(.palette)")) return;
      e.preventDefault();
      setPalette((p) => !p);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const paletteItems = useMemo((): PaletteItem[] => {
    const dashboard: PaletteItem = {
      id: "view-dashboard",
      group: t("palette.views"),
      label: DASHBOARD.label,
      detail: t("palette.project"),
      icon: DASHBOARD.icon,
      keywords: DASHBOARD.keywords,
      run: () => goView("dashboard"),
    };
    const views = NAV.filter((g) => !hiddenParts.includes(g.part)).flatMap(
      (g) =>
        g.items.map((item) => ({
          id: `view-${item.id}`,
          group: t("palette.views"),
          label: item.label,
          detail: item.later ? `${g.label} · ${item.later}` : g.label,
          icon: item.icon,
          keywords: item.keywords,
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
    ): PaletteItem => ({ id, group: t("palette.actions"), label, icon, run, keywords });
    return [
      dashboard,
      ...views,
      action("rename", t("shell.renameProject"), Pencil, () => void rename(), t("palette.kw.rename")),
      action("import", t("workspace.import"), FileInput, () => transfer("import"), t("palette.kw.import")),
      action("export", t("workspace.export"), FileOutput, () => transfer("export"), t("palette.kw.export")),
      { ...action("folder", t("shell.openFolder"), FolderOpen, () => void commands.reveal(project.dir, true), t("palette.kw.folder")), detail: project.dir },
      action("settings", t("shell.settings"), Settings, () => setSettings("profile"), t("palette.kw.settings")),
      action("shortcuts", t("shell.shortcuts"), Keyboard, () => setSettings("shortcuts"), t("palette.kw.shortcuts")),
      action("light", t("palette.themeLight"), Sun, () => void setThemePreference("light"), t("palette.kw.light")),
      action("dark", t("palette.themeDark"), Moon, () => void setThemePreference("dark"), t("palette.kw.dark")),
      action("system", t("palette.themeSystem"), Monitor, () => void setThemePreference("system"), t("palette.kw.system")),
      ...LANGUAGES.filter((l) => l.id !== i18n.language).map((l) =>
        action(`language-${l.id}`, l.name, Languages, () => void setLanguage(l.id), t("palette.kw.language")),
      ),
      action("close", t("workspace.closeProject"), LogOut, onClose, t("palette.kw.close")),
    ];
  }, [hiddenParts, goView, transfer, onClose, rename, project.dir, i18n.language]);

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
      await markEditorStep(editor, "Import du scénario");
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
        text: t("shell.bibleImported", { added: r.added, updated: r.updated }),
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
        <nav
          className={railed ? "shell-nav rail" : "shell-nav"}
          aria-label={t("shell.views")}
        >
          <div className="shell-nav-top">
            <ProjectMenu
              title={project.title}
              dir={project.dir}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              items={[
                {
                  label: t("shell.renameProject"),
                  icon: Pencil,
                  onClick: () => void rename(),
                },
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
                  label: t("shell.openFolder"),
                  detail: project.dir,
                  icon: FolderOpen,
                  onClick: () => void commands.reveal(project.dir, true),
                },
                {
                  label: t("shell.settings"),
                  icon: Settings,
                  onClick: () => setSettings("profile"),
                  separated: true,
                },
              ]}
            />
            <button
              type="button"
              className="nav-icon-btn nav-rail-toggle"
              hidden={narrow}
              aria-label={rail ? t("shell.unfold") : t("shell.fold")}
              title={rail ? t("shell.unfold") : t("shell.fold")}
              aria-expanded={!rail}
              onClick={() => setRail(!rail)}
            >
              {rail ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </button>
          </div>
          <button
            type="button"
            className="nav-link nav-search"
            aria-keyshortcuts="Control+K"
            title={t("shell.searchTitle")}
            onClick={() => setPalette(true)}
          >
            <Search aria-hidden="true" />
            <span>{t("shell.search")}</span>
            <span className="nav-keys" aria-hidden="true">
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </span>
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
          <div className="shell-nav-parts">
            <ul className="nav-home">
              <li>
                <NavButton item={DASHBOARD} on={view === "dashboard"} onClick={() => goView("dashboard")} />
              </li>
            </ul>
            {NAV.filter((g) => !hiddenParts.includes(g.part)).map((g) => {
              // A folded section still shows the view one is on.
              const open = railed || !foldedParts.includes(g.part);
              const shown = open
                ? g.items
                : g.items.filter((item) => item.id === view);
              return (
                <section key={g.part}>
                  <h2>
                    <button
                      type="button"
                      className="nav-part"
                      aria-expanded={open}
                      onClick={() =>
                        setFoldedParts(
                          open
                            ? [...foldedParts, g.part]
                            : foldedParts.filter((x) => x !== g.part),
                        )
                      }
                    >
                      <span>{g.label}</span>
                      <ChevronDown aria-hidden="true" />
                      {g.items.every((item) => item.later) && (
                        <span className="nav-part-later">{t("shell.later")}</span>
                      )}
                    </button>
                  </h2>
                  {shown.length > 0 && (
                    <ul>
                      {shown.map((item) => (
                        <li key={item.id}>
                          <NavButton
                            item={item}
                            on={view === item.id}
                            onClick={() => goView(item.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
          {/* Leaving the project fills the foot, its arrow toward the window's edge; the language, the shortcuts and the theme,
              used now and then, sit beside it as icons. */}
          <div className="shell-nav-foot">
            <button
              type="button"
              className="nav-link nav-close"
              aria-label={t("workspace.closeProject")}
              title={t("workspace.closeProject")}
              onClick={onClose}
            >
              <LogOut aria-hidden="true" />
              <span>{t("common.close")}</span>
            </button>
            <LanguageButton />
            <button
              type="button"
              className="nav-icon-btn"
              aria-label={t("shell.shortcuts")}
              aria-keyshortcuts="Control+/"
              title={t("shell.shortcutsTitle")}
              onClick={() => setSettings("shortcuts")}
            >
              <Keyboard aria-hidden="true" />
            </button>
            <button
              type="button"
              className="nav-icon-btn"
              aria-label={t(`shell.themeTo.${THEME_NEXT[theme]}`)}
              title={t(`shell.themeTo.${THEME_NEXT[theme]}`)}
              onClick={() => void setThemePreference(THEME_NEXT[theme])}
            >
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
          </div>
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
            {view === "dashboard" && <DashboardView />}
            {view === "workshop" && <WorkshopView />}
            {view === "bible" && (
              <BibleView selected={entry} onSelected={setEntry} home={bibleHome} />
            )}
            {view === "structure" && <StructureView />}
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
      {settings && <SettingsDialog page={settings} onClose={() => setSettings(null)} />}
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
  /** A second, muted line under the label. */
  detail?: string;
  icon: LucideIcon;
  onClick: () => void;
  separated?: boolean;
}

/** The project's name at the top of the side bar, opening the project actions: import, export, folder, settings. */
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
        title={`${title} — ${dir}`}
        aria-label={t("shell.brand", { title })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <img src="/oniric.svg" alt="" width="22" height="22" />
        <span className="shell-brand-title">Oniric</span>
        <ChevronDown aria-hidden="true" className="shell-brand-chevron" />
      </button>
      {open && at && (
        <div
          ref={menuRef}
          className="project-menu"
          role="menu"
          style={{ top: at.top, left: at.left }}
        >
          <div className="project-menu-head" role="presentation">
            <span className="project-menu-title">{title}</span>
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={[item.separated && "separated", item.detail && "detailed"].filter(Boolean).join(" ") || undefined}
                onClick={() => {
                  onOpenChange(false);
                  item.onClick();
                }}
              >
                <Icon aria-hidden="true" />
                {item.detail ? (
                  <span className="project-menu-text">
                    {item.label}
                    <span className="project-menu-dir">{item.detail}</span>
                  </span>
                ) : (
                  item.label
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

const NARROW = window.matchMedia("(max-width: 1180px)");
const subscribeNarrow = (onChange: () => void) => {
  NARROW.addEventListener("change", onChange);
  return () => NARROW.removeEventListener("change", onChange);
};

type Shown = "light" | "dark";
/** The theme button swaps one for the other. */
const THEME_NEXT: Record<Shown, Shown> = { light: "dark", dark: "light" };

/** A state kept in this computer's storage; without it, it still holds for the session. */
function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // Not remembered, still applied.
      }
    },
    [key],
  );
  return [value, set];
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
      title={item.later ? t("shell.comesIn", { view: item.label, version: item.later }) : item.label}
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

const SCENE_VIEWS = new Set<ViewId>(["script", "structure"]);

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
  const label = view === "dashboard" ? DASHBOARD.label : (group?.items.find((i) => i.id === view)?.label ?? t("shell.settings"));
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
        <ol className="crumbs" aria-label={t("shell.crumbs")}>
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
            time: dateFormat({ timeStyle: "medium" }).format(flushedAt),
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
        <span>{t("status.backupAt", { time: dateFormat({ timeStyle: "short" }).format(backupAt) })}</span>
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
        text: t("backup.failed", { detail: e.payload.message }),
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
        text: t("backup.old", { count: days }),
        tone: "warning",
        timeout: 0,
        actions: [
          {
            label: t("backup.now"),
            onClick: () =>
              void commands
                .backupNow()
                .then((x) =>
                  notify(
                    x.status === "ok"
                      ? { text: t("backup.done") }
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

/** The language of the interface: each one named in itself, the current one checked. */
function LanguageButton() {
  const { i18n } = useTranslation();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ bottom: number; left: number } | null>(null);
  const current = LANGUAGES.find((l) => l.id === getLanguage())!;
  const label = t("shell.language", { language: current.name });
  return (
    <>
      <button
        ref={button}
        type="button"
        className={at ? "nav-icon-btn on" : "nav-icon-btn"}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { bottom: window.innerHeight - r.top + 4, left: r.left });
        }}
      >
        <Languages aria-hidden="true" />
      </button>
      {at && (
        <FloatingMenu
          anchor={button}
          style={{ bottom: at.bottom, left: at.left, minWidth: 180 }}
          onClose={() => setAt(null)}
          items={LANGUAGES.map((l) => ({
            label: l.name,
            checked: l.id === i18n.language,
            onClick: () => void setLanguage(l.id),
          }))}
        />
      )}
    </>
  );
}
