import { Clapperboard, FolderOpen, Pencil, Plus, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { commands, type RecentProject, type StartupReport } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import type { ToastMessage } from "../../../ui-kit/Toast";
import { projectDirOf } from "../application/projects";
import { confirmRemoval, useChoice } from "../../../ui-kit/Dialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { SettingsDialog } from "./SettingsView";
import { dateFormat } from "../../../core/i18n";
import { describeError } from "../../../core/errors";
import { usePrompt } from "../../../ui-kit/PromptDialog";


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
  const [choice, ask] = useChoice();
  const [promptDialog, prompt] = usePrompt();

  const refresh = async () => setRecent(unwrap(await commands.recentList()));
  useEffect(() => {
    void refresh();
  }, []);

  const browse = async () => {
    const file = await open({ title: t("home.openDialogTitle"), filters: [{ name: t("home.projectFile"), extensions: ["oniric"] }] });
    if (typeof file === "string") onOpen(projectDirOf(file));
  };

  // Only the title changes: the folder keeps its name, so nothing that points at it breaks.
  const rename = async (r: RecentProject) => {
    const title = await prompt(t("shell.renameProject"), t("shell.projectTitle"), r.title);
    if (!title || title === r.title) return;
    try {
      unwrap(await commands.projectRename(r.path, title));
      await refresh();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const forget = async (path: string, title: string) => {
    if (!(await confirmRemoval(ask, { title: t("home.forgetAsk", { title }), text: t("home.forgetText"), label: t("home.forgetConfirm") }))) return;
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
                  <span className="recent-date">{t("home.openedAt", { date: dateFormat({ dateStyle: "long", timeStyle: "short" }).format(new Date(r.openedAt)) })}</span>
                </button>
                {r.available && (
                  <button type="button" className="btn ghost icon-only recent-forget" aria-label={`${t("shell.renameProject")} : ${r.title}`} title={t("shell.renameProject")} onClick={() => void rename(r)}>
                    <Pencil aria-hidden="true" />
                  </button>
                )}
                <button type="button" className="btn ghost icon-only recent-forget" aria-label={`${t("home.forget")} : ${r.title}`} title={t("home.forget")} onClick={() => void forget(r.path, r.title)}>
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {choice}
      {promptDialog}
      <footer className="home-foot">
        <span className="muted">
          {startup && t("app.version", { version: startup.version })}
          {startup?.portable && ` · ${t("app.portable")}`}
        </span>
        <button type="button" className="btn ghost small" onClick={() => setSettings(true)}>
          <Settings aria-hidden="true" />
          {t("shell.settings")}
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
