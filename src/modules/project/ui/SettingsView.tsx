import {
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
  X,
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
import {
  getThemePreference,
  onThemePreference,
  setThemePreference,
  type ThemePreference,
} from "../../../core/theme";
import { setWritingPrefs, useWritingPrefs, type WritingPrefs } from "../../../core/writingPrefs";
import { uuidv7 } from "../../../core/ids";
import { confirmRemoval, Dialog, useBackdropClose, useChoice } from "../../../ui-kit/Dialog";
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
  groupFormats,
  type FormatLanguage,
  type ScreenplayFormat,
} from "../../script/screenplay/domain/formats";
import { ProjectContext, type SettingsPage } from "./projectContext";

import { Select } from "../../../ui-kit/Select";
export const PARTS_HIDDEN_SETTING = "parts_hidden";

type Notify = (m: Omit<ToastMessage, "id">) => void;

const SOURCE_URL = "https://github.com/evan-guillet/Oniric";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const KIND_LABEL: Record<string, string> = {
  auto: "automatique",
  fermeture: "à la fermeture",
  manuelle: "manuelle",
};
const kindLabel = (k: string) =>
  KIND_LABEL[k] ?? (k.startsWith("avant-migration") ? "avant mise à jour" : k);
const sizeLabel = (b: number) =>
  b > 1e6
    ? `${(b / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`
    : `${Math.max(1, Math.round(b / 1e3))} Ko`;

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

const PAGES: Record<PageId, Page> = {
  profile: {
    id: "profile",
    label: "Profil",
    icon: UserRound,
    lead: "Votre nom et vos coordonnées, repris sur la page de titre de chaque script.",
    keywords: "nom auteur e-mail téléphone adresse agent contact page de titre",
  },
  appearance: {
    id: "appearance",
    label: "Apparence",
    icon: Palette,
    lead: "Le thème de toute l'application, pages du scénario comprises.",
    keywords: "thème clair sombre système couleurs nuit",
  },
  writing: {
    id: "writing",
    label: "Écriture",
    icon: PenLine,
    lead: "Comment se comporte le Scénario pendant que vous tapez.",
    keywords: "machine à écrire défilement centré orthographe correcteur typographie espaces insécables objectif mots par jour",
  },
  formats: {
    id: "formats",
    label: "Formats de scénario",
    icon: Ruler,
    lead: "Les mises en page fournies, et les vôtres, partagées par tous les projets.",
    keywords: "marges papier a4 letter police personnalisé dupliquer modèle",
  },
  backups: {
    id: "backups",
    label: "Sauvegardes",
    icon: DatabaseBackup,
    lead: "Des copies de chaque projet dans un dossier à part, en plus de l'enregistrement continu.",
    keywords: "copie restaurer dossier automatique fréquence rappel",
  },
  shortcuts: {
    id: "shortcuts",
    label: "Raccourcis clavier",
    icon: Keyboard,
    lead: "Tout ce qui se fait au clavier, vue par vue.",
    keywords: "touches clavier ctrl tab entrée palette éléments aide",
  },
  script: {
    id: "script",
    label: "Script",
    icon: FileText,
    lead: "La mise en page et l'impression du script de ce projet.",
    keywords: "format numéros de scène impression pdf fdx fountain marge",
  },
  parts: {
    id: "parts",
    label: "Parties affichées",
    icon: LayoutGrid,
    lead: "Ce que montre la navigation de ce projet.",
    keywords: "réalisation production masquer navigation",
  },
  about: {
    id: "about",
    label: "À propos",
    icon: Info,
    lead: "Oniric, logiciel libre de création de films.",
    keywords: "version licence gpl code source",
  },
};

