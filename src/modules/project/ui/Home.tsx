import { ArchiveRestore, Clapperboard, FileInput, FolderOpen, Plus, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { commands, type RecentProject, type StartupReport } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { describeError } from "../../../core/errors";
import { importScript, IMPORT_ACCEPT, type ScriptImport } from "../../../interop/importScript";
import type { ToastMessage } from "../../../ui-kit/Toast";
import { projectDirOf } from "../application/projects";
import { NewProjectDialog } from "./NewProjectDialog";
import { SettingsDialog } from "./SettingsView";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

export function Home({
  startup,
  onOpen,
  onCreate,
  notify,
}: {
  startup: StartupReport | null;
  onOpen: (dir: string) => void;
  onCreate: (parent: string, title: string, formatId: string, imported?: ScriptImport) => Promise<void>;
  notify: (m: Omit<ToastMessage, "id">) => void;
}) {
  const { t } = useTranslation();
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [creating, setCreating] = useState(false);
  const [imported, setImported] = useState<ScriptImport | null>(null);
  const [settings, setSettings] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setRecent(unwrap(await commands.recentList()));
  useEffect(() => {
    void refresh();
  }, []);

  const browse = async () => {
    const file = await open({ title: t("home.openDialogTitle"), filters: [{ name: t("home.projectFile"), extensions: ["oniric"] }] });
    if (typeof file === "string") onOpen(projectDirOf(file));
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImported(importScript(file.name, await file.text(), true));
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const restore = async () => {
    const file = await open({ title: "Choisir une sauvegarde", filters: [{ name: "Sauvegarde Oniric", extensions: ["db"] }] });
    if (typeof file !== "string") return;
    const parent = await open({ directory: true, title: "Où recréer le projet ?" });
    if (typeof parent !== "string") return;
    try {
      onOpen(unwrap(await commands.backupRestore(file, parent)));
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const forget = async (path: string) => {
    unwrap(await commands.recentForget(path));
    await refresh();
  };

  return (
    <main className="home">
      <header className="home-head">
        <img src="/oniric.svg" alt="" className="home-logo" width="56" height="56" />
        <div>
          <h1>{t("app.name")}</h1>
          <p className="muted">{t("app.tagline")}</p>
        </div>
      </header>

      <div className="home-actions">
        <button type="button" className="btn primary large" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t("home.newProject")}
        </button>
        <button type="button" className="btn large" onClick={browse}>
          <FolderOpen aria-hidden="true" />
          {t("home.openProject")}
        </button>
        <button type="button" className="btn large" onClick={() => fileRef.current?.click()}>
          <FileInput aria-hidden="true" />
          Importer un scénario…
        </button>
        <input ref={fileRef} type="file" className="home-import" accept={IMPORT_ACCEPT} hidden onChange={(e) => void importFile(e.target.files?.[0])} />
      </div>
      <div className="home-links">
        <button type="button" className="btn ghost small" onClick={() => void restore()}>
          <ArchiveRestore aria-hidden="true" />
          Restaurer une sauvegarde…
        </button>
        <button type="button" className="btn ghost small" onClick={() => setSettings(true)}>
          <Settings aria-hidden="true" />
          Réglages
        </button>
      </div>

      <section className="recent" aria-labelledby="recent-title">
        <h2 id="recent-title">
          {t("home.recent")}
          {recent.length > 0 && <span className="count">{recent.length}</span>}
        </h2>
        {recent.length === 0 ? (
          <p className="muted">{t("home.noRecent")}</p>
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
                <button type="button" className="btn ghost small" onClick={() => forget(r.path)}>
                  {t("home.forget")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="home-foot muted">
        {startup && t("app.version", { version: startup.version })}
        {startup?.portable && ` · ${t("app.portable")}`}
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
      {imported && (
        <NewProjectDialog
          initialTitle={imported.title}
          intro={`« ${imported.fileName} » : ${imported.blocks.length} éléments reconnus. Un nouveau projet va le recevoir.`}
          onCancel={() => setImported(null)}
          onCreate={async (parent, title, formatId) => {
            await onCreate(parent, title, formatId, imported);
            setImported(null);
          }}
        />
      )}
    </main>
  );
}
