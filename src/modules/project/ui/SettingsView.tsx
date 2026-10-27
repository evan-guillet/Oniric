import {
  DatabaseBackup,
  LayoutGrid,
  Palette,
  Ruler,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { uuidv7 } from "../../../core/ids";
import { confirmRemoval, Dialog, useBackdropClose, useChoice } from "../../../ui-kit/Dialog";
import { Labeled } from "../../../ui-kit/Form";
import type { ToastMessage } from "../../../ui-kit/Toast";
import {
  loadFormatLibrary,
  saveFormatLibrary,
} from "../../script/screenplay/application/formatSettings";
import {
  readSetting,
  writeSetting,
} from "../../script/screenplay/application/settings";
import {
  ELEMENT_TYPES,
  FORMATS,
  FORMAT_KINDS,
  type FormatLanguage,
  type ScreenplayFormat,
} from "../../script/screenplay/domain/formats";
import { ProjectContext } from "./projectContext";

import { Select } from "../../../ui-kit/Select";
export const PARTS_HIDDEN_SETTING = "parts_hidden";

type Notify = (m: Omit<ToastMessage, "id">) => void;

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

type PageId = "appearance" | "backups" | "formats" | "parts";

interface Page {
  id: PageId;
  label: string;
  icon: LucideIcon;
  /** Extra words the search box matches. */
  keywords: string;
}

const GROUPS: { label: string; pages: Page[]; projectOnly?: boolean }[] = [
  {
    label: "Application",
    pages: [
      {
        id: "appearance",
        label: "Apparence",
        icon: Palette,
        keywords: "thème clair sombre système couleurs",
      },
      {
        id: "backups",
        label: "Sauvegardes",
        icon: DatabaseBackup,
        keywords: "copie restaurer dossier automatique",
      },
      {
        id: "formats",
        label: "Formats de scénario",
        icon: Ruler,
        keywords: "marges papier a4 letter police personnalisé",
      },
    ],
  },
  {
    label: "Ce projet",
    projectOnly: true,
    pages: [
      {
        id: "parts",
        label: "Parties affichées",
        icon: LayoutGrid,
        keywords: "réalisation production masquer",
      },
    ],
  },
];

const fold = (x: string) =>
  x
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * The settings, opened over the current screen, laid out like Discord's: the categories in a
 * side column with a search box, the chosen one on the right. Reachable from the home screen too.
 */
export function SettingsDialog({
  onClose,
  notify: notifyProp,
  onOpenProject,
}: {
  onClose: () => void;
  notify?: Notify;
  onOpenProject?: (dir: string) => void;
}) {
  const ctx = useContext(ProjectContext);
  const notify = ctx?.notify ?? notifyProp ?? (() => {});
  const ref = useRef<HTMLDialogElement>(null);
  const backdrop = useBackdropClose(onClose);
  const [page, setPage] = useState<PageId>("appearance");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);

  const q = fold(search.trim());
  const groups = GROUPS.filter((g) => !g.projectOnly || ctx)
    .map((g) => ({
      ...g,
      pages: g.pages.filter(
        (p) => !q || fold(`${p.label} ${p.keywords}`).includes(q),
      ),
    }))
    .filter((g) => g.pages.length > 0);
  const current = GROUPS.flatMap((g) => g.pages).find((p) => p.id === page)!;

  const openProject =
    onOpenProject &&
    ((dir: string) => {
      onClose();
      onOpenProject(dir);
    });

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
      <nav className="settings-nav" aria-label="Catégories de réglages">
        <label className="settings-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher"
            aria-label="Rechercher un réglage"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {groups.map((g) => (
          <section key={g.label}>
            <h2>{g.label}</h2>
            <ul>
              {g.pages.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={p.id === page ? "nav-link on" : "nav-link"}
                    aria-current={p.id === page ? "page" : undefined}
                    onClick={() => setPage(p.id)}
                  >
                    <p.icon aria-hidden="true" />
                    <span>{p.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="muted small settings-none">
            Aucun réglage ne correspond.
          </p>
        )}
      </nav>
      <div className="settings-pane">
        <header className="settings-pane-head">
          <h1>{current.label}</h1>
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
        <div className="settings-pane-body settings">
          {page === "appearance" && <AppearanceSettings notify={notify} />}
          {page === "backups" && (
            <BackupSettings
              notify={notify}
              inProject={!!ctx}
              onOpenProject={openProject}
            />
          )}
          {page === "formats" && <FormatSettings notify={notify} />}
          {page === "parts" && ctx && <PartsSettings />}
        </div>
      </div>
    </dialog>
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
    <section className="settings-section">
      <p className="muted">
        Le thème s'applique à toute l'application, pages du scénario comprises.
        Les PDF exportés restent toujours en noir sur blanc.
      </p>
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

  return (
    <section className="settings-section">
      <p className="muted">
        Oniric garde des copies de chaque projet dans un dossier à part, en plus
        de l'enregistrement continu. Une sauvegarde ne modifie jamais le projet
        ; la restaurer crée un nouveau dossier de projet à côté.
      </p>
      <div className="grid-2">
        <Labeled label="Dossier des sauvegardes" wide>
          <div className="input-row">
            <input readOnly value={state.root} />
            <button
              type="button"
              className="btn"
              onClick={() => void chooseDir()}
            >
              Choisir…
            </button>
            {s.dir && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => void save({ ...s, dir: null })}
              >
                Par défaut
              </button>
            )}
          </div>
        </Labeled>
        <Labeled label="Copie automatique toutes les (minutes)">
          <input
            type="number"
            min={0}
            max={1440}
            defaultValue={s.everyMinutes ?? 30}
            onBlur={(e) =>
              void save({ ...s, everyMinutes: Number(e.target.value) || 0 })
            }
          />
        </Labeled>
        <Labeled label="Nombre de copies gardées">
          <input
            type="number"
            min={1}
            max={500}
            defaultValue={s.keep ?? 20}
            onBlur={(e) =>
              void save({ ...s, keep: Number(e.target.value) || 20 })
            }
          />
        </Labeled>
        <Labeled label="Rappel si la dernière copie a plus de (jours, 0 = jamais)">
          <input
            type="number"
            min={0}
            max={365}
            defaultValue={s.remindDays ?? 7}
            onBlur={(e) =>
              void save({ ...s, remindDays: Number(e.target.value) || 0 })
            }
          />
        </Labeled>
      </div>
      <div className="row-actions">
        {inProject && (
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void now()}
          >
            Sauvegarder maintenant
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => void commands.backupReveal()}
        >
          Ouvrir le dossier
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void restoreFile()}
        >
          Restaurer une sauvegarde…
        </button>
      </div>
      {inProject && (
        <>
          <h4>Copies de ce projet</h4>
          {state.copies.length === 0 ? (
            <p className="muted">Pas encore de copie.</p>
          ) : (
            <table className="table compact">
              <tbody>
                {state.copies.map((c) => (
                  <tr key={c.file}>
                    <td>{dateFormat.format(new Date(c.at))}</td>
                    <td className="muted">{kindLabel(c.kind)}</td>
                    <td className="muted">{sizeLabel(c.bytes)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => void restore(c.file)}
                      >
                        Restaurer…
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

const CM = 2.54;
const cm = (inch: number) => Math.round(inch * CM * 100) / 100;
const inch = (c: number) => c / CM;

function FormatSettings({ notify }: { notify: Notify }) {
  const { t } = useTranslation();
  const [choice, ask] = useChoice();
  const [library, setLibrary] = useState<ScreenplayFormat[] | null>(null);
  const [editing, setEditing] = useState<ScreenplayFormat | null>(null);
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

  return (
    <section className="settings-section">
      <p className="muted">
        Les formats fournis reprennent les modèles de Final Draft ; dupliquez-en
        un pour l'ajuster. Un projet garde son format même ouvert sur un autre
        PC.
      </p>
      {FORMAT_KINDS.map((k) => (
        <Fragment key={k.id}>
          <h4>{k.label}</h4>
          <ul className="format-list">
            {FORMATS.filter((f) => (f.kind ?? "film") === k.id).map((f) => (
              <li key={f.id}>
                <span className="format-list-name">
                  {f.name}
                  {f.help && <span className="muted small">{f.help}</span>}
                </span>
                <button
              type="button"
              className="btn small"
              onClick={() =>
                setEditing({
                  ...structuredClone(f),
                  id: `perso-${uuidv7()}`,
                  name: `${f.name} (copie)`,
                })
              }
            >
              Dupliquer
            </button>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
      <h4>Mes formats</h4>
      {library.length === 0 && <p className="muted small">Dupliquez un format fourni pour en faire le vôtre.</p>}
      <ul className="format-list">
        {library.map((f) => (
          <li key={f.id}>
            <span>{f.name}</span>
            <span className="muted small">personnalisé</span>
            <button
              type="button"
              className="btn small"
              onClick={() => setEditing(structuredClone(f))}
            >
              Modifier
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={async () => {
                if (await confirmRemoval(ask, { title: `Supprimer le format « ${f.name} » ?`, text: "Il quitte la liste des formats de scénario." }))
                  await persist(library.filter((x) => x.id !== f.id));
              }}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
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
    </section>
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

const PARTS = [
  {
    id: "realisation",
    label: "Réalisation (moodboard, découpage, storyboard)",
  },
  {
    id: "production",
    label: "Production (équipe, dépouillement, plan de travail…)",
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
    <section className="settings-section">
      <p className="muted">
        Pour un projet d'écriture seule, masquez ce qui ne sert pas. Rien n'est
        effacé.
      </p>
      {PARTS.map((p) => (
        <label key={p.id} className="choice">
          <input
            type="checkbox"
            checked={!hidden.includes(p.id)}
            onChange={(e) =>
              void writeSetting(
                PARTS_HIDDEN_SETTING,
                JSON.stringify(
                  e.target.checked
                    ? hidden.filter((x) => x !== p.id)
                    : [...hidden, p.id],
                ),
              )
            }
          />
          {p.label}
        </label>
      ))}
    </section>
  );
}
