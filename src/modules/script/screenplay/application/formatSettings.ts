import { readAppSetting, writeAppSetting } from "../../../../core/appSettings";
import { useLive } from "../../../../core/db/live";
import { FORMATS, formatById, type ScreenplayFormat } from "../domain/formats";
import { readSetting, writeSetting } from "./settings";

export const FORMAT_SETTING = "screenplay_format";
/** The full format of the project when it is a custom one, so that the project opens the same on any PC. */
export const FORMAT_DATA_SETTING = "screenplay_format_data";
/** Custom formats saved as models, shared by all projects [EDT-02, ACC-04]. */
export const FORMAT_LIBRARY = "formats";

export function loadFormatLibrary(): Promise<ScreenplayFormat[]> {
  return readAppSetting<ScreenplayFormat[]>(FORMAT_LIBRARY, []);
}

export function saveFormatLibrary(formats: ScreenplayFormat[]): Promise<void> {
  return writeAppSetting(FORMAT_LIBRARY, formats);
}

export async function readProjectFormat(): Promise<ScreenplayFormat> {
  const [id, data] = await Promise.all([readSetting(FORMAT_SETTING), readSetting(FORMAT_DATA_SETTING)]);
  if (data && id && !FORMATS.some((f) => f.id === id)) {
    try {
      const f = JSON.parse(data) as ScreenplayFormat;
      if (f.id === id) return f;
    } catch {
      // fall back to a provided format
    }
  }
  return formatById(id);
}

export async function writeProjectFormat(f: ScreenplayFormat): Promise<void> {
  await writeSetting(FORMAT_SETTING, f.id);
  if (!FORMATS.some((x) => x.id === f.id)) await writeSetting(FORMAT_DATA_SETTING, JSON.stringify(f));
}

/** Formats to choose from: provided ones, the user's models, and the project's own if it came from another PC. */
export async function availableFormats(): Promise<ScreenplayFormat[]> {
  const [library, current] = await Promise.all([loadFormatLibrary().catch(() => []), readProjectFormat()]);
  const all = [...FORMATS, ...library];
  if (!all.some((f) => f.id === current.id)) all.push(current);
  return all;
}

export function useScriptFormat(): ScreenplayFormat | undefined {
  return useLive(readProjectFormat, ["project_setting"]);
}
