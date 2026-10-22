import { parseJson } from "../../../../core/db/live";
import { TITLE_PAGE_SETTING, type TitlePage } from "../domain/titlePage";
import { readSetting, writeSetting } from "./settings";

export async function readTitlePage(): Promise<TitlePage | null> {
  return parseJson<TitlePage | null>(await readSetting(TITLE_PAGE_SETTING), null);
}

export async function writeTitlePage(p: TitlePage): Promise<void> {
  await writeSetting(TITLE_PAGE_SETTING, JSON.stringify(p));
}
