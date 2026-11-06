import {
  lazy,
  Suspense,
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
  BookUser,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChartGantt,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  ClipboardList,
  Eye,
  FileCheck2,
  FileInput,
  FolderOpen,
  FileOutput,
  FileText,
  History,
  Images,
  Info,
  Keyboard,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListTree,
  Languages,
  LogOut,
  MapPin,
  Monitor,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PenLine,
  Plus,
  Rows3,
  Scissors,
  Search,
  Settings,
  SquareKanban,
  Star,
  Sun,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
  Building2,
  Coins,
  FileSignature,
  Landmark,
  Map as MapIcon,
  ReceiptText,
  Scale,
  ShieldCheck,
  Table2,
  UserCheck,
} from "lucide-react";
import { commands, events, type OpenState } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { listVersions } from "../../script/screenplay/application/versions";
import { describeCoreError, describeError } from "../../../core/errors";
import { markEditorStep, stepHistory } from "../../../core/history";
import { PromptDialog, type PromptRequest } from "../../../ui-kit/PromptDialog";
import { getLanguage, LANGUAGES, setLanguage, t } from "../../../core/i18n";
import {
  getThemePreference,
  onThemePreference,
  resolveTheme,
  setThemePreference,
} from "../../../core/theme";
import { importScript, IMPORT_ACCEPT } from "../../../interop/importScript";
import { confirmRemoval, type ChoiceRequest } from "../../../ui-kit/Dialog";
import { FloatingMenu, MoreMenu, type MoreItem } from "../../../ui-kit/MoreMenu";
import type { ToastMessage } from "../../../ui-kit/Toast";
import {
  bibleCategories,
  bibleIndex,
  deleteType,
  importBible,
  loadEntries,
  loadTypes,
  renameType,
} from "../../script/bible/application/bible";
import { cardCounts } from "../../script/bible/application/detected";
import { sceneTexts } from "../../script/bible/application/sceneTexts";
import type { EntryType } from "../../script/bible/domain/types";
import {
  ScriptSession,
  useScenes,
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
import { iconOf } from "../../script/bible/ui/typeIcons";
import { ScreenplayWorkspace } from "../../script/screenplay/ui/ScreenplayWorkspace";
import { LockKeeper } from "../../script/screenplay/ui/LockKeeper";
import { Reminders } from "../../script/workshop/ui/Reminders";
import { useWritingJournal } from "../../script/stats/application/journal";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { DashboardView, lastSceneKey } from "./DashboardView";
import {
  PAGE_KEY,
  PARTS_HIDDEN_SETTING,
  ProjectContext,
  type Crumb,
  type ProjectApi,
  type TransferMode,
  type TransferSection,
  type SettingsPage,
  type ViewId,
} from "./projectContext";
import { TransferDialog } from "./TransferDialog";
import { readStored, useStoredState, writeStored } from "../../../ui-kit/useStoredState";
import { dragWindow, WindowControls } from "../../../ui-kit/TitleBar";

export interface WorkspaceHandle {
  /** Writes whatever the editor has not saved yet. */
  flush(): Promise<void>;
}

type Notify = (m: Omit<ToastMessage, "id">) => void;

/** A page of a view, unfolded under it in the side bar. */
interface NavPage {
  id: string;
  /** The translation key of its name. */
  name?: string;
  /** Its name, when it comes from the project (a type of the Bible). */
  label?: string;
  /** The translation key of what it holds, shown when pointed at. */
  hint?: string;
  /** Shown once it has something to show. */
  needsVersions?: boolean;
  icon: LucideIcon;
  /** What can be done to it, behind the « ⋯ » that shows when it is pointed at. */
  menu?: MoreItem[];
}

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  later?: string;
  /** Other words the palette finds it by. */
  keywords?: string;
  /** The view's pages, and where the one shown is kept. */
  pages?: { key: string; list: NavPage[] };
}

const pageName = (p: NavPage) => p.label ?? t(p.name ?? "");

