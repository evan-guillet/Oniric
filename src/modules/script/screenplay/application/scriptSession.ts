import { useSyncExternalStore } from "react";
import type { Node as PMNode } from "prosemirror-model";
import type { SaveScheduler, SaveState } from "./saveScheduler";
import type { EditorSnapshot, ScriptEditor } from "../ui/editor/ScriptEditor";
import { sceneCharacters } from "../ui/editor/schema";

export interface SceneInfo {
  id: string;
  index: number;
  heading: string;
  characters: string[];
  eighths: number;
  /** Page where the scene starts. */
  page: number;
  /** Text of the scene, elements separated by new lines. */
  text: string;
  node: PMNode;
}

/**
 * The open screenplay, shared by every view of the story (architecture, 5.4): the editor holds the text,
 * and the other views act on it through here, so that Ctrl+Z and the saving keep working as usual.
 */
export class ScriptSession {
  editor: ScriptEditor | null = null;
  scheduler: SaveScheduler | null = null;
  snapshot: EditorSnapshot | null = null;
  saveState: SaveState = "saved";
  private docVersion = 0;
  private stateVersion = 0;
  private docListeners = new Set<() => void>();
  private stateListeners = new Set<() => void>();
  private cache: { version: number; scenes: SceneInfo[] } | null = null;

  attach(editor: ScriptEditor, scheduler: SaveScheduler): void {
    this.editor = editor;
    this.scheduler = scheduler;
    this.snapshot = editor.snapshot;
    this.docChanged();
  }

  detach(): void {
    this.editor = null;
    this.scheduler = null;
    this.docChanged();
  }

  /** Every editor update: cursor, pages. */
  setSnapshot(s: EditorSnapshot): void {
    this.snapshot = s;
    this.stateChanged();
  }

  setSaveState(s: SaveState): void {
    this.saveState = s;
    this.stateChanged();
  }

  docChanged(): void {
    this.docVersion++;
    this.docListeners.forEach((l) => l());
    this.stateChanged();
  }

  private stateChanged(): void {
    this.stateVersion++;
    this.stateListeners.forEach((l) => l());
  }

  subscribeDoc = (l: () => void) => {
    this.docListeners.add(l);
    return () => this.docListeners.delete(l);
  };

  subscribeState = (l: () => void) => {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  };

  getDocVersion = () => this.docVersion;
  getStateVersion = () => this.stateVersion;

  scenes(): SceneInfo[] {
    if (this.cache?.version === this.docVersion) return this.cache.scenes;
    const editor = this.editor;
    const scenes: SceneInfo[] = [];
    if (editor) {
      const snap = editor.snapshot;
      const firstPage: number[] = [];
      for (const page of snap.pagination.pages) {
        for (const line of page.lines) {
          const s = snap.blocks[line.blockIndex]?.sceneIndex;
          if (s !== undefined && firstPage[s] === undefined) firstPage[s] = page.number;
        }
      }
      editor.doc.forEach((node, _o, index) => {
        const lines: string[] = [];
        node.forEach((b) => lines.push(b.textContent));
        scenes.push({
          id: node.attrs.id as string,
          index,
          heading: node.firstChild?.type.name === "scene_heading" ? node.firstChild.textContent : "",
          characters: sceneCharacters(node),
          eighths: snap.pagination.sceneEighths[index] ?? 0,
          page: firstPage[index] ?? 1,
          text: lines.join("\n"),
          node,
        });
      });
    }
    this.cache = { version: this.docVersion, scenes };
    return scenes;
  }

  /** Writes what the editor has not saved yet, so that the scene rows exist before other tables point to them. */
  async flush(): Promise<void> {
    await this.scheduler?.flush();
  }
}

/** The scenes of the screenplay, refreshed when the text changes. */
export function useScenes(session: ScriptSession): SceneInfo[] {
  useSyncExternalStore(session.subscribeDoc, session.getDocVersion);
  return session.scenes();
}

/** Re-renders on every editor update (cursor, saving state). */
export function useSessionState(session: ScriptSession): number {
  return useSyncExternalStore(session.subscribeState, session.getStateVersion);
}
