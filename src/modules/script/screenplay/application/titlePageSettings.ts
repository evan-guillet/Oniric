import { db, query } from "../../../../core/db/client";
import { parseJson } from "../../../../core/db/live";
import {
  formatTitleDate,
  normalizeTitlePage,
  resolveTitlePage,
  TITLE_PAGE_SETTING,
  type TitleAuto,
  type TitlePage,
} from "../domain/titlePage";
import { readProfile } from "../../../project/application/profile";
import { readProjectFormat } from "./formatSettings";
import { readSetting, writeSetting } from "./settings";

/** The title page as saved, without the automatic fields filled in. */
export async function readTitlePageRaw(): Promise<TitlePage | null> {
  const raw = parseJson<Partial<TitlePage> | null>(await readSetting(TITLE_PAGE_SETTING), null);
  return raw ? normalizeTitlePage(raw) : null;
}

/** The title page as it prints today. */
export async function readTitlePage(): Promise<TitlePage | null> {
  const [p, auto, profile] = await Promise.all([readTitlePageRaw(), titleAuto(), readProfile()]);
  return p ? resolveTitlePage(p, auto, profile) : null;
}

/** The version in progress (the name the next freeze proposes) and today's date, in the screenplay's language. */
export async function titleAuto(): Promise<TitleAuto> {
  const [versions, format] = await Promise.all([query(db.selectFrom("script_version").select("id")), readProjectFormat()]);
  return { version: `V${versions.length + 1}`, date: formatTitleDate(new Date(), format.language) };
}

export async function writeTitlePage(p: TitlePage): Promise<void> {
  await writeSetting(TITLE_PAGE_SETTING, JSON.stringify(p));
}
