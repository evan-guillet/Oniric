import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson, useLive } from "../../../core/db/live";
import type { TableName } from "../../../core/db/schema";
import { uuidv7 } from "../../../core/ids";
import { readSetting, writeSetting } from "../../script/screenplay/application/settings";
import { dayReport, sheetData, template, type CallSheetData, type DayReport, type SentVersion, type Template } from "../domain/callSheet";

export const SHEET_TABLES: TableName[] = ["call_sheet", "call_recipient"];

export interface Sheet {
  id: string;
  dayId: string;
  data: CallSheetData;
  versions: SentVersion[];
  report: DayReport;
}

export interface Recipient {
  sheetId: string;
  contactId: string;
  callTime: string;
  sent: boolean;
  confirmed: boolean;
}

export async function loadSheets(): Promise<{ sheets: Sheet[]; recipients: Recipient[] }> {
  const [sheets, recipients] = await Promise.all([query(db.selectFrom("call_sheet").selectAll()), query(db.selectFrom("call_recipient").selectAll())]);
  return {
    sheets: sheets.map((r) => ({
      id: r.id,
      dayId: r.day_id,
      data: sheetData(parseJson(r.data, {})),
      versions: parseJson<SentVersion[]>(r.versions, []).map((v) => ({ ...v, data: sheetData(v.data) })),
      report: dayReport(parseJson(r.report, {})),
    })),
    recipients: recipients.map((r) => ({ sheetId: r.sheet_id, contactId: r.contact_id, callTime: r.call_time, sent: r.sent === 1, confirmed: r.confirmed === 1 })),
  };
}

export function useSheets() {
  return useLive(loadSheets, SHEET_TABLES);
}

/** The sheet of a day, made from the schedule the first time it is opened [FDS-01]; returns its id. */
export async function createSheet(dayId: string, data: CallSheetData): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Feuille de service", ["call_sheet"], [
    db
      .insertInto("call_sheet")
      .values({ id, day_id: dayId, data: JSON.stringify(data), created_at: now, updated_at: now })
      .onConflict((oc) => oc.column("day_id").doNothing()),
  ]);
  return id;
}

export async function saveSheet(id: string, data: CallSheetData): Promise<void> {
  await write("Feuille de service", ["call_sheet"], [db.updateTable("call_sheet").set({ data: JSON.stringify(data), updated_at: nowIso() }).where("id", "=", id)]);
}

/** The sheet as it goes out now becomes a numbered version; the ticks of who got and confirmed it start again [FDS-07]. */
export async function sendVersion(sheet: Sheet): Promise<number> {
  const n = (sheet.versions[sheet.versions.length - 1]?.n ?? 0) + 1;
  const versions = [...sheet.versions, { n, at: nowIso(), data: sheet.data }];
  await write(`Version ${n} de la feuille`, SHEET_TABLES, [
    db.updateTable("call_sheet").set({ versions: JSON.stringify(versions), updated_at: nowIso() }).where("id", "=", sheet.id),
    db.updateTable("call_recipient").set({ sent: 0, confirmed: 0 }).where("sheet_id", "=", sheet.id),
  ]);
  return n;
}

export async function saveReport(id: string, report: DayReport): Promise<void> {
  await write("Rapport de fin de journée", ["call_sheet"], [db.updateTable("call_sheet").set({ report: JSON.stringify(report), updated_at: nowIso() }).where("id", "=", id)]);
}

export async function setRecipient(sheetId: string, contactId: string, patch: Partial<Pick<Recipient, "callTime" | "sent" | "confirmed">>): Promise<void> {
  const set = {
    ...(patch.callTime !== undefined && { call_time: patch.callTime }),
    ...(patch.sent !== undefined && { sent: patch.sent ? 1 : 0 }),
    ...(patch.confirmed !== undefined && { confirmed: patch.confirmed ? 1 : 0 }),
  };
  await write("Destinataire", ["call_recipient"], [
    db
      .insertInto("call_recipient")
      .values({ sheet_id: sheetId, contact_id: contactId, ...set })
      .onConflict((oc) => oc.columns(["sheet_id", "contact_id"]).doUpdateSet(set)),
  ]);
}

const TEMPLATE = "callsheet_template";

export async function readTemplate(): Promise<Template> {
  return template(parseJson(await readSetting(TEMPLATE), {}));
}

export function useTemplate(): Template | undefined {
  return useLive(readTemplate, ["project_setting"]);
}

export function writeTemplate(t: Template): Promise<number> {
  return writeSetting(TEMPLATE, JSON.stringify(t));
}
