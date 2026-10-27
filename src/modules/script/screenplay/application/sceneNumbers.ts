import { useLive } from "../../../../core/db/live";
import { readSetting, writeSetting } from "./settings";

/** Where the scene numbers print, beside each scene heading, as in a shooting script. */
export type SceneNumbers = "none" | "left" | "right" | "both";

export const SCENE_NUMBERS_SETTING = "scene_numbers";

const isSceneNumbers = (v: unknown): v is SceneNumbers => v === "none" || v === "left" || v === "right" || v === "both";

export async function readSceneNumbers(): Promise<SceneNumbers> {
  const v = await readSetting(SCENE_NUMBERS_SETTING);
  return isSceneNumbers(v) ? v : "none";
}

export function writeSceneNumbers(v: SceneNumbers): Promise<number> {
  return writeSetting(SCENE_NUMBERS_SETTING, v);
}

export function useSceneNumbers(): SceneNumbers {
  return useLive(readSceneNumbers, ["project_setting"]) ?? "none";
}