const GROUPS: { label: string; pages: PageId[]; projectOnly?: boolean }[] = [
  { label: "Application", pages: ["profile", "appearance", "writing", "formats", "backups", "shortcuts"] },
  { label: "Ce projet", projectOnly: true, pages: ["script", "parts"] },
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
export function SettingsDialog({
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
  const ref = useRef<HTMLDialogElement>(null);
  const backdrop = useBackdropClose(onClose);
  const [page, setPage] = useState<PageId>(initialPage);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);

  const q = fold(search.trim());
  const matches = (id: PageId) => !q || fold(`${PAGES[id].label} ${PAGES[id].keywords}`).includes(q);
  const groups = GROUPS.filter((g) => !g.projectOnly || ctx)
    .map((g) => ({ ...g, pages: g.pages.filter(matches) }))
    .filter((g) => g.pages.length > 0);
  const aboutShown = matches("about");
  const current = PAGES[page];

  const openProject =
    onOpenProject &&
    ((dir: string) => {
      onClose();
      onOpenProject(dir);
    });

  const link = (id: PageId) => {
    const p = PAGES[id];
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
    <dialog
      ref={ref}
      className="dialog settings-dialog"
      aria-label="Réglages"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      {...backdrop}
    >
      <nav className="settings-nav" aria-label="Pages des réglages">
        <label className="settings-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher un réglage"
            aria-label="Rechercher un réglage"
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
          <section key={g.label}>
            <h2 title={g.projectOnly ? ctx?.project.title : undefined}>{g.label}</h2>
            <ul>
              {g.pages.map((id) => (
                <li key={id}>{link(id)}</li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && !aboutShown && (
          <p className="muted small settings-none">Aucun réglage ne correspond.</p>
        )}
        {aboutShown && <div className="settings-nav-foot">{link("about")}</div>}
      </nav>
      <div className="settings-pane">
        <header className="settings-pane-head">
          <div className="settings-pane-title">
            <h1>{current.label}</h1>
            <p>{current.lead}</p>
          </div>
          <button
            type="button"
            className="settings-close"
            aria-label="Fermer les réglages"
            title="Fermer (Échap)"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
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
          {page === "parts" && ctx && <PartsSettings />}
          {page === "about" && <AboutSettings notify={notify} />}
        </div>
      </div>
    </dialog>
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

const PROFILE_FIELDS: { key: keyof Profile; label: string; help?: string; multiline?: boolean; type?: string }[] = [
  { key: "name", label: "Nom", help: "Imprimé sous « Écrit par » et en tête du contact." },
  { key: "email", label: "E-mail", type: "email" },
  { key: "phone", label: "Téléphone", type: "tel" },
  { key: "address", label: "Adresse", multiline: true },
  { key: "agent", label: "Agent ou représentant", help: "Ajouté à la fin du contact.", multiline: true },
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
      <Group title="Coordonnées">
        {PROFILE_FIELDS.map((f) => (
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
      <Group title="Sur la page de titre">
        <div className="profile-sheet" aria-label="Le contact tel qu'il s'imprime">
          <div className="profile-sheet-by">
            {profile.name.trim() ? (
              <>
                Écrit par
                <br />
                <br />
                {profile.name}
              </>
            ) : (
              <span className="muted">Votre nom s'imprimera ici.</span>
            )}
          </div>
          <div className="profile-sheet-contact">
            {contact.length > 0 ? contact.join("\n") : <span className="muted">Le contact s'imprime en bas à gauche.</span>}
          </div>
        </div>
        <p className="set-note">
          Chaque script suit ce profil, sauf les champs changés dans Scénario, onglet « Informations », qui ne
          valent que pour lui. Le profil reste sur ce PC.
        </p>
      </Group>
    </>
  );
}

const THEMES: { id: ThemePreference; label: string; help: string }[] = [
  { id: "system", label: "Système", help: "Suit le réglage de Windows" },
  { id: "light", label: "Clair", help: "Pages blanches, encre noire" },
  { id: "dark", label: "Sombre", help: "Pages sombres, plus doux le soir" },
];

function AppearanceSettings({ notify }: { notify: Notify }) {
  const [theme, setTheme] = useState(getThemePreference);
  useEffect(() => onThemePreference(setTheme), []);
  const choose = (p: ThemePreference) =>
    setThemePreference(p).catch((e) =>
      notify({ text: describeError(e), tone: "error" }),
    );
  return (
    <section className="set-group">
      <div className="set-group-head">
        <h2>Thème</h2>
      </div>
      <div className="theme-options" role="radiogroup" aria-label="Thème">
        {THEMES.map((o) => (
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
      <p className="set-note">Les PDF exportés restent toujours en noir sur blanc.</p>
    </section>
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

const TYPOGRAPHY: { id: WritingPrefs["typography"]; label: string }[] = [
  { id: "auto", label: "Avec un format français" },
  { id: "on", label: "Toujours" },
  { id: "off", label: "Jamais" },
];

function WritingSettings({ notify }: { notify: Notify }) {
  const prefs = useWritingPrefs();
  const set = (patch: Partial<WritingPrefs>) =>
    setWritingPrefs(patch).catch((e) => notify({ text: describeError(e), tone: "error" }));
  return (
    <>
      <Group title="Pendant la frappe">
        <Row
          id="w-typewriter"
          title="Défilement machine à écrire"
          help="La ligne que vous tapez reste au milieu de l'écran ; la page monte sous elle."
        >
          <Switch id="w-typewriter" checked={prefs.typewriter} onChange={(v) => void set({ typewriter: v })} />
        </Row>
        <Row
          id="w-spell"
          title="Correcteur orthographique"
          help="Souligne les mots que Windows ne connaît pas, dans la langue du format. Clic droit pour les suggestions."
        >
          <Switch id="w-spell" checked={prefs.spellcheck} onChange={(v) => void set({ spellcheck: v })} />
        </Row>
        <Row
          title="Typographie française"
          help="Une espace insécable avant ? ! ; : et dans les guillemets « », posée en tapant."
        >
          <Select
            aria-label="Typographie française"
            value={prefs.typography}
            onChange={(e) => void set({ typography: e.target.value as WritingPrefs["typography"] })}
          >
            {TYPOGRAPHY.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Row>
      </Group>
      <Group title="Objectif">
        <Row
          id="w-goal"
          title="Mots par jour"
          help="Tracé dans l'activité d'écriture du tableau de bord ; les jours atteints passent au vert. 0 : pas d'objectif."
        >
          <NumberField
            id="w-goal"
            value={prefs.dailyGoal}
            unit="mots"
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
    setEditing({ ...structuredClone(f), id: `perso-${uuidv7()}`, name: `${f.name} (copie)` });
  const usedBadge = (id: string) => used === id && <span className="badge set-badge">Ce projet</span>;

  return (
    <>
      <Group title="Mes formats">
        {library.length === 0 ? (
          <Row title="Aucun format à vous" help="Dupliquez un format fourni ci-dessous pour en régler les marges, le papier ou les mentions." />
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
              help={`${f.paper === "A4" ? "A4" : "Letter (US)"} · personnalisé`}
            >
              <button type="button" className="btn small" onClick={() => setEditing(structuredClone(f))}>
                Modifier
              </button>
              <button type="button" className="btn small" onClick={() => duplicate(f)}>
                Dupliquer
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={async () => {
                  if (await confirmRemoval(ask, { title: `Supprimer le format « ${f.name} » ?`, text: "Il quitte la liste des formats de scénario. Les projets qui l'utilisent le gardent." }))
                    await persist(library.filter((x) => x.id !== f.id));
                }}
              >
                Supprimer
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
                  {f.name}
                  {usedBadge(f.id)}
                </>
              }
              help={f.help}
            >
              <button type="button" className="btn small" onClick={() => duplicate(f)}>
                Dupliquer
              </button>
            </Row>
          ))}
        </Group>
      ))}
      <p className="set-note">Les formats fournis reprennent les modèles de Final Draft. Un projet garde son format, même ouvert sur un autre PC.</p>
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
      title="Format personnalisé"
      wide
      onCancel={onCancel}
      actions={[
        { label: "Annuler", onClick: onCancel },
        {
          label: "Enregistrer",
          primary: true,
          disabled: !f.name.trim(),
          onClick: () => onSave({ ...f, name: f.name.trim(), paper }),
        },
      ]}
    >
      <div className="format-editor">
        <Labeled label="Nom" wide>
          <input
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Labeled>
        <div className="input-row">
          <Labeled label="Papier">
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
          <Labeled label="Langue">
            <Select
              value={f.language}
              onChange={(e) => set({ language: e.target.value as FormatLanguage })}
            >
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
              <option value="de">Allemand</option>
              <option value="es">Espagnol</option>
            </Select>
          </Labeled>
          <Num
            label="Corps (pt)"
            step={0.5}
            value={f.fontSizePt}
            onChange={(v) => set({ fontSizePt: v, lineHeightPt: v })}
          />
        </div>
        <fieldset className="field">
          <legend>Marges (cm)</legend>
          <div className="input-row">
            {(["top", "bottom", "left", "right"] as const).map((k) => (
              <Num
                key={k}
                label={
                  {
                    top: "Haut",
                    bottom: "Bas",
                    left: "Gauche",
                    right: "Droite",
                  }[k]
                }
                value={cm(f.margins[k])}
                onChange={(v) =>
                  set({ margins: { ...f.margins, [k]: inch(v) } })
                }
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Éléments (cm depuis la marge gauche)</legend>
          <table className="table compact">
            <thead>
              <tr>
                <th />
                <th>Retrait</th>
                <th>Largeur</th>
                <th>Lignes avant</th>
                <th>Majuscules</th>
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
                        aria-label="Retrait"
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
                        aria-label="Largeur"
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
                        aria-label="Lignes avant"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={e.uppercase}
                        onChange={(x) => setEl({ uppercase: x.target.checked })}
                        aria-label="Majuscules"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </fieldset>
        <div className="input-row">
          <Labeled label="Mention « à suivre »">
            <input
              value={f.labels.more}
              onChange={(e) =>
                set({ labels: { ...f.labels, more: e.target.value } })
              }
            />
          </Labeled>
          <Labeled label="Mention « suite »">
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
      title: "Dossier des sauvegardes",
      defaultPath: state.root,
    });
    if (typeof dir === "string") await save({ ...s, dir });
  };

  const now = async () => {
    setBusy(true);
    try {
      unwrap(await commands.backupNow());
      notify({ text: "Sauvegarde faite." });
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
      title: "Où recréer le projet ?",
    });
    if (typeof parent !== "string") return;
    try {
      const dir = unwrap(await commands.backupRestore(file, parent));
      notify({
        text: `Projet recréé à partir de la sauvegarde : ${dir}`,
        timeout: 0,
        actions: onOpenProject
          ? [{ label: "Ouvrir ce projet", onClick: () => onOpenProject(dir) }]
          : [
              {
                label: "Afficher dans le dossier",
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
      title: "Choisir une sauvegarde",
      defaultPath: state.root,
      filters: [{ name: "Sauvegarde Oniric", extensions: ["db"] }],
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
            <strong>{last ? `Dernière copie : ${dateFormat.format(new Date(last.at))}` : "Pas encore de copie de ce projet"}</strong>
            <span>
              {last
                ? `${kindLabel(last.kind)} · ${state.copies.length} copie${state.copies.length > 1 ? "s" : ""} gardée${state.copies.length > 1 ? "s" : ""}`
                : "La première se fera d'elle-même, ou tout de suite avec ce bouton."}
            </span>
          </div>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void now()}>
            Sauvegarder maintenant
          </button>
        </div>
      )}
      <Group title="Copies automatiques">
        <Row id="b-every" title="Fréquence" help="Une copie de chaque projet ouvert, à cet intervalle, et une autre à sa fermeture.">
          <NumberField
            id="b-every"
            value={s.everyMinutes ?? 30}
            unit="min"
            min={5}
            max={1440}
            onSave={(v) => void save({ ...s, everyMinutes: v })}
          />
        </Row>
        <Row id="b-keep" title="Copies gardées" help="Par projet ; les plus anciennes s'effacent au-delà.">
          <NumberField
            id="b-keep"
            value={s.keep ?? 20}
            unit="copies"
            min={1}
            max={1000}
            onSave={(v) => void save({ ...s, keep: v })}
          />
        </Row>
        <Row id="b-remind" title="Rappel" help="Prévient à l'ouverture d'un projet si sa dernière copie est plus ancienne. 0 : jamais.">
          <NumberField
            id="b-remind"
            value={s.remindDays ?? 7}
            unit="jours"
            min={0}
            max={365}
            onSave={(v) => void save({ ...s, remindDays: v })}
          />
        </Row>
      </Group>
      <Group title="Emplacement">
        <Row
          title="Dossier des sauvegardes"
          help={<span className="set-path" title={state.root}>{state.root}</span>}
        >
          <button type="button" className="btn small" onClick={() => void chooseDir()}>
            Choisir…
          </button>
          {s.dir && (
            <button type="button" className="btn ghost small" onClick={() => void save({ ...s, dir: null })}>
              Par défaut
            </button>
          )}
          <button type="button" className="btn ghost small" onClick={() => void commands.backupReveal()}>
            Ouvrir
          </button>
        </Row>
        <Row
          title="Restaurer une sauvegarde"
          help="Recrée le projet dans un nouveau dossier, à côté ; une sauvegarde ne modifie jamais le projet."
        >
          <button type="button" className="btn small" onClick={() => void restoreFile()}>
            Choisir un fichier…
          </button>
        </Row>
      </Group>
      {inProject && state.copies.length > 0 && (
        <Group title="Copies de ce projet">
          {state.copies.map((c) => (
            <Row key={c.file} title={dateFormat.format(new Date(c.at))} help={`${kindLabel(c.kind)} · ${sizeLabel(c.bytes)}`}>
              <button type="button" className="btn small" onClick={() => void restore(c.file)}>
                Restaurer…
              </button>
            </Row>
          ))}
        </Group>
      )}
    </>
  );
}

/** Keys as they are pressed together: « Ctrl » « K ». */
function Keys({ keys }: { keys: string }) {
  return (
    <span className="keys">
      {keys.split(" ").map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="keys-or">ou</span>}
          {group.split("+").map((k, j) => (
            <kbd key={j}>{k}</kbd>
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
      title: "Partout",
      rows: [
        ["Ctrl+K", "Palette de commandes : aller à une vue, une scène, une fiche, une action"],
        ["Ctrl+/", "Voir ces raccourcis"],
        ["Échap", "Fermer le dialogue ou le menu ouvert"],
      ],
    },
    {
      title: "Scénario",
      rows: [
        ["Ctrl+S", "Enregistrer tout de suite (l'enregistrement se fait de lui-même)"],
        ["Ctrl+P", "Exporter en PDF"],
        ["Ctrl+Z", "Annuler"],
        ["Ctrl+Y Ctrl+Maj+Z", "Rétablir"],
        ["Échap", "Quitter l'aperçu"],
        ["@ [[", "Lier un nom à sa fiche de la Bible"],
        ["Ctrl+Clic", "Ouvrir la fiche d'un nom lié"],
      ],
    },
    {
      title: "Éléments du scénario",
      rows: [
        ["Entrée", "Élément suivant : après un personnage le dialogue, après le dialogue un personnage…"],
        ["Tab", "Changer l'élément de la ligne : action, personnage, transition, en-tête…"],
        ["Maj+Tab", "Le même cycle, à rebours"],
        ...ELEMENT_TYPES.map((type, i): [string, string] => [`Ctrl+${i + 1}`, t(`elements.${type}`)]),
        ["INT. EXT.", "Tapé en début d'action, en fait un en-tête de scène"],
        ["(", "Tapé en début de dialogue, en fait une didascalie"],
      ],
    },
    {
      title: "Tableau et Chronologie",
      rows: [
        ["Ctrl+Molette", "Zoomer ; la Chronologie zoome en largeur seulement"],
        ["Entrée", "Ouvrir la scène choisie dans le Scénario"],
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
      <p className="set-note">Maintenez Ctrl dans le Scénario : la barre des éléments affiche leurs raccourcis.</p>
    </>
  );
}

const NUMBERS: { id: SceneNumbers; label: string }[] = [
  { id: "none", label: "Aucun" },
  { id: "left", label: "À gauche" },
  { id: "right", label: "À droite" },
  { id: "both", label: "Des deux côtés" },
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
      <Group title="Mise en page">
        <Row
          title="Format du script"
          help="Changer de format refait la pagination ; le texte, lui, ne change pas."
        >
          <Select
            aria-label="Format du script"
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
                    {f.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Row>
      </Group>
      <Group title="Impression">
        <Row
          stack
          title="Numéros de scène"
          help="Dans les marges, à hauteur de chaque en-tête, comme dans un script de tournage. Ils suivent la liste des scènes et passent dans l'aperçu, le PDF et les exports Final Draft et Fountain ; la pagination ne bouge pas."
        >
          <div className="numbers-choice" role="radiogroup" aria-label="Numéros de scène">
            {NUMBERS.map((o) => (
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

const PARTS = [
  {
    id: "realisation",
    label: "Réalisation",
    help: "Moodboard, découpage, storyboard.",
  },
  {
    id: "production",
    label: "Production",
    help: "Équipe, dépouillement, plan de travail…",
  },
];

function PartsSettings() {
  const hidden = useLive(
    async () =>
      JSON.parse((await readSetting(PARTS_HIDDEN_SETTING)) ?? "[]") as string[],
    ["project_setting"],
  );
  if (!hidden) return null;
  return (
    <>
      <Group title="Navigation">
        <Row title="Écriture" help="Atelier, Bible, Scénario, Structure… toujours affichée.">
          <input type="checkbox" role="switch" className="switch" checked disabled aria-label="Écriture" />
        </Row>
        {PARTS.map((p) => (
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
      <p className="set-note">Pour un projet d'écriture seule, masquez ce qui ne sert pas. Rien n'est effacé.</p>
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
      .then(() => notify({ text: "Lien copié." }))
      .catch((e) => notify({ text: describeError(e), tone: "error" }));
  return (
    <>
      <div className="about-head">
        <img src="/oniric.svg" alt="" className="about-logo" width="44" height="44" />
        <div>
          <strong>Oniric</strong>
          <span>{version ? `Version ${version}` : "Version inconnue"}</span>
        </div>
      </div>
      <Group>
        <Row title="Licence" help="Logiciel libre sous GPL-3.0 : vous pouvez l'utiliser, l'étudier, le modifier et le partager." />
        <Row title="Vos données" help="Chaque projet est un dossier sur ce PC. Aucun compte, aucune connexion, rien n'est envoyé." />
        <Row title="Code source" help={<span className="set-path">{SOURCE_URL}</span>}>
          <button type="button" className="btn small" onClick={() => void copy()}>
            <Copy aria-hidden="true" />
            Copier le lien
          </button>
        </Row>
      </Group>
    </>
  );
}
