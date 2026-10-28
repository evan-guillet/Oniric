import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands, type OpenState, type StartupReport } from "./bindings";
import { describeCoreError, describeError } from "./core/errors";
import { createProject, openProject, probeProject } from "./modules/project/application/projects";
import type { ScriptImport } from "./interop/importScript";
import { Home } from "./modules/project/ui/Home";
import { ProjectShell, type WorkspaceHandle } from "./modules/project/ui/ProjectShell";
import { useChoice } from "./ui-kit/Dialog";
import { TitleBar } from "./ui-kit/TitleBar";
import { Toasts, type ToastMessage } from "./ui-kit/Toast";
import { dateFormat } from "./core/i18n";

type Screen = { kind: "home" } | { kind: "loading" } | { kind: "project"; state: OpenState };


export function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [startup, setStartup] = useState<StartupReport | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [choiceDialog, ask] = useChoice();
  const workspace = useRef<WorkspaceHandle | null>(null);
  const nextToast = useRef(1);

  const notify = useCallback((m: Omit<ToastMessage, "id">) => setToasts((all) => [...all, { ...m, id: nextToast.current++ }]), []);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((m) => m.id !== id)), []);

  const showProject = useCallback(
    (state: OpenState) => {
      setScreen({ kind: "project", state });
      void getCurrentWindow().setTitle(state.dir);
      if (state.from === "restoredWorkingCopy") notify({ text: t("open.restored") });
      if (state.from === "repairedFromWorkingCopy") notify({ text: t("open.repaired"), tone: "warning", timeout: 0 });
      if (state.keptAside) notify({ text: t("open.keptAside", { path: state.keptAside }), tone: "warning", timeout: 0 });
    },
    [notify, t],
  );

  const openFlow = useCallback(
    async (dir: string) => {
      try {
        const probe = await probeProject(dir);
        if (probe.lock === "openHere") {
          notify({ text: t("open.openHere", { title: probe.title }), tone: "warning" });
          return;
        }
        let forceLock = false;
        if (probe.lock === "openElsewhere") {
          const since = probe.lockSince ? dateFormat({ dateStyle: "long", timeStyle: "short" }).format(new Date(probe.lockSince)) : "?";
          const choice = await ask({
            title: t("open.lockedTitle"),
            text: <p>{t("open.lockedText", { title: probe.title, host: probe.lockHost, since })}</p>,
            cancel: t("open.cancel"),
            choices: [{ label: t("open.lockedOpen"), value: "force", danger: true }],
          });
          if (choice !== "force") return;
          forceLock = true;
        }
        let restore = true;
        if (probe.recoverable) {
          const choice = await ask({
            title: t("open.recoverTitle"),
            text: (
              <>
                <p>{t("open.recoverText", { title: probe.title })}</p>
                <p className="muted small">{t("open.discardHelp")}</p>
              </>
            ),
            choices: [
              { label: t("open.discard"), value: "discard" },
              { label: t("open.restore"), value: "restore", primary: true },
            ],
          });
          if (choice === null) return;
          restore = choice === "restore";
        }
        setScreen({ kind: "loading" });
        showProject(await openProject(dir, restore, forceLock));
      } catch (e) {
        setScreen({ kind: "home" });
        notify({ text: describeError(e), tone: "error" });
      }
    },
    [ask, notify, showProject, t],
  );

  const create = useCallback(
    async (parent: string, title: string, formatId: string, imported?: ScriptImport) => showProject(await createProject(parent, title, formatId, imported)),
    [showProject],
  );

  /** Saves what is pending, closes the project, and says whether it is closed. */
  const closeProject = useCallback(async (): Promise<boolean> => {
    try {
      await workspace.current?.flush();
    } catch (e) {
      const choice = await ask({
        title: t("close.saveFailedTitle"),
        text: <p>{t("close.saveFailedText", { detail: describeError(e) })}</p>,
        cancel: t("open.cancel"),
        choices: [{ label: t("close.closeAnyway"), value: "close", danger: true }],
      });
      if (choice !== "close") return false;
    }
    for (;;) {
      const r = await commands.projectClose(false);
      if (r.status === "ok") break;
      if (r.error.kind !== "notSaved") {
        notify({ text: describeCoreError(r.error), tone: "error" });
        break;
      }
      const choice = await ask({
        title: t("close.notSavedTitle"),
        text: <p>{t("close.notSavedText", { detail: r.error.message })}</p>,
        cancel: t("open.cancel"),
        choices: [
          { label: t("close.closeAnyway"), value: "force", danger: true },
          { label: t("close.retry"), value: "retry", primary: true },
        ],
      });
      if (choice === "retry") continue;
      if (choice !== "force") return false;
      await commands.projectClose(true);
      break;
    }
    setScreen({ kind: "home" });
    void getCurrentWindow().setTitle("Oniric");
    return true;
  }, [ask, notify, t]);

  const live = useRef({ screen, closeProject });
  live.current = { screen, closeProject };

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      event.preventDefault();
      const { screen, closeProject } = live.current;
      if (screen.kind !== "project" || (await closeProject())) await win.destroy();
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      void commands.appReady().then(setStartup);
      void commands.startupProject().then((dir) => {
        if (dir) void openFlow(dir);
      });
    });
  }, [openFlow]);

  return (
    <div className="app-frame">
      <TitleBar title={screen.kind === "project" ? screen.state.dir : "Oniric"} merged={screen.kind === "project"} />
      <div className="app-body">
        {screen.kind === "home" && <Home startup={startup} onOpen={(dir) => void openFlow(dir)} onCreate={create} notify={notify} />}
        {screen.kind === "loading" && (
          <main className="loading" aria-busy="true">
            <p>{t("app.loading")}</p>
          </main>
        )}
        {screen.kind === "project" && (
          <ProjectShell key={screen.state.id} project={screen.state} handle={workspace} notify={notify} ask={ask} onClose={() => void closeProject()} />
        )}
      </div>
      <Toasts messages={toasts} onDismiss={dismiss} dismissLabel={t("workspace.dismiss")} />
      {choiceDialog}
    </div>
  );
}
