import {
  ArrowLeft,
  Clapperboard,
  Copy,
  DatabaseBackup,
  FileText,
  Info,
  Keyboard,
  LayoutGrid,
  Palette,
  PenLine,
  Ruler,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { commands, type BackupState, type Settings } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { describeError } from "../../../core/errors";
import { dateFormat, LANGUAGES, numberFormat, setLanguage, t, type Language } from "../../../core/i18n";
import {
  getThemePreference,
  onThemePreference,
  setThemePreference,
  type ThemePreference,
} from "../../../core/theme";
import { setWritingPrefs, useWritingPrefs, type WritingPrefs } from "../../../core/writingPrefs";
import { uuidv7 } from "../../../core/ids";
import { confirmRemoval, Dialog, useChoice } from "../../../ui-kit/Dialog";
import { dragWindow, WindowControls } from "../../../ui-kit/TitleBar";
import { Labeled } from "../../../ui-kit/Form";
import type { ToastMessage } from "../../../ui-kit/Toast";
import { readProfile, writeProfile, EMPTY_PROFILE, type Profile } from "../application/profile";
import {
  availableFormats,
  loadFormatLibrary,
  saveFormatLibrary,
  useScriptFormat,
  writeProjectFormat,
} from "../../script/screenplay/application/formatSettings";
import { useSceneNumbers, writeSceneNumbers, type SceneNumbers } from "../../script/screenplay/application/sceneNumbers";
import {
  readSetting,
  writeSetting,
} from "../../script/screenplay/application/settings";
import {
  ELEMENT_TYPES,
  FORMATS,
  FORMAT_KINDS,
  formatHelp,
  formatName,
  groupFormats,
  type FormatLanguage,
  type ScreenplayFormat,
} from "../../script/screenplay/domain/formats";
import { ProjectContext, type SettingsPage } from "./projectContext";
import { useNumbering, writeNumbering } from "../../realisation/application/shots";
import { columnLabel, DEFAULT_HIDDEN, FOCUS_KEY, HIDDEN_KEY, ORDER_KEY, SHOT_COLUMNS, type ShotColumn, type ShotOrder } from "../../realisation/ui/ShotlistView";
import type { ShotNumbering } from "../../realisation/domain/shots";
import { useStoredState } from "../../../ui-kit/useStoredState";

import { Select } from "../../../ui-kit/Select";
export const PARTS_HIDDEN_SETTING = "parts_hidden";

type Notify = (m: Omit<ToastMessage, "id">) => void;

const SOURCE_URL = "https://github.com/evan-guillet/Oniric";

const dates = () => dateFormat({ dateStyle: "medium", timeStyle: "short" });
/** The kinds of copy, as the backup files name them. */
const KINDS = new Set(["auto", "fermeture", "manuelle"]);
const kindLabel = (k: string) =>
  KINDS.has(k) ? t(`settings.kind.${k}`) : k.startsWith("avant-migration") ? t("settings.kind.migration") : k;
const sizeLabel = (b: number) =>
  b > 1e6
    ? t("settings.mb", { n: numberFormat({ maximumFractionDigits: 1 }).format(b / 1e6) })
    : t("settings.kb", { n: Math.max(1, Math.round(b / 1e3)) });

type PageId = SettingsPage;

interface Page {
  id: PageId;
  label: string;
  icon: LucideIcon;
  /** One line under the title of the page. */
  lead: string;
  /** The settings of the page and other words the search box matches. */
  keywords: string;
}


const PAGE_ICONS: Record<PageId, LucideIcon> = {
  profile: UserRound,
  appearance: Palette,
  writing: PenLine,
  formats: Ruler,
  backups: DatabaseBackup,
  shortcuts: Keyboard,
  script: FileText,
  shotlist: Clapperboard,
  parts: LayoutGrid,
  about: Info,
};

/** A page, its texts in the language of the moment. */
function pageOf(id: PageId): Page {
  return {
    id,
    icon: PAGE_ICONS[id],
    label: t(`settings.pages.${id}.label`),
    lead: t(`settings.pages.${id}.lead`),
    keywords: t(`settings.pages.${id}.keywords`),
  };
}

const GROUPS: { id: string; pages: PageId[]; projectOnly?: boolean }[] = [
  { id: "application", pages: ["profile", "appearance", "writing", "formats", "backups", "shortcuts"] },
  { id: "project", projectOnly: true, pages: ["script", "shotlist", "parts"] },
];

const fold = (x: string) =>
  x
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * The settings, opened over the current screen: the pages in a side column with a search box, the chosen one on the
 * right, each setting on a row with what it does on the left and its control on the right. Reachable from the home
 * screen too, without the pages of the project.
 */
/**
 * The settings, as a page of the window rather than a box over it: the pages on the left, the chosen one on the
 * right. Retour or Échap gives the window back to what it showed.
 */
export function SettingsScreen({
  page: initialPage = "profile",
  onClose,
  notify: notifyProp,
  onOpenProject,
}: {
  /** The page it opens on. */
  page?: PageId;
  onClose: () => void;
  notify?: Notify;
  onOpenProject?: (dir: string) => void;
}) {
  const ctx = useContext(ProjectContext);
  const notify = ctx?.notify ?? notifyProp ?? (() => {});
  const searchRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<PageId>(initialPage);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // The focus was in what the page now covers: it starts on the search, and goes back there on leaving.
    const before = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A window opened from a setting closes first.
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      // Before the views it covers, which take Échap for their own.
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const q = fold(search.trim());
  const matches = (id: PageId) => !q || fold(`${pageOf(id).label} ${pageOf(id).keywords}`).includes(q);
  const groups = GROUPS.filter((g) => !g.projectOnly || ctx)
    .map((g) => ({ ...g, pages: g.pages.filter(matches) }))
    .filter((g) => g.pages.length > 0);
  const aboutShown = matches("about");
  const current = pageOf(page);

  const openProject =
    onOpenProject &&
    ((dir: string) => {
      onClose();
      onOpenProject(dir);
    });

  const link = (id: PageId) => {
    const p = pageOf(id);
    return (
      <button
        type="button"
        className={id === page ? "nav-link on" : "nav-link"}
        aria-current={id === page ? "page" : undefined}
        onClick={() => setPage(id)}
      >
        <p.icon aria-hidden="true" />
        <span>{p.label}</span>
      </button>
    );
  };

  return (
    <div className="settings-page" role="region" aria-label={t("shell.settings")}>
      <nav className="settings-nav" aria-label={t("settings.pagesNav")}>
        <div className="settings-nav-top" onMouseDown={ctx ? dragWindow : undefined}>
          <button
            type="button"
            className="settings-back"
            aria-label={t("settings.closeSettings")}
            title={t("settings.closeTitle")}
            onClick={onClose}
          >
            <ArrowLeft aria-hidden="true" />
            <span>{t("settings.back")}</span>
          </button>
        </div>
        <label className="settings-search">
          <Search aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            placeholder={t("settings.search")}
            aria-label={t("settings.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Entrée opens the first page found.
              const first = groups[0]?.pages[0] ?? (aboutShown ? "about" : null);
              if (e.key === "Enter" && first) setPage(first);
            }}
          />
        </label>
        {groups.map((g) => (
          <section key={g.id}>
            <h2 title={g.projectOnly ? ctx?.project.title : undefined}>{t(`settings.groups.${g.id}`)}</h2>
            <ul>
              {g.pages.map((id) => (
                <li key={id}>{link(id)}</li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && !aboutShown && (
          <p className="muted small settings-none">{t("settings.none")}</p>
        )}
        {aboutShown && <div className="settings-nav-foot">{link("about")}</div>}
      </nav>
      <div className="settings-pane">
        <header className="settings-pane-head" onMouseDown={ctx ? dragWindow : undefined}>
          <div className="settings-pane-title">
            <h1>{current.label}</h1>
            <p>{current.lead}</p>
          </div>
          {/* In a project there is no title bar: the head moves the window and holds its buttons. */}
          {ctx && <WindowControls />}
        </header>
        <div className="settings-pane-body" key={page}>
          {page === "profile" && <ProfileSettings notify={notify} />}
          {page === "appearance" && <AppearanceSettings notify={notify} />}
          {page === "writing" && <WritingSettings notify={notify} />}
          {page === "formats" && <FormatSettings notify={notify} inProject={!!ctx} />}
          {page === "backups" && (
            <BackupSettings
              notify={notify}
              inProject={!!ctx}
              onOpenProject={openProject}
            />
          )}
          {page === "shortcuts" && <ShortcutSettings />}
          {page === "script" && ctx && <ScriptSettings notify={notify} />}
          {page === "shotlist" && ctx && <ShotlistSettings notify={notify} />}
          {page === "parts" && ctx && <PartsSettings />}
          {page === "about" && <AboutSettings notify={notify} />}
        </div>
      </div>
    </div>
  );
}

/** A titled run of settings rows, in one framed block. */
function Group({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="set-group">
      {(title || aside) && (
        <div className="set-group-head">
          {title && <h2>{title}</h2>}
          {aside}
        </div>
      )}
      <div className="set-card">{children}</div>
    </section>
  );
}

/** One setting: what it is and what it does on the left, its control on the right (or under it, when `stack`). */
function Row({
  title,
  help,
  children,
  id,
  stack,
}: {
  title: ReactNode;
  help?: ReactNode;
  children?: ReactNode;
  /** The id of the control, so that its name is the row's title. */
  id?: string;
  stack?: boolean;
}) {
  return (
    <div className={stack ? "set-row stack" : "set-row"}>
      <div className="set-row-text">
        {id ? (
          <label className="set-row-title" htmlFor={id}>
            {title}
          </label>
        ) : (
          <span className="set-row-title">{title}</span>
        )}
        {help && <p className="set-row-help">{help}</p>}
      </div>
      {children && <div className="set-row-control">{children}</div>}
    </div>
  );
}

function Switch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="switch"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

/** A number with its unit after it, saved when the field is left or Entrée is pressed. */
function NumberField({
  id,
  value,
  unit,
  min,
  max,
  onSave,
}: {
  id: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onSave: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft.replace(",", ".")));
    const v = Number.isFinite(n) && draft.trim() !== "" ? Math.min(max, Math.max(min, n)) : value;
    setDraft(String(v));
    if (v !== value) onSave(v);
  };
  return (
    <span className="unit-field">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <span aria-hidden="true">{unit}</span>
    </span>
  );
}

const profileFields = (): { key: keyof Profile; label: string; help?: string; multiline?: boolean; type?: string }[] => [
  { key: "name", label: t("settings.profile.name"), help: t("settings.profile.nameHelp") },
  { key: "email", label: t("settings.profile.email"), type: "email" },
  { key: "phone", label: t("settings.profile.phone"), type: "tel" },
  { key: "address", label: t("settings.profile.address"), multiline: true },
  { key: "agent", label: t("settings.profile.agent"), help: t("settings.profile.agentHelp"), multiline: true },
];

function ProfileSettings({ notify }: { notify: Notify }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Profile | null>(null);
  useEffect(() => {
    void readProfile()
      .then(setProfile)
      .catch(() => setProfile(EMPTY_PROFILE));
  }, []);
  const flush = () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) writeProfile(p).catch((e) => notify({ text: describeError(e), tone: "error" }));
  };
  // Saved as it is typed, and at the latest when the page closes.
  useEffect(() => () => flush(), []);
  if (!profile) return null;
  const set = (key: keyof Profile, value: string) => {
    const next = { ...profile, [key]: value };
    setProfile(next);
    pending.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
  };
  const contact = [profile.name, profile.address, profile.phone, profile.email, profile.agent].filter((x) => x.trim());

  return (
    <>
      <Group title={t("settings.contactDetails")}>
        {profileFields().map((f) => (
          <Row key={f.key} id={`profile-${f.key}`} title={f.label} help={f.help}>
            {f.multiline ? (
              <textarea
                id={`profile-${f.key}`}
                rows={2}
                value={profile[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                onBlur={flush}
              />
            ) : (
              <input
                id={`profile-${f.key}`}
                type={f.type ?? "text"}
                value={profile[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                onBlur={flush}
                spellCheck={false}
              />
            )}
          </Row>
        ))}
      </Group>
      <Group title={t("settings.onTitlePage")}>
        <div className="profile-sheet" aria-label={t("settings.printedContact")}>
          <div className="profile-sheet-by">
            {profile.name.trim() ? (
              <>
                {t("settings.writtenBy")}
                <br />
                <br />
                {profile.name}
              </>
            ) : (
              <span className="muted">{t("settings.nameHere")}</span>
            )}
          </div>
          <div className="profile-sheet-contact">
            {contact.length > 0 ? contact.join("\n") : <span className="muted">{t("settings.contactHere")}</span>}
          </div>
        </div>
        <p className="set-note">{t("settings.profileNote")}</p>
      </Group>
    </>
  );
}

const themes = (): { id: ThemePreference; label: string; help: string }[] => [
  { id: "system", label: t("settings.themes.system"), help: t("settings.themes.systemHelp") },
  { id: "light", label: t("settings.themes.light"), help: t("settings.themes.lightHelp") },
  { id: "dark", label: t("settings.themes.dark"), help: t("settings.themes.darkHelp") },
];

function AppearanceSettings({ notify }: { notify: Notify }) {
  const [theme, setTheme] = useState(getThemePreference);
  useEffect(() => onThemePreference(setTheme), []);
  const choose = (p: ThemePreference) =>
    setThemePreference(p).catch((e) =>
      notify({ text: describeError(e), tone: "error" }),
    );
  return (
    <>
    <section className="set-group">
      <div className="set-group-head">
        <h2>{t("settings.theme")}</h2>
      </div>
      <div className="theme-options" role="radiogroup" aria-label={t("settings.theme")}>
        {themes().map((o) => (
          <label
            key={o.id}
            className={`theme-option${theme === o.id ? " on" : ""}`}
          >
            <input
              type="radio"
              name="theme"
              value={o.id}
              checked={theme === o.id}
              onChange={() => void choose(o.id)}
            />
            <span className="theme-preview" aria-hidden="true">
              {o.id === "system" ? (
                <>
                  <ThemeMiniature tone="light" />
                  <ThemeMiniature tone="dark" half />
                </>
              ) : (
                <ThemeMiniature tone={o.id} />
              )}
            </span>
            <span className="theme-option-text">
              <strong>{o.label}</strong>
              <span className="muted small">{o.help}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="set-note">{t("settings.themeNote")}</p>
    </section>
    <LanguageSettings notify={notify} />
    </>
  );
}

/** The language of the interface; the screenplay keeps the language of its format. */
function LanguageSettings({ notify }: { notify: Notify }) {
  const { i18n } = useTranslation();
  return (
    <Group title={t("settings.language")}>
      <Row title={t("settings.languageRow")} help={t("settings.languageHelp")}>
        <Select
          aria-label={t("settings.languageRow")}
          value={i18n.language}
          onChange={(e) =>
            void setLanguage(e.target.value as Language).catch((x) => notify({ text: describeError(x), tone: "error" }))
          }
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id} lang={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Row>
    </Group>
  );
}

/** A tiny picture of the script view in one theme. */
function ThemeMiniature({
  tone,
  half,
}: {
  tone: "light" | "dark";
  half?: boolean;
}) {
  return (
    <span className={`tp ${tone}${half ? " half" : ""}`}>
      <span className="tp-side" />
      <span className="tp-desk">
        <span className="tp-sheet" />
      </span>
    </span>
  );
}

const typographyChoices = (): { id: WritingPrefs["typography"]; label: string }[] => [
  { id: "auto", label: t("settings.typography.auto") },
  { id: "on", label: t("settings.typography.on") },
  { id: "off", label: t("settings.typography.off") },
];

function WritingSettings({ notify }: { notify: Notify }) {
  const prefs = useWritingPrefs();
  const set = (patch: Partial<WritingPrefs>) =>
    setWritingPrefs(patch).catch((e) => notify({ text: describeError(e), tone: "error" }));
  return (
    <>
      <Group title={t("settings.whileTyping")}>
        <Row
          id="w-typewriter"
          title={t("settings.typewriter")}
          help={t("settings.typewriterHelp")}
        >
          <Switch id="w-typewriter" checked={prefs.typewriter} onChange={(v) => void set({ typewriter: v })} />
        </Row>
        <Row
          id="w-spell"
          title={t("settings.spellcheck")}
          help={t("settings.spellcheckHelp")}
        >
          <Switch id="w-spell" checked={prefs.spellcheck} onChange={(v) => void set({ spellcheck: v })} />
        </Row>
        <Row
          title={t("settings.typographyRow")}
          help={t("settings.typographyHelp")}
        >
          <Select
            aria-label={t("settings.typographyRow")}
            value={prefs.typography}
            onChange={(e) => void set({ typography: e.target.value as WritingPrefs["typography"] })}
          >
            {typographyChoices().map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Row>
      </Group>
      <Group title={t("settings.onScreen")}>
        <Row id="w-cards" title={t("script.cards")} help={t("script.cardsHint")}>
          <Switch id="w-cards" checked={prefs.cards} onChange={(v) => void set({ cards: v })} />
        </Row>
        <Row id="w-links" title={t("script.links")} help={t("script.linksHint")}>
          <Switch id="w-links" checked={prefs.links} onChange={(v) => void set({ links: v })} />
        </Row>
        <Row id="w-pin" title={t("script.pin")} help={t("script.pinHint")}>
          <Switch id="w-pin" checked={prefs.pin} onChange={(v) => void set({ pin: v })} />
        </Row>
      </Group>
      <Group title={t("settings.goal")}>
        <Row
          id="w-goal"
          title={t("settings.goalRow")}
          help={t("settings.goalHelp")}
        >
          <NumberField
            id="w-goal"
            value={prefs.dailyGoal}
            unit={t("settings.unitWords")}
            min={0}
            max={20000}
            onSave={(v) => void set({ dailyGoal: v })}
          />
        </Row>
      </Group>
    </>
  );
}

const CM = 2.54;
const cm = (inch: number) => Math.round(inch * CM * 100) / 100;
const inch = (c: number) => c / CM;

function FormatSettings({ notify, inProject }: { notify: Notify; inProject: boolean }) {
  const { t } = useTranslation();
  const [choice, ask] = useChoice();
  const [library, setLibrary] = useState<ScreenplayFormat[] | null>(null);
  const [editing, setEditing] = useState<ScreenplayFormat | null>(null);
  const projectFormat = useScriptFormat();
  const used = inProject ? projectFormat?.id : undefined;
  useEffect(() => {
    void loadFormatLibrary().then(setLibrary);
  }, []);
  if (!library) return null;

  const persist = async (next: ScreenplayFormat[]) => {
    setLibrary(next);
    try {
      await saveFormatLibrary(next);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  const duplicate = (f: ScreenplayFormat) =>
    setEditing({ ...structuredClone(f), id: `perso-${uuidv7()}`, name: t("settings.copyName", { name: formatName(f) }) });
  const usedBadge = (id: string) => used === id && <span className="badge set-badge">{t("settings.groups.project")}</span>;

  return (
    <>
      <Group title={t("settings.myFormats")}>
        {library.length === 0 ? (
          <Row title={t("settings.noFormat")} help={t("settings.noFormatHelp")} />
        ) : (
          library.map((f) => (
            <Row
              key={f.id}
              title={
                <>
                  {f.name}
                  {usedBadge(f.id)}
                </>
              }
              help={t("settings.customHelp", { paper: f.paper === "A4" ? "A4" : "Letter (US)" })}
            >
              <button type="button" className="btn small" onClick={() => setEditing(structuredClone(f))}>
                {t("settings.edit")}
              </button>
              <button type="button" className="btn small" onClick={() => duplicate(f)}>
                {t("settings.duplicate")}
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={async () => {
                  if (await confirmRemoval(ask, { title: t("settings.deleteFormat", { name: f.name }), text: t("settings.deleteFormatText") }))
                    await persist(library.filter((x) => x.id !== f.id));
                }}
              >
                {t("common.delete")}
              </button>
            </Row>
          ))
        )}
      </Group>
      {FORMAT_KINDS.map((k) => (
        <Group key={k.id} title={k.label}>
          {FORMATS.filter((f) => (f.kind ?? "film") === k.id).map((f) => (
            <Row
              key={f.id}
              title={
                <>
                  {formatName(f)}
                  {usedBadge(f.id)}
                </>
              }
              help={formatHelp(f)}
            >
              <button type="button" className="btn small" onClick={() => duplicate(f)}>
                {t("settings.duplicate")}
              </button>
            </Row>
          ))}
        </Group>
      ))}
      <p className="set-note">{t("settings.formatsNote")}</p>
      {choice}
      {editing && (
        <FormatEditor
          format={editing}
          elementLabel={(type) => t(`elements.${type}`)}
          onCancel={() => setEditing(null)}
          onSave={(f) => {
            void persist(
              library.some((x) => x.id === f.id)
                ? library.map((x) => (x.id === f.id ? f : x))
                : [...library, f],
            );
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 0.05,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="num">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function FormatEditor({
  format,
  elementLabel,
  onCancel,
  onSave,
}: {
  format: ScreenplayFormat;
  elementLabel: (t: string) => string;
  onCancel: () => void;
  onSave: (f: ScreenplayFormat) => void;
}) {
  const [f, setF] = useState(format);
  const set = (patch: Partial<ScreenplayFormat>) =>
    setF((x) => ({ ...x, ...patch }));
  const paper = f.page.width < 8.4 ? "A4" : "Letter";
  return (
    <Dialog
      title={t("settings.customFormat")}
      wide
      onCancel={onCancel}
      actions={[
        { label: t("common.cancel"), onClick: onCancel },
        {
          label: t("common.save"),
          primary: true,
          disabled: !f.name.trim(),
          onClick: () => onSave({ ...f, name: f.name.trim(), paper }),
        },
      ]}
    >
      <div className="format-editor">
        <Labeled label={t("settings.profile.name")} wide>
          <input
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Labeled>
        <div className="input-row">
          <Labeled label={t("settings.paper")}>
            <Select
              value={paper}
              onChange={(e) =>
                set({
                  page:
                    e.target.value === "A4"
                      ? { width: 8.2677, height: 11.6929 }
                      : { width: 8.5, height: 11 },
                })
              }
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter (US)</option>
            </Select>
          </Labeled>
          <Labeled label={t("settings.formatLanguage")}>
            <Select
              value={f.language}
              onChange={(e) => set({ language: e.target.value as FormatLanguage })}
            >
              <option value="fr">{t("languages.fr")}</option>
              <option value="en">{t("languages.en")}</option>
              <option value="de">{t("languages.de")}</option>
              <option value="es">{t("languages.es")}</option>
            </Select>
          </Labeled>
          <Num
            label={t("settings.size")}
            step={0.5}
            value={f.fontSizePt}
            onChange={(v) => set({ fontSizePt: v, lineHeightPt: v })}
          />
        </div>
        <fieldset className="field">
          <legend>{t("settings.margins")}</legend>
          <div className="input-row">
            {(["top", "bottom", "left", "right"] as const).map((k) => (
              <Num
                key={k}
                label={t(`settings.margin.${k}`)}
                value={cm(f.margins[k])}
                onChange={(v) =>
                  set({ margins: { ...f.margins, [k]: inch(v) } })
                }
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>{t("settings.elements")}</legend>
          <table className="table compact">
            <thead>
              <tr>
                <th />
                <th>{t("settings.indent")}</th>
                <th>{t("settings.width")}</th>
                <th>{t("settings.linesBefore")}</th>
                <th>{t("settings.uppercase")}</th>
              </tr>
            </thead>
            <tbody>
              {ELEMENT_TYPES.map((type) => {
                const e = f.elements[type];
                const setEl = (patch: Partial<typeof e>) =>
                  set({
                    elements: { ...f.elements, [type]: { ...e, ...patch } },
                  });
                return (
                  <tr key={type}>
                    <td>{elementLabel(type)}</td>
                    <td>
                      <input
                        type="number"
                        step={0.05}
                        value={cm(e.indent)}
                        onChange={(x) =>
                          setEl({ indent: inch(Number(x.target.value)) })
                        }
                        aria-label={t("settings.indent")}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step={0.05}
                        value={cm(e.width)}
                        onChange={(x) =>
                          setEl({ width: inch(Number(x.target.value)) })
                        }
                        aria-label={t("settings.width")}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={3}
                        value={e.spaceBefore}
                        onChange={(x) =>
                          setEl({ spaceBefore: Number(x.target.value) })
                        }
                        aria-label={t("settings.linesBefore")}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={e.uppercase}
                        onChange={(x) => setEl({ uppercase: x.target.checked })}
                        aria-label={t("settings.uppercase")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </fieldset>
        <div className="input-row">
          <Labeled label={t("settings.more")}>
            <input
              value={f.labels.more}
              onChange={(e) =>
                set({ labels: { ...f.labels, more: e.target.value } })
              }
            />
          </Labeled>
          <Labeled label={t("settings.contd")}>
            <input
              value={f.labels.contd}
              onChange={(e) =>
                set({ labels: { ...f.labels, contd: e.target.value } })
              }
            />
          </Labeled>
        </div>
      </div>
    </Dialog>
  );
}

function BackupSettings({
  notify,
  inProject,
  onOpenProject,
}: {
  notify: Notify;
  inProject: boolean;
  onOpenProject?: (dir: string) => void;
}) {
  const [state, setState] = useState<BackupState | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      setState(unwrap(await commands.backupState()));
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  if (!state) return null;
  const s = state.settings;

  const save = async (next: Settings) => {
    try {
      unwrap(await commands.backupSettingsSet(next));
      await refresh();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const chooseDir = async () => {
    const dir = await open({
      directory: true,
      title: t("settings.backupsDir"),
      defaultPath: state.root,
    });
    if (typeof dir === "string") await save({ ...s, dir });
  };

  const now = async () => {
    setBusy(true);
    try {
      unwrap(await commands.backupNow());
      notify({ text: t("backup.done") });
      await refresh();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: string) => {
    const parent = await open({
      directory: true,
      title: t("settings.restoreWhere"),
    });
    if (typeof parent !== "string") return;
    try {
      const dir = unwrap(await commands.backupRestore(file, parent));
      notify({
        text: t("settings.restored", { dir }),
        timeout: 0,
        actions: onOpenProject
          ? [{ label: t("settings.openThisProject"), onClick: () => onOpenProject(dir) }]
          : [
              {
                label: t("workspace.showInFolder"),
                onClick: () => void commands.reveal(dir, false),
              },
            ],
      });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const restoreFile = async () => {
    const file = await open({
      title: t("settings.chooseBackup"),
      defaultPath: state.root,
      filters: [{ name: t("settings.backupFile"), extensions: ["db"] }],
    });
    if (typeof file === "string") await restore(file);
  };

  const last = state.copies[0];

  return (
    <>
      {inProject && (
        <div className="set-status">
          <DatabaseBackup aria-hidden="true" />
          <div className="set-status-text">
            <strong>{last ? t("settings.lastCopy", { date: dates().format(new Date(last.at)) }) : t("settings.noCopy")}</strong>
            <span>
              {last
                ? t("settings.copiesKept", { kind: kindLabel(last.kind), count: state.copies.length })
                : t("settings.firstCopy")}
            </span>
          </div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void now()}>
            {t("backup.now")}
          </button>
        </div>
      )}
      <Group title={t("settings.autoCopies")}>
        <Row id="b-every" title={t("settings.every")} help={t("settings.everyHelp")}>
          <NumberField
            id="b-every"
            value={s.everyMinutes ?? 30}
            unit="min"
            min={5}
            max={1440}
            onSave={(v) => void save({ ...s, everyMinutes: v })}
          />
        </Row>
        <Row id="b-keep" title={t("settings.keep")} help={t("settings.keepHelp")}>
          <NumberField
            id="b-keep"
            value={s.keep ?? 20}
            unit={t("settings.unitCopies")}
            min={1}
            max={1000}
            onSave={(v) => void save({ ...s, keep: v })}
          />
        </Row>
        <Row id="b-remind" title={t("settings.remind")} help={t("settings.remindHelp")}>
          <NumberField
            id="b-remind"
            value={s.remindDays ?? 7}
            unit={t("settings.unitDays")}
            min={0}
            max={365}
            onSave={(v) => void save({ ...s, remindDays: v })}
          />
        </Row>
      </Group>
      <Group title={t("settings.location")}>
        <Row
          title={t("settings.backupsDir")}
          help={<span className="set-path" title={state.root}>{state.root}</span>}
        >
          <button type="button" className="btn small" onClick={() => void chooseDir()}>
            {t("settings.choose")}
          </button>
          {s.dir && (
            <button type="button" className="btn ghost small" onClick={() => void save({ ...s, dir: null })}>
              {t("settings.default")}
            </button>
          )}
          <button type="button" className="btn ghost small" onClick={() => void commands.backupReveal()}>
            {t("settings.open")}
          </button>
        </Row>
        <Row
          title={t("settings.restore")}
          help={t("settings.restoreHelp")}
        >
          <button type="button" className="btn small" onClick={() => void restoreFile()}>
            {t("settings.chooseFile")}
          </button>
        </Row>
      </Group>
      {inProject && state.copies.length > 0 && (
        <Group title={t("settings.projectCopies")}>
          {state.copies.map((c) => (
            <Row key={c.file} title={dates().format(new Date(c.at))} help={`${kindLabel(c.kind)} · ${sizeLabel(c.bytes)}`}>
              <button type="button" className="btn small" onClick={() => void restore(c.file)}>
                {t("settings.restoreCopy")}
              </button>
            </Row>
          ))}
        </Group>
      )}
    </>
  );
}

/** The keys whose name changes with the language; the others (Ctrl, Tab, letters) are written as they are. */
const KEY_NAMES: Record<string, string> = { Maj: "shift", Échap: "escape", Entrée: "enter", Molette: "wheel", Clic: "click" };
export const keyName = (k: string) => (KEY_NAMES[k] ? t(`keys.${KEY_NAMES[k]}`) : k);

/** Keys as they are pressed together: « Ctrl » « K ». */
function Keys({ keys }: { keys: string }) {
  return (
    <span className="keys">
      {keys.split(" ").map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="keys-or">{t("settings.or")}</span>}
          {group.split("+").map((k, j) => (
            <kbd key={j}>{keyName(k)}</kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

function ShortcutSettings() {
  const { t } = useTranslation();
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: t("settings.sc.everywhere"),
      rows: [
        ["Ctrl+K", t("settings.sc.palette")],
        ["Ctrl+/", t("settings.sc.shortcuts")],
        ["Échap", t("settings.sc.close")],
      ],
    },
    {
      title: t("nav.views.script"),
      rows: [
        ["Ctrl+S", t("settings.sc.save")],
        ["Ctrl+P", t("settings.sc.pdf")],
        ["Ctrl+Z", t("settings.sc.undo")],
        ["Ctrl+Y Ctrl+Maj+Z", t("settings.sc.redo")],
        ["Échap", t("settings.sc.preview")],
        ["/ @ [[", t("settings.sc.link")],
        ["Ctrl+Clic", t("settings.sc.openLink")],
      ],
    },
    {
      title: t("settings.sc.elements"),
      rows: [
        ["Entrée", t("settings.sc.next")],
        ["Tab", t("settings.sc.cycle")],
        ["Maj+Tab", t("settings.sc.back")],
        ...ELEMENT_TYPES.map((type, i): [string, string] => [`Ctrl+${i + 1}`, t(`elements.${type}`)]),
        ["INT. EXT.", t("settings.sc.heading")],
        ["(", t("settings.sc.paren")],
      ],
    },
    {
      title: t("settings.sc.views"),
      rows: [
        ["Ctrl+Molette", t("settings.sc.zoom")],
        ["Entrée", t("settings.sc.openScene")],
      ],
    },
  ];
  return (
    <>
      {groups.map((g) => (
        <Group key={g.title} title={g.title}>
          {g.rows.map(([keys, what], i) => (
            <div className="set-row shortcut" key={i}>
              <span className="set-row-help">{what}</span>
              <Keys keys={keys} />
            </div>
          ))}
        </Group>
      ))}
      <p className="set-note">{t("settings.shortcutsNote")}</p>
    </>
  );
}

const numberChoices = (): { id: SceneNumbers; label: string }[] => [
  { id: "none", label: t("settings.numbers.none") },
  { id: "left", label: t("settings.numbers.left") },
  { id: "right", label: t("settings.numbers.right") },
  { id: "both", label: t("settings.numbers.both") },
];

/** A sheet seen from afar, with the scene numbers where they print. */
function NumbersPreview({ at }: { at: SceneNumbers }) {
  const left = at === "left" || at === "both";
  const right = at === "right" || at === "both";
  const heading = (n: number) => (
    <span className="np-heading">
      <span className={left ? "np-num" : "np-num off"}>{n}</span>
      <span className="np-line np-head" />
      <span className={right ? "np-num" : "np-num off"}>{n}</span>
    </span>
  );
  return (
    <span className="numbers-preview" aria-hidden="true">
      {heading(12)}
      <span className="np-line" />
      <span className="np-line short" />
      <span className="np-line dlg" />
      {heading(13)}
      <span className="np-line" />
    </span>
  );
}

function ScriptSettings({ notify }: { notify: Notify }) {
  const format = useScriptFormat();
  const formats = useLive(availableFormats, ["project_setting"]);
  const numbers = useSceneNumbers();
  if (!format || !formats) return null;
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  return (
    <>
      <Group title={t("settings.layout")}>
        <Row
          title={t("settings.scriptFormat")}
          help={t("settings.scriptFormatHelp")}
        >
          <Select
            aria-label={t("settings.scriptFormat")}
            value={format.id}
            onChange={(e) => {
              const next = formats.find((f) => f.id === e.target.value);
              if (next) writeProjectFormat(next).catch(fail);
            }}
          >
            {groupFormats(formats).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {formatName(f)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Row>
      </Group>
      <Group title={t("settings.printing")}>
        <Row
          stack
          title={t("settings.sceneNumbers")}
          help={t("settings.sceneNumbersHelp")}
        >
          <div className="numbers-choice" role="radiogroup" aria-label={t("settings.sceneNumbers")}>
            {numberChoices().map((o) => (
              <label key={o.id} className={numbers === o.id ? "numbers-option on" : "numbers-option"}>
                <input
                  type="radio"
                  name="scene-numbers"
                  value={o.id}
                  checked={numbers === o.id}
                  onChange={() => writeSceneNumbers(o.id).catch(fail)}
                />
                <NumbersPreview at={o.id} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </Row>
      </Group>
    </>
  );
}

/** How the Découpage lists the shots: their order and numbers, kept in the project, and the fields it shows. */
function ShotlistSettings({ notify }: { notify: Notify }) {
  const numbering = useNumbering();
  const [order, setOrder] = useStoredState<ShotOrder>(ORDER_KEY, "edit");
  const [hidden, setHidden] = useStoredState<ShotColumn[]>(HIDDEN_KEY, DEFAULT_HIDDEN);
  const [focus, setFocus] = useStoredState(FOCUS_KEY, true);
  return (
    <>
      <Group title={t("settings.shotlist.listing")}>
        <Row title={t("shotlist.order")} help={t(`shotlist.orders.${order}Hint`)}>
          <Select aria-label={t("shotlist.order")} value={order} onChange={(e) => setOrder(e.target.value as ShotOrder)}>
            {(["edit", "shoot"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`shotlist.orders.${v}`)}
              </option>
            ))}
          </Select>
        </Row>
        <Row title={t("shotlist.numbering")} help={t(`shotlist.numberings.${numbering}Hint`)}>
          <Select
            aria-label={t("shotlist.numbering")}
            value={numbering}
            onChange={(e) =>
              void writeNumbering(e.target.value as ShotNumbering).catch((x) => notify({ text: describeError(x), tone: "error" }))
            }
          >
            {(["dash", "letter"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`shotlist.numberings.${v}`)}
              </option>
            ))}
          </Select>
        </Row>
        <Row id="shot-focus" title={t("settings.shotlist.focus")} help={t("settings.shotlist.focusHelp")}>
          <Switch id="shot-focus" checked={focus} onChange={setFocus} />
        </Row>
      </Group>
      <Group title={t("shotlist.shownColumns")}>
        {SHOT_COLUMNS.map((c) => (
          <Row key={c} id={`shot-col-${c}`} title={columnLabel(c)}>
            <Switch
              id={`shot-col-${c}`}
              checked={!hidden.includes(c)}
              onChange={(on) => setHidden(on ? hidden.filter((x) => x !== c) : [...hidden, c])}
            />
          </Row>
        ))}
      </Group>
      <p className="set-note">{t("settings.shotlist.note")}</p>
    </>
  );
}

const PARTS = ["realisation", "production"];

function PartsSettings() {
  const hidden = useLive(
    async () =>
      JSON.parse((await readSetting(PARTS_HIDDEN_SETTING)) ?? "[]") as string[],
    ["project_setting"],
  );
  if (!hidden) return null;
  return (
    <>
      <Group title={t("settings.navigation")}>
        <Row title={t("settings.partsWriting")} help={t("settings.partsWritingHelp")}>
          <input type="checkbox" role="switch" className="switch" checked disabled aria-label={t("settings.partsWriting")} />
        </Row>
        {PARTS.map((id) => ({ id, label: t(`nav.parts.${id}`), help: t(`settings.partsHelp.${id}`) })).map((p) => (
          <Row key={p.id} id={`part-${p.id}`} title={p.label} help={p.help}>
            <Switch
              id={`part-${p.id}`}
              checked={!hidden.includes(p.id)}
              onChange={(on) =>
                void writeSetting(
                  PARTS_HIDDEN_SETTING,
                  JSON.stringify(on ? hidden.filter((x) => x !== p.id) : [...hidden, p.id]),
                )
              }
            />
          </Row>
        ))}
      </Group>
      <p className="set-note">{t("settings.partsNote")}</p>
    </>
  );
}

function AboutSettings({ notify }: { notify: Notify }) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);
  const copy = () =>
    navigator.clipboard
      .writeText(SOURCE_URL)
      .then(() => notify({ text: t("settings.linkCopied") }))
      .catch((e) => notify({ text: describeError(e), tone: "error" }));
  return (
    <>
      <div className="about-head">
        <img src="/oniric.svg" alt="" className="about-logo" width="44" height="44" />
        <div>
          <strong>Oniric</strong>
          <span>{version ? t("app.version", { version }) : t("settings.versionUnknown")}</span>
        </div>
      </div>
      <Group>
        <Row title={t("settings.licence")} help={t("settings.licenceHelp")} />
        <Row title={t("settings.data")} help={t("settings.dataHelp")} />
        <Row title={t("settings.source")} help={<span className="set-path">{SOURCE_URL}</span>}>
          <button type="button" className="btn small" onClick={() => void copy()}>
            <Copy aria-hidden="true" />
            {t("settings.copyLink")}
          </button>
        </Row>
      </Group>
    </>
  );
}