/** A view of the side bar; its name and keywords are read in the language of the moment. */
function navItem(id: ViewId, icon: LucideIcon, later?: string, pages?: NavItem["pages"]): NavItem {
  return {
    id,
    icon,
    later,
    pages,
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

const NAV: { part: string; label: string; items: NavItem[] }[] = [
  navPart("script", [
    navItem("workshop", NotebookPen),
    navItem("bible", BookOpen, undefined, { key: PAGE_KEY.bible, list: [] }),
    navItem("script", FileText, undefined, {
      key: PAGE_KEY.script,
      list: [
        { id: "text", name: "script.panels.text", hint: "script.panels.textHint", icon: PenLine },
        { id: "info", name: "script.panels.info", hint: "script.panels.infoHint", icon: Info },
        { id: "preview", name: "script.panels.preview", hint: "script.panels.previewHint", icon: Eye },
      ],
    }),
    navItem("structure", Layers, undefined, {
      key: PAGE_KEY.structure,
      list: [
        { id: "board", name: "structure.board", hint: "structure.boardHint", icon: SquareKanban },
        { id: "timeline", name: "structure.timeline", hint: "structure.timelineHint", icon: ChartGantt },
      ],
    }),
    navItem("versions", History, undefined, {
      key: PAGE_KEY.versions,
      list: [
        { id: "scenes", name: "versions.paneScenes", hint: "versions.paneScenesHint", needsVersions: true, icon: ListTree },
        { id: "versions", name: "versions.paneVersions", hint: "versions.historyHint", icon: History },
        { id: "cuts", name: "versions.paneCuts", hint: "versions.cutsHint", icon: Scissors },
      ],
    }),
  ]),
  navPart("realisation", [
    navItem("moodboard", Images),
    navItem("shotlist", Clapperboard),
  ]),
  navPart("production", [
    navItem("team", Users, undefined, {
      key: PAGE_KEY.team,
      list: [
        { id: "crew", name: "team.tabs.crew", icon: Users },
        { id: "cast", name: "team.tabs.cast", icon: Clapperboard },
        { id: "casting", name: "team.tabs.casting", icon: Star },
        { id: "contacts", name: "team.tabs.contacts", icon: BookUser },
      ],
    }),
    navItem("breakdown", ListChecks, undefined, {
      key: PAGE_KEY.breakdown,
      list: [
        { id: "sheets", name: "breakdown.sheets", icon: ClipboardList },
        { id: "reports", name: "breakdown.reports", icon: ListChecks },
      ],
    }),
    navItem("schedule", CalendarDays, undefined, {
      key: PAGE_KEY.schedule,
      list: [
        { id: "strips", name: "schedule.strips", icon: Rows3 },
        { id: "dood", name: "schedule.dood", icon: CalendarCheck },
        { id: "calendar", name: "schedule.calendar", icon: CalendarRange },
      ],
    }),
    navItem("callsheets", ClipboardList),
    navItem("budget", Wallet, undefined, {
      key: PAGE_KEY.budget,
      list: [
        { id: "grid", name: "budget.pages.grid", icon: Table2 },
        { id: "summary", name: "budget.pages.summary", icon: ReceiptText },
        { id: "expenses", name: "budget.pages.expenses", icon: Coins },
        { id: "funding", name: "budget.pages.funding", icon: Landmark },
      ],
    }),
    navItem("scouting", MapPin, undefined, {
      key: PAGE_KEY.scouting,
      list: [
        { id: "sets", name: "scouting.sets", icon: Building2 },
        { id: "map", name: "scouting.mapPage", icon: MapIcon },
        { id: "compare", name: "scouting.compare", icon: Scale },
      ],
    }),
    navItem("permits", FileCheck2, undefined, {
      key: PAGE_KEY.permits,
      list: [
        { id: "requests", name: "permits.pages.requests", icon: FileCheck2 },
        { id: "releases", name: "permits.pages.releases", icon: UserCheck },
        { id: "insurance", name: "permits.pages.insurance", icon: ShieldCheck },
        { id: "documents", name: "permits.pages.documents", icon: FileSignature },
      ],
    }),
  ]),
];

/** What the project itself decides of the pages: whether the Versions have something to show, the types of the Bible. */
interface LivePages {
  hasVersions: boolean;
  bible: NavPage[];
}

/** The pages a view has now, and the one shown: the first when the one kept has nothing to show. */
function pagesOf(item: NavItem | undefined, live: LivePages, kept: string) {
  const list = item?.id === "bible" ? live.bible : (item?.pages?.list.filter((p) => live.hasVersions || !p.needsVersions) ?? []);
  return { list, shown: list.find((p) => p.id === kept) ?? list[0] };
}

const NO_PAGES = "oniric.nav.noPages";

const DAY_MS = 24 * 3600 * 1000;

// The views other than the screenplay and the dashboard are read when first opened, outside the main bundle.
const WorkshopView = lazy(() => import("../../script/workshop/ui/WorkshopView").then((m) => ({ default: m.WorkshopView })));
const BibleView = lazy(() => import("../../script/bible/ui/BibleView").then((m) => ({ default: m.BibleView })));
const StructureView = lazy(() => import("../../script/views/ui/StructureView").then((m) => ({ default: m.StructureView })));
const VersionsView = lazy(() => import("../../script/screenplay/ui/VersionsView").then((m) => ({ default: m.VersionsView })));
const MoodboardView = lazy(() => import("../../realisation/ui/MoodboardView").then((m) => ({ default: m.MoodboardView })));
const ShotlistView = lazy(() => import("../../realisation/ui/ShotlistView").then((m) => ({ default: m.ShotlistView })));
const TeamView = lazy(() => import("../../production/ui/TeamView").then((m) => ({ default: m.TeamView })));
const BreakdownView = lazy(() => import("../../production/ui/BreakdownView").then((m) => ({ default: m.BreakdownView })));
const BudgetView = lazy(() => import("../../production/ui/BudgetView").then((m) => ({ default: m.BudgetView })));
const ScoutingView = lazy(() => import("../../production/ui/ScoutingView").then((m) => ({ default: m.ScoutingView })));
const PermitsView = lazy(() => import("../../production/ui/PermitsView").then((m) => ({ default: m.PermitsView })));
const ScheduleView = lazy(() => import("../../production/ui/ScheduleView").then((m) => ({ default: m.ScheduleView })));
const CallSheetsView = lazy(() => import("../../production/ui/CallSheetsView").then((m) => ({ default: m.CallSheetsView })));
/** The contacts' imports, read when one is asked for. */
const contactImport = () => import("../../production/ui/ContactImport");
const ContactBookDialog = lazy(() => contactImport().then((m) => ({ default: m.ContactBookDialog })));
const TypeDialog = lazy(() => import("../../script/bible/ui/TypeEditor").then((m) => ({ default: m.TypeDialog })));
const SettingsScreen = lazy(() => import("./SettingsView").then((m) => ({ default: m.SettingsScreen })));

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
  const [teamHome, setTeamHome] = useState(0);
  const [scoutingHome, setScoutingHome] = useState(0);
  // The settings, shown in place of the views, and the page they open on.
  const [settings, setSettings] = useState<SettingsPage | null>(null);
  const closeSettings = useCallback(() => setSettings(null), []);
  // A new type of the Bible, asked for from its row in the side bar.
  const [newType, setNewType] = useState(false);
  const [contactBook, setContactBook] = useState(false);
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
          (view === "bible" || view === "workshop"
            ? view
            : view === "moodboard" || view === "shotlist"
              ? "realisation"
              : view === "team" || view === "breakdown" || view === "schedule" || view === "callsheets" || view === "budget" || view === "scouting" || view === "permits"
                ? "production"
                : "script"),
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

  // Sent to the script from elsewhere, one lands on the writing: the other pages, kept from last time, hide all or part of the text.
  const showScript = useCallback(() => {
    if (readStored<string>(PAGE_KEY.script, "text") !== "text") writeStored(PAGE_KEY.script, "text");
    setView("script");
  }, []);

  const openScene = useCallback(
    (id: string) => {
      showScript();
      requestAnimationFrame(() => session.editor?.goToSceneId(id));
    },
    [session, showScript],
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

  // One print at a time: WebView2 refuses a second one under way, and what goes on paper is whatever #print-root holds.
  const printQueue = useRef<Promise<unknown>>(Promise.resolve());
  const printPdf = useCallback(
    (
      fileName: string,
      content: ReactNode,
      page: { width: number; height: number; css?: string },
      quiet?: boolean,
    ): Promise<string | null> => {
      const job = printQueue.current.then(async () => {
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
          if (quiet) return path;
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
          return path;
        } catch (e) {
          if (quiet) throw e;
          notify({ text: describeError(e), tone: "error" });
          return null;
        } finally {
          setPrint(null);
        }
      });
      printQueue.current = job.catch(() => {});
      return job;
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
      go: (id: ViewId) => (id === "script" ? showScript() : setView(id)),
      openScene,
      openEntry,
      printPdf,
      headerActions,
      transfer,
      setTrail,
      openSettings: (page: SettingsPage = "appearance") => setSettings(page),
    }),
    [
      project,
      session,
      notify,
      ask,
      prompt,
      showScript,
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
  const contactFileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Folded to a rail of icons, and the sections folded in it: remembered on this computer.
  const [kept, setKept] = useStoredState("oniric.nav.rail", false);
  // The Découpage opens on the rail, to give its columns the room; unfolded there by hand, it stays so until one leaves.
  const [shotRail, setShotRail] = useState(true);
  useEffect(() => {
    if (view !== "shotlist") setShotRail(true);
  }, [view]);
  const rail = view === "shotlist" ? shotRail : kept;
  const setRail = view === "shotlist" ? setShotRail : setKept;
  const [foldedParts, setFoldedParts] = useStoredState<string[]>("oniric.nav.folded", []);
  // The view one is on shows its pages until folded by hand, and folds again when left, so the menu stays short;
  // those unfolded by hand stay so, remembered on this computer.
  const [openPages, setOpenPages] = useStoredState<string[]>("oniric.nav.pages", []);
  const [foldedHere, setFoldedHere] = useState(false);
  useEffect(() => setFoldedHere(false), [view]);
  const toggleOpen = (id: ViewId, open: boolean) => {
    if (id === view) setFoldedHere(open);
    setOpenPages(open ? openPages.filter((x) => x !== id) : id === view ? openPages : [...openPages, id]);
  };
  // The touched scenes of the Versions have nothing to show before a first version.
  const hasVersions = useLive(async () => (await listVersions()).length > 0, ["script_version"]) ?? false;
  // The Bible's pages are its types, and the removed types that still have entries.
  const bibleTypes = useLive(loadTypes, ["bible_type"]);
  const categories = useLive(async () => bibleCategories(await loadTypes(), await loadEntries()), ["bible_type", "bible_entry"]);
  const typeMenu = useCallback(
    (type: EntryType): MoreItem[] => {
      const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
      return [
        {
          label: t("bible.renameTypeShort"),
          icon: Pencil,
          onClick: async () => {
            const name = (await prompt(t("bible.renameType"), t("typeEditor.name"), type.name))?.trim();
            if (name && name !== type.name) void renameType(type, name).catch(fail);
          },
        },
        // The built-in types can change name, but other parts of the film count on them: they stay.
        ...(type.builtin
          ? []
          : [
              {
                label: t("common.delete"),
                icon: Trash2,
                danger: true,
                onClick: async () => {
                  if (await confirmRemoval(ask, { title: t("typeEditor.deleteAsk"), text: t("typeEditor.deleteText") })) void deleteType(type.id).catch(fail);
                },
              },
            ]),
      ];
    },
    [ask, prompt, notify],
  );
  const live = useMemo<LivePages>(
    () => ({
      hasVersions,
      bible: (categories ?? []).map((c) => ({ id: c.id, label: c.title, icon: iconOf(c.type), menu: c.type && typeMenu(c.type) })),
    }),
    [hasVersions, categories, typeMenu, i18n.language],
  );
  // A narrow window has room for the rail only.
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow);
  const railed = rail || narrow;
  // The theme on screen: following Windows, it is still one of the two.
  const [theme, setTheme] = useState(() => resolveTheme(getThemePreference()));
  useEffect(() => onThemePreference((p) => setTheme(resolveTheme(p))), []);
  const [palette, setPalette] = useState(false);

  /** A view from the side bar; the Bible leaves the entry it had open, and the team opens on its categories. */
  const goView = useCallback((id: ViewId) => {
    if (id === "bible") {
      setEntry(null);
      setBibleHome((n) => n + 1);
    }
    if (id === "team") setTeamHome((n) => n + 1);
    if (id === "scouting") setScoutingHome((n) => n + 1);
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
    // A page is found by its name, without crowding the list opened empty.
    const pages = NAV.filter((g) => !hiddenParts.includes(g.part)).flatMap((g) =>
      g.items.flatMap((item) =>
        pagesOf(item, live, "").list.map((p) => ({
          id: `page-${item.id}-${p.id}`,
          group: t("palette.views"),
          label: pageName(p),
          detail: `${g.label} · ${item.label}`,
          icon: p.icon,
          searchOnly: true,
          run: () => {
            writeStored(item.pages!.key, p.id);
            goView(item.id);
          },
        })),
      ),
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
      ...pages,
      action("new-type", t("bible.newType"), Plus, () => setNewType(true)),
      action("rename", t("shell.renameProject"), Pencil, () => void rename(), t("palette.kw.rename")),
      action("import", t("workspace.import"), FileInput, () => transfer("import"), t("palette.kw.import")),
      action("export", t("workspace.export"), FileOutput, () => transfer("export"), t("palette.kw.export")),
      { ...action("folder", t("shell.openFolder"), FolderOpen, () => void commands.reveal(project.dir, true), t("palette.kw.folder")), detail: project.dir },
      action("settings", t("shell.settings"), Settings, () => setSettings("appearance"), t("palette.kw.settings")),
      action("shortcuts", t("shell.shortcuts"), Keyboard, () => setSettings("shortcuts"), t("palette.kw.shortcuts")),
      action("light", t("palette.themeLight"), Sun, () => void setThemePreference("light"), t("palette.kw.light")),
      action("dark", t("palette.themeDark"), Moon, () => void setThemePreference("dark"), t("palette.kw.dark")),
      action("system", t("palette.themeSystem"), Monitor, () => void setThemePreference("system"), t("palette.kw.system")),
      ...LANGUAGES.filter((l) => l.id !== i18n.language).map((l) =>
        action(`language-${l.id}`, l.name, Languages, () => void setLanguage(l.id), t("palette.kw.language")),
      ),
      action("close", t("workspace.closeProject"), LogOut, onClose, t("palette.kw.close")),
    ];
  }, [hiddenParts, live, goView, transfer, onClose, rename, project.dir, i18n.language]);

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
      showScript();
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

  /** Where the people just brought in can be seen. */
  const showContacts = () => {
    writeStored(PAGE_KEY.team, "contacts");
    setView("team");
  };

  /** Adds the people of a CSV or vCard file, those already here left out. */
  const importContactsFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { importContactFile } = await contactImport();
      const r = await importContactFile(await file.text(), file.name);
      if (!r) return notify({ text: t("team.importNone"), tone: "error" });
      showContacts();
      notify({ text: t("team.imported", r) });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    } finally {
      if (contactFileRef.current) contactFileRef.current.value = "";
    }
  };

  return (
    <ProjectContext.Provider value={api}>
      <LockKeeper session={session} />
      <Reminders />
      {/* Hidden, not taken down: a view keeps its place and its unsaved text behind the settings. */}
      <div className="shell" hidden={settings !== null}>
        <nav
          className={railed ? "shell-nav rail" : "shell-nav"}
          aria-label={t("shell.views")}
        >
          <div className="shell-nav-top" onMouseDown={dragWindow}>
            <ProjectMenu
              title={project.title}
              dir={project.dir}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              onRename={() => void rename()}
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
                  label: t("shell.openFolder"),
                  icon: FolderOpen,
                  onClick: () => void commands.reveal(project.dir, true),
                },
                {
                  label: t("shell.settings"),
                  icon: Settings,
                  onClick: () => setSettings("appearance"),
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
            <kbd className="nav-keys" aria-hidden="true">
              Ctrl K
            </kbd>
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
          <input
            ref={contactFileRef}
            type="file"
            className="contact-import"
            accept=".csv,.vcf,.vcard,text/csv,text/vcard"
            hidden
            onChange={(e) => void importContactsFile(e.target.files?.[0])}
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
                      {shown.map((item) =>
                        item.pages ? (
                          item.id === "bible" ? (
                            <BibleNavGroup
                              key={item.id}
                              session={session}
                              item={item}
                              on={view === item.id}
                              open={view === item.id ? !railed && !foldedHere : !railed && openPages.includes(item.id)}
                              shown={view === item.id && railed}
                              live={live}
                              onAdd={{ label: t("bible.newType"), hint: t("bible.newTypeHint"), run: () => setNewType(true) }}
                              onToggle={(open) => toggleOpen(item.id, open)}
                              onGo={() => goView(item.id)}
                            />
                          ) : (
                            <NavGroup
                              key={item.id}
                              item={item}
                              on={view === item.id}
                              // On the rail, only the view one is on shows its pages.
                              open={view === item.id ? railed || !foldedHere : !railed && openPages.includes(item.id)}
                              live={live}
                              onToggle={(open) => toggleOpen(item.id, open)}
                              onGo={() => goView(item.id)}
                            />
                          )
                        ) : (
                          <li key={item.id}>
                            <NavButton
                              item={item}
                              on={view === item.id}
                              onClick={() => goView(item.id)}
                            />
                          </li>
                        ),
                      )}
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
            trail={trail}
            live={live}
            actionsRef={setHeaderActions}
          />
          <div className="shell-main">
            <div className="view-host" hidden={view !== "script"}>
              <ScreenplayWorkspace active={view === "script"} />
            </div>
            {view === "dashboard" && <DashboardView />}
            <Suspense fallback={null}>
              {view === "workshop" && <WorkshopView />}
              {view === "bible" && (
                <BibleView selected={entry} onSelected={setEntry} home={bibleHome} />
              )}
              {view === "structure" && <StructureView />}
              {view === "versions" && <VersionsView />}
              {view === "moodboard" && <MoodboardView />}
              {view === "shotlist" && <ShotlistView />}
              {view === "team" && <TeamView home={teamHome} />}
              {view === "breakdown" && <BreakdownView />}
              {view === "schedule" && <ScheduleView />}
              {view === "callsheets" && <CallSheetsView />}
              {view === "budget" && <BudgetView />}
              {view === "scouting" && <ScoutingView home={scoutingHome} />}
              {view === "permits" && <PermitsView />}
            </Suspense>
          </div>

        </div>
      </div>

      {print && (
        <div id="print-root" aria-hidden="true">
          <style>{print.css}</style>
          {print.content}
        </div>
      )}
      {settings && (
        <Suspense fallback={null}>
          <SettingsScreen page={settings} onClose={closeSettings} />
        </Suspense>
      )}
      {transferReq && (
        <TransferDialog
          mode={transferReq.mode}
          section={transferReq.section}
          option={view === "moodboard" ? "moodboard-pdf" : undefined}
          onImport={(kind) => {
            if (kind === "contacts-book") setContactBook(true);
            else (kind === "script" ? fileRef : kind === "bible" ? bibleFileRef : contactFileRef).current?.click();
          }}
          onClose={() => setTransferReq(null)}
        />
      )}
      {contactBook && (
        <Suspense fallback={null}>
          <ContactBookDialog
            onClose={() => setContactBook(false)}
            onTaken={() => {
              setContactBook(false);
              showContacts();
            }}
          />
        </Suspense>
      )}
      {palette && (
        <CommandPalette
          items={paletteItems}
          scenes={session.snapshot?.headings ?? []}
          onScene={(i) => {
            showScript();
            requestAnimationFrame(() => session.editor?.goToScene(i));
          }}
          onEntry={openEntry}
          onClose={() => setPalette(false)}
        />
      )}
      {promptReq && (
        <PromptDialog req={promptReq} onDone={() => setPromptReq(null)} />
      )}
      {newType && (
        <Suspense fallback={null}>
          <TypeDialog
            types={bibleTypes ?? []}
            onClose={(id) => {
              setNewType(false);
              if (!id) return;
              // A new type is shown at once, waiting for its first entry.
              writeStored(PAGE_KEY.bible, id);
              setFoldedHere(false);
              goView("bible");
            }}
          />
        </Suspense>
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

/** The project's name at the top of the side bar, opening the project actions: rename beside the name, then import,
 *  export, folder, settings. */
function ProjectMenu({
  title,
  dir,
  open,
  onOpenChange,
  onRename,
  items,
}: {
  title: string;
  dir: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRename: () => void;
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
            <button
              type="button"
              role="menuitem"
              className="project-menu-rename"
              aria-label={t("shell.renameProject")}
              title={t("shell.renameProject")}
              onClick={() => {
                onOpenChange(false);
                onRename();
              }}
            >
              <Pencil aria-hidden="true" />
            </button>
          </div>
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

const NARROW = window.matchMedia("screen and (max-width: 1180px)");
const PRINTING = window.matchMedia("print");
// While a PDF is printed, the media queries answer for the sheet of paper, not for the window: the last answer holds.
let narrowNow = NARROW.matches;
const readNarrow = () => {
  if (!PRINTING.matches) narrowNow = NARROW.matches;
  return narrowNow;
};
const subscribeNarrow = (onChange: () => void) => {
  NARROW.addEventListener("change", onChange);
  return () => NARROW.removeEventListener("change", onChange);
};

type Shown = "light" | "dark";
/** The theme button swaps one for the other. */
const THEME_NEXT: Record<Shown, Shown> = { light: "dark", dark: "light" };

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

type NavGroupProps = {
  item: NavItem;
  on: boolean;
  open: boolean;
  live: LivePages;
  onAdd?: { label: string; hint: string; run: () => void };
  /** How many things each page holds, right of its name. */
  counts?: Map<string, number>;
  onToggle: (open: boolean) => void;
  onGo: () => void;
};

/**
 * The Bible in the side bar: its types with how many cards each shows, the same number as on the page. Counted only
 * unfolded, and a moment after the typing stops: the names are looked for in the whole screenplay.
 */
function BibleNavGroup({ session, shown, ...group }: Omit<NavGroupProps, "counts"> & { session: ScriptSession; shown: boolean }) {
  const entries = useLive(loadEntries, ["bible_entry"]);
  const scenes = useScenes(session);
  const [counts, setCounts] = useState<Map<string, number>>();
  useEffect(() => {
    if (!group.open || !entries) return;
    const wait = setTimeout(() => setCounts(cardCounts(sceneTexts(scenes), entries)), counts ? 300 : 0);
    return () => clearTimeout(wait);
  }, [group.open, entries, scenes]);
  return <NavGroup {...group} open={group.open || shown} counts={counts} />;
}

/**
 * A view with pages: its row goes to it and unfolds them, or folds them again when already there; the chevron only
 * folds and unfolds, and `onAdd` puts a « + » before it that makes a new page. Pages have their names unfolded, their
 * icons on the rail.
 */
function NavGroup({ item, on, open, live, onAdd, counts, onToggle, onGo }: NavGroupProps) {
  const [kept, keep] = useStoredState(item.pages!.key, "");
  const { list, shown } = pagesOf(item, live, kept);
  const Icon = item.icon;
  return (
    <li className="nav-group">
      <div className={onAdd ? "nav-row with-add" : "nav-row"}>
        <button
          type="button"
          className={on ? (open ? "nav-link within" : "nav-link on") : "nav-link"}
          aria-current={on && !open ? "page" : on ? "true" : undefined}
          title={item.label}
          onClick={() => {
            if (on) onToggle(open);
            onGo();
          }}
        >
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </button>
        {onAdd && (
          <button type="button" className="nav-unfold nav-add" aria-label={onAdd.label} title={onAdd.hint} onClick={onAdd.run}>
            <Plus aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="nav-unfold"
          aria-expanded={open}
          aria-label={t(open ? "shell.foldPages" : "shell.unfoldPages", { view: item.label })}
          title={t(open ? "shell.foldPages" : "shell.unfoldPages", { view: item.label })}
          onClick={() => onToggle(open)}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
      <div className={open ? "nav-pages open" : "nav-pages"}>
        <ul>
          {list.map((p) => {
            const PageIcon = p.icon;
            const here = on && p.id === shown?.id;
            return (
              <li key={p.id} className={p.menu ? "nav-page" : undefined}>
                <button
                  type="button"
                  className={here ? "nav-link nav-sub on" : "nav-link nav-sub"}
                  aria-current={here ? "page" : undefined}
                  title={p.hint ? t(p.hint) : pageName(p)}
                  onClick={() => {
                    keep(p.id);
                    onGo();
                  }}
                >
                  <PageIcon aria-hidden="true" />
                  <span>{pageName(p)}</span>
                  {counts && <span className="nav-count">{counts.get(p.id) ?? 0}</span>}
                </button>
                {p.menu && <MoreMenu className="nav-page-more" label={t("bible.typeMenu", { name: pageName(p) })} items={p.menu} />}
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

/**
 * The band at the top of the window, which moves it: where the user is (project › part › view › page), the view's own
 * tools, then the window's buttons.
 */
function ViewHeader({
  project,
  view,
  trail,
  live,
  actionsRef,
}: {
  project: OpenState;
  view: ViewId;
  trail: Crumb[] | null;
  live: LivePages;
  actionsRef: (el: HTMLElement | null) => void;
}) {
  const group = NAV.find((g) => g.items.some((i) => i.id === view));
  const item = group?.items.find((i) => i.id === view);
  const [kept] = useStoredState(item?.pages?.key ?? NO_PAGES, "");
  const page = pagesOf(item, live, kept).shown;
  const label = view === "dashboard" ? DASHBOARD.label : page ? pageName(page) : (item?.label ?? t("shell.settings"));
  // A view that went down a level (an act on the board…) names it; the levels above become links.
  const here = trail?.at(-1);
  const count = here?.count;
  return (
    <header className="view-header" onMouseDown={dragWindow}>
      <nav className="view-header-text" aria-label={t("shell.crumbs")}>
        <ol className="crumbs">
          <li>{project.title}</li>
          {group && (
            <li>
              <ChevronRight aria-hidden="true" />
              {group.label}
            </li>
          )}
          {page && (
            <li>
              <ChevronRight aria-hidden="true" />
              {item?.label}
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
        <ChevronRight aria-hidden="true" />
        <h1 className="view-title">
          <span className="view-title-text">{here?.label ?? label}</span>
          {count !== undefined && count > 0 && (
            <span className="count">{count}</span>
          )}
        </h1>
      </nav>
      <div ref={actionsRef} className="view-header-actions" />
      <WindowControls />
    </header>
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
