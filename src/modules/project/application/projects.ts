import { commands, type OpenState, type ProbeState } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { FORMAT_SETTING } from "../../script/screenplay/application/formatSettings";
import { writeSetting } from "../../script/screenplay/application/settings";
import { SceneStore } from "../../script/screenplay/application/sceneStore";
import { writeTitlePage } from "../../script/screenplay/application/titlePageSettings";
import { docFromBlocks } from "../../script/screenplay/ui/editor/schema";
import type { ScriptImport } from "../../../interop/importScript";

/** The folder of a project, from its `projet.oniric` file. */
export function projectDirOf(file: string): string {
  const cut = Math.max(file.lastIndexOf("\\"), file.lastIndexOf("/"));
  return cut > 0 ? file.slice(0, cut) : file;
}

export async function probeProject(dir: string): Promise<ProbeState> {
  return unwrap(await commands.projectProbe(dir));
}

export async function openProject(dir: string, restore = true, forceLock = false): Promise<OpenState> {
  return unwrap(await commands.projectOpen(dir, restore, forceLock));
}

/** A new project, empty or holding an imported screenplay [EDT-10]. */
export async function createProject(parent: string, title: string, formatId: string, imported?: ScriptImport): Promise<OpenState> {
  const state = unwrap(await commands.projectCreate(parent, title));
  await writeSetting(FORMAT_SETTING, formatId);
  if (imported && imported.blocks.length > 0) {
    const store = new SceneStore();
    await store.load();
    await store.save(docFromBlocks(imported.blocks), []);
    if (imported.titlePage) await writeTitlePage({ ...imported.titlePage, title });
  }
  return state;
}
