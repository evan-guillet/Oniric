import { createContext, useContext, type ReactNode } from "react";
import type { OpenState } from "../../../bindings";
import type { ChoiceRequest } from "../../../ui-kit/Dialog";
import type { ToastMessage } from "../../../ui-kit/Toast";
import type { ScriptSession } from "../../script/screenplay/application/scriptSession";

export type ViewId =
  | "dashboard"
  | "workshop"
  | "bible"
  | "script"
  | "structure"
  | "versions"
  | "stats"
  | "settings"
  | "moodboard"
  | "shotlist"
  | "storyboard"
  | "team"
  | "breakdown"
  | "schedule"
  | "callsheets"
  | "budget"
  | "scouting"
  | "permits";

export interface ProjectApi {
  project: OpenState;
  session: ScriptSession;
  notify: (m: Omit<ToastMessage, "id">) => void;
  ask: (r: ChoiceRequest) => Promise<string | null>;
  /** Asks for a line of text; null when cancelled. */
  prompt: (title: string, label: string, initial?: string) => Promise<string | null>;
  go: (view: ViewId) => void;
  openScene: (id: string) => void;
  openEntry: (id: string) => void;
  /** Prints `content` to a PDF in `exports/` and tells the user. */
  printPdf: (fileName: string, content: ReactNode, page: { width: number; height: number; css?: string }) => Promise<void>;
  /** The right end of the view header, where the current view puts its own buttons (through a portal). */
  headerActions: HTMLElement | null;
  /** Opens the project's import or export window, on `section` when given. */
  transfer: (mode: TransferMode, section?: TransferSection) => void;
  /** Where the user is inside the current view, from the view itself down; the last crumb becomes the header title. Null for the view's top. */
  setTrail: (trail: Crumb[] | null) => void;
}

export interface Crumb {
  label: string;
  /** Goes back to this level; absent on the last crumb. */
  onClick?: () => void;
  count?: number;
}

export type TransferMode = "import" | "export";
export type TransferSection = "script" | "bible" | "workshop";

export const ProjectContext = createContext<ProjectApi | null>(null);

export function useProject(): ProjectApi {
  const api = useContext(ProjectContext);
  if (!api) throw new Error("useProject hors d'un projet");
  return api;
}
