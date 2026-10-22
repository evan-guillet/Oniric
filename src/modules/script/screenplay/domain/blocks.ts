import type { ElementType } from "./formats";

/** One screenplay element, independent from the editor: the shared form for imports, exports and tests. */
export interface ScriptBlock {
  type: ElementType;
  text: string;
}
