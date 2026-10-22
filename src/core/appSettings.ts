import { commands } from "../bindings";
import { unwrap } from "./db/client";
import { parseJson } from "./db/live";

/** Settings shared by all projects, kept in the application database (profile, formats). */
export async function readAppSetting<T>(key: string, fallback: T): Promise<T> {
  return parseJson(unwrap(await commands.appSettingGet(key)), fallback);
}

export async function writeAppSetting(key: string, value: unknown): Promise<void> {
  unwrap(await commands.appSettingSet(key, JSON.stringify(value)));
}
