import { Clapperboard, FolderOpen, Plus, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { commands, type RecentProject, type StartupReport } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import type { ToastMessage } from "../../../ui-kit/Toast";
import { projectDirOf } from "../application/projects";
import { NewProjectDialog } from "./NewProjectDialog";
import { SettingsDialog } from "./SettingsView";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

/** The start screen: create or open a project, then the recent ones. Restoring a backup lives in Settings, importing inside a project. */
export function Home({
  startup,
  onOpen,
  onCreate,
  notify,
}: {
  startup: StartupReport | null;
  onOpen: (dir: string) => void;
  onCreate: (parent: string, title: string, formatId: string) => Promise<void>;
  notify: (m: Omit<ToastMessage, "id">) => void;
}) {
  const { t } = useTranslation();
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState(false);

  const refresh = async () => setRecent(unwrap(await commands.recentList()));
  useEffect(() => {
    void refresh();
  }, []);

  const browse = async () => {
    const file = await open({ title: t("home.openDialogTitle"), filters: [{ name: t("home.projectFile"), extensions: ["oniric"] }] });
    if (typeof file === "string") onOpen(projectDirOf(file));
  };

  const forget = async (path: string) => {
    unwrap(await commands.recentForget(path));
    await refresh();
  };

  return (
    <main className="home">
      <header className="home-head">
        <img src="/oniric.svg" alt="" className="home-logo" width="44" height="44" />
        <h1>{t("app.name")}</h1>
        <p className="muted">{t("app.tagline")}</p>
      </header>

      <div className="home-actions">
        <button type="button" className="home-action primary" onClick={() => setCreating(true)}>
          <span className="home-action-icon" aria-hidden="true">
            <Plus />
          </span>
          <span className="home-action-label">{t("home.newProject")}</span>
          <span className="home-action-hint">{t("home.newProjectHint")}</span>
        </button>
        <button type="button" className="home-action" onClick={() => void browse()}>
          <span className="home-action-icon" aria-hidden="true">
            <FolderOpen />
          </span>
          <span className="home-action-label">{t("home.openProject")}</span>
          <span className="home-action-hint">{t("home.openProjectHint")}</span>
        </button>
      </div>

      <section className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title">
          {t("home.recent")}
          {recent.length > 0 && <span className="count">{recent.length}</span>}
        </h2>
        {recent.length === 0 ? (
          <p className="recent-empty muted">{t("home.noRecent")}</p>
        ) : (
          <ul>
            {recent.map((r) => (
              <li key={r.path} className={r.available ? "" : "unavailable"}>
                <button type="button" className="recent-open" disabled={!r.available} onClick={() => onOpen(r.path)}>
                  <span className="recent-icon" aria-hidden="true">
                    <Clapperboard />
                  </span>
                  <span className="recent-title">{r.title}</span>
                  <span className="recent-path">{r.available ? r.path : `${r.path} — ${t("home.unavailable")}`}</span>
                  <span className="recent-date">{t("home.openedAt", { date: dateFormat.format(new Date(r.openedAt)) })}</span>
                </button>
                <button type="button" className="btn ghost icon-only recent-forget" aria-label={`${t("home.forget")} : ${r.title}`} title={t("home.forget")} onClick={() => void forget(r.path)}>
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="home-foot">
        <span className="muted">
          {startup && t("app.version", { version: startup.version })}
          {startup?.portable && ` · ${t("app.portable")}`}
        </span>
        <button type="button" className="btn ghost small" onClick={() => setSettings(true)}>
          <Settings aria-hidden="true" />
          Réglages
        </button>
      </footer>

      {settings && <SettingsDialog notify={notify} onOpenProject={onOpen} onClose={() => setSettings(false)} />}
      {creating && (
        <NewProjectDialog
          onCancel={() => setCreating(false)}
          onCreate={async (parent, title, formatId) => {
            await onCreate(parent, title, formatId);
            setCreating(false);
          }}
        />
      )}
    </main>
  );
}
