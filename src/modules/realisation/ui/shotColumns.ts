import { t } from "../../../core/i18n";

/** The fields of a shot the table can show, in its order [DEC-02, DEC-04]. */
export const SHOT_COLUMNS = [
  "frame",
  "size",
  "angle",
  "movement",
  "support",
  "lens",
  "camera",
  "frameRate",
  "sound",
  "characters",
  "action",
  "dialogue",
  "duration",
  "setup",
  "lighting",
  "effects",
  "notes",
] as const;
export type ShotColumn = (typeof SHOT_COLUMNS)[number];

export const HIDDEN_KEY = "oniric.shotlist.hidden";
export const DEFAULT_HIDDEN: ShotColumn[] = ["support", "camera", "frameRate", "sound", "lighting", "effects"];
/** The order the shots are listed in, set in the settings with the shown fields. */
export const ORDER_KEY = "oniric.shotlist.order";
/** Table or cards, as set in the settings. */
export const SHAPE_KEY = "oniric.shotlist.shape";

export type ShotShape = "table" | "cards";
export type ShotOrder = "edit" | "shoot";

export const columnLabel = (c: ShotColumn) => t(`shotlist.columns.${c}`);
