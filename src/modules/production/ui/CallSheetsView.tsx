import { ArrowDown, ArrowUp, ClipboardCheck, Download, FileText, ImagePlus, LayoutTemplate, Plus, RefreshCw, Send, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { describeError } from "../../../core/errors";
import { dateFormat, plural, t } from "../../../core/i18n";
import { Dialog } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { MoreMenu, type MoreItem } from "../../../ui-kit/MoreMenu";
import { Segmented } from "../../../ui-kit/Segmented";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useProject } from "../../project/ui/projectContext";
import { useLive } from "../../../core/db/live";
import { loadEntries, type Entry } from "../../script/bible/application/bible";
import { fold } from "../../script/bible/domain/types";
import { formatEighths } from "../../script/screenplay/domain/duration";
import { MediaImage, pickImage } from "../../shared/media";
import { useBreakdown, useCategories, elementsByScene, type Breakdown } from "../application/breakdown";
import { createSheet, saveReport, saveSheet, sendVersion, setRecipient, useSheets, useTemplate, writeTemplate, type Recipient, type Sheet } from "../application/callSheets";
import { usePlans } from "../application/schedule";
import { useTeam, type Team } from "../application/team";
import { categoryName, type Category } from "../domain/breakdown";
import { departmentName } from "../domain/catalog";
import {
  changes,
  dayReport,
  EMPTY_CALL,
  earliest,
  emptySheet,
  normalizeTime,
  SECTIONS,
  type CallLocation,
  type CallSheetData,
  type DayReport,
  type SectionId,
  type Template,
} from "../domain/callSheet";
import { parseDay } from "../domain/schedule";
import { sunTimes } from "../domain/sun";
import { exportCallSheets, exportDayReport } from "./productionExport";
import { Field, HeaderTabs, Section, shortDate } from "./parts";
import { dayTitle, useBoard, type Board } from "./ScheduleView";

type Tab = "sheet" | "recipients" | "report";
type DayInfo = Board["days"][number];

/** The call sheets: one per shooting day, made from the schedule, sent as PDF, its versions and its report [FDS-01 to FDS-08]. */
export function CallSheetsView() {
  const [tab, setTab] = useStoredState<Tab>("oniric.callsheets.tab", "sheet");
  const { project, go } = useProject();
  const plans = usePlans();
  const team = useTeam();
  const b = useBoard(plans, team);
  const sheets = useSheets();
  const [picked, setPicked] = useStoredState<string | null>(`oniric.callsheets.day.${project.id}`, null);
  if (!b || !team || !sheets) return null;
  const days = b.days.filter((d) => d.day.kind === "shoot");
  if (!b.schedule || days.length === 0) {
    return (
      <div className="view view-pad">
        <EmptyState title={t("callsheet.emptyTitle")}>
          <p className="muted">{t("callsheet.emptyText")}</p>
          <button type="button" className="btn" onClick={() => go("schedule")}>
            {t("callsheet.toSchedule")}
          </button>
        </EmptyState>
      </div>
    );
  }
  const day = days.find((d) => d.day.id === picked) ?? days[0];
  const sheet = sheets.sheets.find((s) => s.dayId === day.day.id) ?? null;
  const status = (d: DayInfo) => {
    const s = sheets.sheets.find((x) => x.dayId === d.day.id);
    if (!s) return { text: t("callsheet.none"), tone: "" };
    const last = s.versions[s.versions.length - 1];
    if (!last) return { text: t("callsheet.draft"), tone: "warn" };
    const changed = changes(last.data, s.data).size > 0;
    return changed ? { text: t("callsheet.changedSince", { n: last.n }), tone: "warn" } : { text: t("callsheet.sent", { n: last.n }), tone: "ok" };
  };
  return (
    <>
      {sheet && (
        <HeaderTabs
          label={t("callsheet.display")}
          value={tab}
          onChange={setTab}
          options={[
            { id: "sheet", label: t("callsheet.sheet"), icon: FileText },
            { id: "recipients", label: t("callsheet.recipients"), icon: Users },
            { id: "report", label: t("callsheet.report"), icon: ClipboardCheck },
          ]}
        />
      )}
      <div className="view split pr-split">
        <nav className="view-side pr-side" aria-label={t("callsheet.days")}>
          <ul className="pr-side-list">
            {days.map((d) => {
              const st = status(d);
              return (
                <li key={d.day.id}>
                  <button type="button" className={d.day.id === day.day.id ? "on" : ""} aria-current={d.day.id === day.day.id} onClick={() => setPicked(d.day.id)}>
                    <span className="pr-row-title">{t("schedule.dayN", { n: d.number, total: b.shootDays })}</span>
                    <span className="pr-side-sub">{d.date ? shortDate(d.date) : t("schedule.noDate")}</span>
                    <span className={`pr-side-state ${st.tone}`}>{st.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="view-main pr-sheet-main">
          {sheet ? (
            <SheetPage key={sheet.id} board={b} team={team} day={day} sheet={sheet} recipients={sheets.recipients.filter((r) => r.sheetId === sheet.id)} tab={tab} />
          ) : (
            <NewSheet board={b} team={team} day={day} />
          )}
        </main>
      </div>
    </>
  );
}

/** The sheet of a day not prepared yet, and the button that fills it from the schedule [FDS-01]. */
function NewSheet({ board: b, team, day }: { board: Board; team: Team; day: DayInfo }) {
  const { notify } = useProject();
  const breakdown = useBreakdown();
  const cats = useCategories();
  const entries = useLive(loadEntries, ["bible_entry"]);
  const make = async () => {
    try {
      await createSheet(day.day.id, prefill(emptySheet(), b, team, day, breakdown, cats ?? [], entries ?? []));
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <EmptyState title={t("callsheet.prepareTitle", { day: dayTitle(day) })}>
      <p className="muted">{t("callsheet.prepareText")}</p>
      <button type="button" className="btn primary" disabled={!breakdown || !cats || !entries} onClick={() => void make()}>
        <Plus aria-hidden="true" />
        {t("callsheet.prepare")}
      </button>
    </EmptyState>
  );
}

const NEEDS = ["vehicles", "animals", "wrangler", "stunts", "sfx", "vfx", "equipment", "security", "makeup", "wardrobe", "props", "music", "sound"];

/** What the schedule, the team, the breakdown and the bible already know of a day, written into its sheet. */
export function prefill(
  base: CallSheetData,
  b: Board,
  team: Team,
  day: DayInfo,
  breakdown: Breakdown | undefined,
  cats: Category[],
  entries: Entry[],
): CallSheetData {
  const places = [...new Set(day.scenes.map((s) => s.facts.place).filter(Boolean))];
  const known = new Map(base.locations.map((l) => [fold(l.name), l]));
  const locations: CallLocation[] = places.map((p) => {
    const kept = known.get(fold(p));
    if (kept) return kept;
    const entry = entries.find((e) => e.type === "location" && [e.name, ...e.aliases].some((n) => fold(n) === fold(p)));
    const real = typeof entry?.fields.real_set === "string" ? entry.fields.real_set : "";
    return { name: p, address: real, coordinates: "", parking: "", notes: "" };
  });
  const cast: CallSheetData["cast"] = {};
  for (const c of day.characters) cast[c] = base.cast[c] ?? { ...EMPTY_CALL };
  const per = breakdown ? elementsByScene(breakdown) : new Map();
  const qty = new Map(breakdown?.items.map((i) => [`${i.sceneId}:${i.elementId}`, i.quantity]) ?? []);
  const catName = new Map(cats.map((c) => [c.id, categoryName(c)]));
  const lines = (ids: string[]) =>
    ids
      .map((cat) => {
        const found = new Map<string, string[]>();
        for (const s of day.scenes)
          for (const e of per.get(s.scene.id) ?? [])
            if (e.category === cat) {
              const n = qty.get(`${s.scene.id}:${e.id}`);
              const name = n ? `${e.name} (${n})` : e.name;
              found.set(name, [...(found.get(name) ?? []), s.scene.number]);
            }
        if (!found.size) return null;
        return `${catName.get(cat) ?? cat} : ${[...found.entries()].map(([n, sc]) => `${n} – ${t("callsheet.scenesShort", { list: sc.join(", ") })}`).join(" ; ")}`;
      })
      .filter(Boolean)
      .join("\n");
  const shoot = b.days.filter((d) => d.day.kind === "shoot");
  const next = shoot[shoot.findIndex((d) => d.day.id === day.day.id) + 1];
  const nextDay = next
    ? `${dayTitle(next)} : ${next.scenes.map((s) => `${s.scene.number} ${s.facts.place}`.trim()).join(" · ")}`
    : t("callsheet.lastDay");
  const contact = new Map(team.contacts.map((c) => [c.id, c]));
  const keys = team.crew
    .filter((m) => m.head || ["production", "direction"].includes(m.department))
    .slice(0, 8)
    .map((m) => {
      const c = contact.get(m.contactId);
      return [m.role, c?.name, c?.data.phone].filter(Boolean).join(" – ");
    })
    .join("\n");
  return {
    ...base,
    locations,
    cast,
    extras: base.extras || lines(["extras", "bits"]),
    needs: base.needs || lines(NEEDS),
    nextDay,
    contacts: base.contacts || keys,
    emergency: base.emergency || t("callsheet.emergencyDefault"),
  };
}

function SheetPage({ board: b, team, day, sheet, recipients, tab }: { board: Board; team: Team; day: DayInfo; sheet: Sheet; recipients: Recipient[]; tab: Tab }) {
  const api = useProject();
  const { notify, ask } = api;
  const template = useTemplate();
  const breakdown = useBreakdown();
  const cats = useCategories();
  const entries = useLive(loadEntries, ["bible_entry"]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const data = sheet.data;
  const last = sheet.versions[sheet.versions.length - 1];
  const changed = useMemo(() => (last ? changes(last.data, data) : new Set<string>()), [last, data]);
  const save = (patch: Partial<CallSheetData>) => void saveSheet(sheet.id, { ...data, ...patch }).catch(fail);
  const people = useRecipients(team, day, data, recipients);

  const send = async () => {
    const n = (last?.n ?? 0) + 1;
    const answer = await ask({
      title: t("callsheet.sendTitle", { n }),
      text: <p>{last ? t("callsheet.sendAgainText", { count: changed.size }) : t("callsheet.sendText")}</p>,
      cancel: t("common.cancel"),
      choices: [{ label: t("callsheet.sendGo", { n }), value: "y", primary: true }],
    });
    if (answer !== "y") return;
    try {
      await sendVersion(sheet);
      notify({ text: t("callsheet.sentDone", { n }) });
    } catch (e) {
      fail(e);
    }
  };
  const refill = () => {
    if (!breakdown || !cats || !entries) return;
    void saveSheet(sheet.id, prefill(data, b, team, day, breakdown, cats, entries)).catch(fail);
  };
  const exports: MoreItem[] = [
    { label: t("callsheet.exportGeneral"), icon: Download, onClick: () => void exportCallSheets(api, { board: b, team, day, sheet, template: template!, people, individual: false }).catch(fail) },
    {
      label: t("callsheet.exportEach"),
      icon: Users,
      hint: plural("callsheet.exportEachHint", people.length),
      onClick: () => void exportCallSheets(api, { board: b, team, day, sheet, template: template!, people, individual: true }).catch(fail),
    },
    { label: t("callsheet.exportReport"), icon: ClipboardCheck, onClick: () => void exportDayReport(api, { day, sheet, total: b.shootDays }).catch(fail) },
  ];

  return (
    <div className="pr-sheet">
      <header className="pr-sheet-head">
        <div>
          <h2>{t("schedule.dayN", { n: day.number, total: b.shootDays })}</h2>
          <p className="muted">
            {day.date ? dateFormat({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDay(day.date)) : t("schedule.noDate")}
            {" · "}
            {last ? (changed.size ? t("callsheet.changedSince", { n: last.n }) : t("callsheet.sentOn", { n: last.n, date: shortDate(last.at.slice(0, 10)) })) : t("callsheet.draft")}
          </p>
        </div>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => setTemplateOpen(true)}>
          <LayoutTemplate aria-hidden="true" />
          {t("callsheet.template")}
        </button>
        <MoreMenu label={t("callsheet.exportMenu")} items={exports} />
        <button type="button" className="btn primary" disabled={!!last && changed.size === 0} onClick={() => void send()}>
          <Send aria-hidden="true" />
          {t("callsheet.sendN", { n: (last?.n ?? 0) + 1 })}
        </button>
      </header>
      {tab === "sheet" && template && (
        <>
          {last && changed.size > 0 && <p className="pr-changed-note">{t("callsheet.changedNote", { n: last.n })}</p>}
          {template.sections
            .filter((s) => s.shown)
            .map((s) => (
              <SheetSection key={s.id} id={s.id} data={data} day={day} team={team} changed={changed} save={save} onRefill={refill} />
            ))}
        </>
      )}
      {tab === "recipients" && <Recipients sheet={sheet} people={people} />}
      {tab === "report" && <Report sheet={sheet} day={day} />}
      {templateOpen && template && <TemplateDialog template={template} onClose={() => setTemplateOpen(false)} />}
    </div>
  );
}

/** A person called that day: their call time, what they are there for, and the ticks of the sheet sent and confirmed. */
export interface Person {
  contactId: string;
  name: string;
  what: string;
  time: string;
  own: boolean;
  sent: boolean;
  confirmed: boolean;
}

/** The crew engaged on the day, and the actors of its scenes, each with their call [FDS-03]. */
function useRecipients(team: Team, day: DayInfo, data: CallSheetData, recipients: Recipient[]): Person[] {
  return useMemo(() => {
    const out = new Map<string, Person>();
    const contact = new Map(team.contacts.map((c) => [c.id, c]));
    const kept = new Map(recipients.map((r) => [r.contactId, r]));
    const add = (contactId: string, what: string, time: string) => {
      const c = contact.get(contactId);
      if (!c) return;
      const known = out.get(contactId);
      const r = kept.get(contactId);
      if (known) {
        known.what = `${known.what} · ${what}`;
        known.time = earliest([known.time, time]) || known.time;
        return;
      }
      out.set(contactId, { contactId, name: c.name, what, time: r?.callTime || time, own: !!r?.callTime, sent: !!r?.sent, confirmed: !!r?.confirmed });
    };
    for (const character of day.characters) {
      const role = team.cast.find((x) => x.character === character);
      if (role?.contactId) {
        const call = data.cast[character];
        add(role.contactId, t("team.plays", { name: character }), earliest([call?.pickup ?? "", call?.hmc ?? "", call?.onSet ?? ""]) || data.generalCall);
      }
    }
    for (const m of team.crew) {
      if (day.date && ((m.startDate && day.date < m.startDate) || (m.endDate && day.date > m.endDate))) continue;
      add(m.contactId, m.role, data.departments[m.department] || data.generalCall);
    }
    for (const r of recipients) if (!out.has(r.contactId)) add(r.contactId, t("callsheet.guest"), r.callTime || data.generalCall);
    return [...out.values()].sort((a, b) => (a.time || "99").localeCompare(b.time || "99") || a.name.localeCompare(b.name));
  }, [team, day, data, recipients]);
}

function SheetSection({
  id,
  data,
  day,
  team,
  changed,
  save,
  onRefill,
}: {
  id: SectionId;
  data: CallSheetData;
  day: DayInfo;
  team: Team;
  changed: Set<string>;
  save: (p: Partial<CallSheetData>) => void;
  onRefill: () => void;
}) {
  const c = (path: string) => (changed.has(path) ? "changed" : "");
  const title = t(`callsheet.sections.${id}`);
  switch (id) {
    case "times": {
      const sun = day.date && data.locations[0]?.coordinates ? sunTimes(day.date, data.locations[0].coordinates) : null;
      const time = (key: "generalCall" | "readyToShoot" | "lunch" | "wrap", label: string) => (
        <Field key={key} label={label} className={c(key)} value={data[key]} placeholder={t("callsheet.timePlaceholder")} normalize={normalizeTime} onCommit={(v) => save({ [key]: v })} />
      );
      return (
        <Section title={title} className={c("generalCall") || c("readyToShoot") || c("lunch") || c("wrap") || c("weather")}>
          <div className="pr-grid four">
            {time("generalCall", t("callsheet.generalCall"))}
            {time("readyToShoot", t("callsheet.readyToShoot"))}
            {time("lunch", t("callsheet.lunch"))}
            {time("wrap", t("callsheet.wrap"))}
            <Field label={t("callsheet.weather")} className={`wide ${c("weather")}`} value={data.weather} placeholder={t("callsheet.weatherPlaceholder")} onCommit={(v) => save({ weather: v })} />
            <Field label={t("callsheet.sunrise")} className={c("sunrise")} value={data.sunrise} placeholder={sun?.rise ?? "–"} normalize={normalizeTime} onCommit={(v) => save({ sunrise: v })} />
            <Field label={t("callsheet.sunset")} className={c("sunset")} value={data.sunset} placeholder={sun?.set ?? "–"} normalize={normalizeTime} onCommit={(v) => save({ sunset: v })} />
          </div>
          <p className="muted small">{sun ? t("callsheet.sunComputed") : t("callsheet.sunHelp")}</p>
        </Section>
      );
    }
    case "locations":
      return (
        <Section
          title={title}
          className={c("locations") || c("base")}
          aside={
            <button type="button" className="btn small" onClick={() => save({ locations: [...data.locations, { name: "", address: "", coordinates: "", parking: "", notes: "" }] })}>
              <Plus aria-hidden="true" />
              {t("callsheet.addLocation")}
            </button>
          }
        >
          {data.locations.map((l, i) => {
            const set = (p: Partial<CallLocation>) => save({ locations: data.locations.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <div key={i} className={`pr-loc ${c(`locations.${i}`)}`}>
                <div className="pr-grid">
                  <Field label={t("callsheet.setName")} value={l.name} onCommit={(v) => set({ name: v })} />
                  <Field label={t("callsheet.coordinates")} value={l.coordinates} placeholder={t("callsheet.coordinatesPlaceholder")} onCommit={(v) => set({ coordinates: v })} />
                  <Field label={t("callsheet.address")} className="wide" multiline value={l.address} onCommit={(v) => set({ address: v })} />
                  <Field label={t("callsheet.parking")} value={l.parking} onCommit={(v) => set({ parking: v })} />
                  <Field label={t("callsheet.access")} value={l.notes} onCommit={(v) => set({ notes: v })} />
                </div>
                <button
                  type="button"
                  className="btn tiny ghost pr-loc-x"
                  aria-label={t("callsheet.removeLocation", { name: l.name })}
                  title={t("callsheet.removeLocation", { name: l.name })}
                  onClick={() => save({ locations: data.locations.filter((_x, j) => j !== i) })}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <Field label={t("callsheet.base")} className={c("base")} multiline value={data.base} placeholder={t("callsheet.basePlaceholder")} onCommit={(v) => save({ base: v })} />
        </Section>
      );
    case "safety":
      return (
        <Section title={title} className={c("hospital") || c("pharmacy") || c("emergency") || c("safety")}>
          <div className="pr-grid">
            <Field label={t("callsheet.hospital")} className={c("hospital")} multiline value={data.hospital} onCommit={(v) => save({ hospital: v })} />
            <Field label={t("callsheet.pharmacy")} className={c("pharmacy")} multiline value={data.pharmacy} onCommit={(v) => save({ pharmacy: v })} />
            <Field label={t("callsheet.emergency")} className={`wide ${c("emergency")}`} value={data.emergency} onCommit={(v) => save({ emergency: v })} />
            <Field label={t("callsheet.safety")} className={`wide ${c("safety")}`} multiline value={data.safety} placeholder={t("callsheet.safetyPlaceholder")} onCommit={(v) => save({ safety: v })} />
          </div>
        </Section>
      );
    case "scenes":
      return (
        <Section
          title={title}
          aside={
            <button type="button" className="btn small ghost" title={t("callsheet.refillHint")} onClick={onRefill}>
              <RefreshCw aria-hidden="true" />
              {t("callsheet.refill")}
            </button>
          }
        >
          <table className="pr-table">
            <thead>
              <tr>
                <th>{t("callsheet.sceneCol")}</th>
                <th>{t("callsheet.setCol")}</th>
                <th>{t("callsheet.summaryCol")}</th>
                <th>{t("callsheet.castCol")}</th>
                <th className="num">{t("callsheet.pagesCol")}</th>
              </tr>
            </thead>
            <tbody>
              {day.scenes.map((s) => (
                <tr key={s.scene.id}>
                  <td className="num">{s.scene.number}</td>
                  <td className="pr-slug">{s.scene.heading}</td>
                  <td className="muted">{s.scene.text.split("\n").slice(1).find((l) => l.trim())?.slice(0, 120) ?? ""}</td>
                  <td>{s.cast.join(", ")}</td>
                  <td className="num">{formatEighths(s.scene.eighths)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      );
    case "cast": {
      const actor = (character: string) => {
        const id = team.cast.find((r) => r.character === character)?.contactId;
        return id ? team.contacts.find((x) => x.id === id)?.name : undefined;
      };
      const characters = [...new Set([...day.characters, ...Object.keys(data.cast)])].filter((ch) => day.characters.includes(ch));
      return (
        <Section title={title} className={c("cast")}>
          {characters.length === 0 ? (
            <p className="muted small">{t("callsheet.noCast")}</p>
          ) : (
            <table className="pr-table pr-cast-table">
              <thead>
                <tr>
                  <th>{t("team.character")}</th>
                  <th>{t("team.actor")}</th>
                  <th>{t("callsheet.pickup")}</th>
                  <th>{t("callsheet.hmc")}</th>
                  <th>{t("callsheet.onSet")}</th>
                  <th>{t("team.notes")}</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((ch) => {
                  const call = data.cast[ch] ?? EMPTY_CALL;
                  const set = (p: Partial<typeof call>) => save({ cast: { ...data.cast, [ch]: { ...call, ...p } } });
                  const cell = (key: "pickup" | "hmc" | "onSet", label: string) => (
                    <td className={c(`cast.${ch}.${key}`)}>
                      <Field label={`${label} – ${ch}`} hideLabel value={call[key]} placeholder="–" normalize={normalizeTime} onCommit={(v) => set({ [key]: v })} />
                    </td>
                  );
                  return (
                    <tr key={ch}>
                      <td className="pr-slug">{ch}</td>
                      <td>{actor(ch) ?? <span className="muted">{t("team.toCast")}</span>}</td>
                      {cell("pickup", t("callsheet.pickup"))}
                      {cell("hmc", t("callsheet.hmc"))}
                      {cell("onSet", t("callsheet.onSet"))}
                      <td className={c(`cast.${ch}.notes`)}>
                        <Field label={`${t("team.notes")} – ${ch}`} hideLabel value={call.notes} onCommit={(v) => set({ notes: v })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
      );
    }
    case "extras":
      return (
        <Section title={title} className={c("extras")}>
          <Field label={title} hideLabel multiline value={data.extras} placeholder={t("callsheet.extrasPlaceholder")} onCommit={(v) => save({ extras: v })} />
        </Section>
      );
    case "departments": {
      const depts = [...new Set(team.crew.map((m) => m.department))];
      return (
        <Section title={title} className={c("departments")}>
          {depts.length === 0 ? (
            <p className="muted small">{t("callsheet.noCrew")}</p>
          ) : (
            <div className="pr-grid four">
              {depts.map((d) => (
                <Field
                  key={d}
                  label={departmentName(d)}
                  className={c(`departments.${d}`)}
                  value={data.departments[d] ?? ""}
                  placeholder={data.generalCall || "–"}
                  normalize={normalizeTime}
                  onCommit={(v) => save({ departments: { ...data.departments, [d]: v } })}
                />
              ))}
            </div>
          )}
        </Section>
      );
    }
    case "needs":
      return (
        <Section title={title} className={c("needs")}>
          <Field label={title} hideLabel multiline value={data.needs} placeholder={t("callsheet.needsPlaceholder")} onCommit={(v) => save({ needs: v })} />
        </Section>
      );
    case "notes":
      return (
        <Section title={title} className={c("notes")}>
          <Field label={title} hideLabel multiline value={data.notes} onCommit={(v) => save({ notes: v })} />
        </Section>
      );
    case "nextDay":
      return (
        <Section title={title} className={c("nextDay")}>
          <Field label={title} hideLabel multiline value={data.nextDay} onCommit={(v) => save({ nextDay: v })} />
        </Section>
      );
    case "contacts":
      return (
        <Section title={title} className={c("contacts")}>
          <Field label={title} hideLabel multiline value={data.contacts} placeholder={t("callsheet.contactsPlaceholder")} onCommit={(v) => save({ contacts: v })} />
        </Section>
      );
  }
}

/** Who gets the sheet, their own time, and the ticks set by hand as the sheet goes and comes back confirmed [FDS-03, FDS-06]. */
function Recipients({ sheet, people }: { sheet: Sheet; people: Person[] }) {
  const { notify } = useProject();
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const sent = people.filter((p) => p.sent).length;
  const confirmed = people.filter((p) => p.confirmed).length;
  if (people.length === 0) {
    return (
      <EmptyState title={t("callsheet.noRecipientTitle")}>
        <p className="muted">{t("callsheet.noRecipientText")}</p>
      </EmptyState>
    );
  }
  return (
    <>
      <div className="pr-toolbar">
        <p className="muted">{t("callsheet.recipientsHelp", { sent, confirmed, total: people.length })}</p>
        <span className="spacer" />
        <button
          type="button"
          className="btn small"
          disabled={sent === people.length}
          onClick={() => void Promise.all(people.filter((p) => !p.sent).map((p) => setRecipient(sheet.id, p.contactId, { sent: true }))).catch(fail)}
        >
          {t("callsheet.allSent")}
        </button>
      </div>
      <table className="pr-table">
        <thead>
          <tr>
            <th>{t("team.person")}</th>
            <th>{t("callsheet.forWhat")}</th>
            <th>{t("callsheet.callTime")}</th>
            <th className="center">{t("callsheet.sentCol")}</th>
            <th className="center">{t("callsheet.confirmedCol")}</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.contactId}>
              <th scope="row">{p.name}</th>
              <td className="muted">{p.what}</td>
              <td>
                <Field
                  label={t("callsheet.callOf", { name: p.name })}
                  hideLabel
                  value={p.own ? p.time : ""}
                  placeholder={p.time || "–"}
                  normalize={normalizeTime}
                  onCommit={(v) => void setRecipient(sheet.id, p.contactId, { callTime: v }).catch(fail)}
                />
              </td>
              <td className="center">
                <input type="checkbox" checked={p.sent} aria-label={t("callsheet.sentTo", { name: p.name })} onChange={(e) => void setRecipient(sheet.id, p.contactId, { sent: e.target.checked }).catch(fail)} />
              </td>
              <td className="center">
                <input
                  type="checkbox"
                  checked={p.confirmed}
                  aria-label={t("callsheet.confirmedBy", { name: p.name })}
                  onChange={(e) => void setRecipient(sheet.id, p.contactId, { confirmed: e.target.checked, ...(e.target.checked && { sent: true }) }).catch(fail)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The report at the end of the day: scenes and shots done, times, incidents, continuity [FDS-08]. */
function Report({ sheet, day }: { sheet: Sheet; day: DayInfo }) {
  const { notify } = useProject();
  const [r, setR] = useState<DayReport>(sheet.report);
  useEffect(() => setR(sheet.report), [sheet.report]);
  const save = (patch: Partial<DayReport>) => {
    const next = dayReport({ ...r, ...patch });
    setR(next);
    void saveReport(sheet.id, next).catch((e) => notify({ text: describeError(e), tone: "error" }));
  };
  return (
    <>
      <Section title={t("callsheet.scenesShot")}>
        <ul className="pr-shot-scenes">
          {day.scenes.map((s) => (
            <li key={s.scene.id}>
              <span className="num">{s.scene.number}</span>
              <span className="pr-slug">{s.scene.heading}</span>
              <span className="spacer" />
              <Segmented
                label={t("callsheet.sceneState", { n: s.scene.number })}
                value={r.scenes[s.scene.id] ?? "no"}
                onChange={(v) => {
                  const scenes = { ...r.scenes };
                  if (v === "no") delete scenes[s.scene.id];
                  else scenes[s.scene.id] = v;
                  save({ scenes });
                }}
                options={[
                  { id: "no", label: t("callsheet.notShot") },
                  { id: "part", label: t("callsheet.partShot") },
                  { id: "done", label: t("callsheet.doneShot") },
                ]}
              />
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t("callsheet.realTimes")}>
        <div className="pr-grid four">
          {(["call", "firstShot", "lunch", "wrap"] as const).map((k) => (
            <Field key={k} label={t(`callsheet.real.${k}`)} value={r[k]} placeholder="–" normalize={normalizeTime} onCommit={(v) => save({ [k]: v })} />
          ))}
        </div>
      </Section>
      <Section title={t("callsheet.done")}>
        <div className="pr-grid">
          <Field label={t("callsheet.shotsDone")} multiline value={r.shots} placeholder={t("callsheet.shotsPlaceholder")} onCommit={(v) => save({ shots: v })} />
          <Field label={t("callsheet.screenTime")} value={r.screenTime} placeholder="3 min 20" onCommit={(v) => save({ screenTime: v })} />
          <Field label={t("callsheet.incidents")} className="wide" multiline value={r.incidents} onCommit={(v) => save({ incidents: v })} />
          <Field label={t("callsheet.continuity")} className="wide" multiline value={r.continuity} onCommit={(v) => save({ continuity: v })} />
          <Field label={t("team.notes")} className="wide" multiline value={r.notes} onCommit={(v) => save({ notes: v })} />
        </div>
      </Section>
    </>
  );
}

/** The sections of every sheet, their order, which are printed, and the logo at the top [FDS-04]. */
function TemplateDialog({ template, onClose }: { template: Template; onClose: () => void }) {
  const { notify } = useProject();
  const [draft, setDraft] = useState(template);
  const move = (i: number, by: -1 | 1) => {
    const list = [...draft.sections];
    const [x] = list.splice(i, 1);
    list.splice(i + by, 0, x);
    setDraft({ ...draft, sections: list });
  };
  const save = async () => {
    try {
      await writeTemplate(draft);
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={t("callsheet.template")}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: t("common.save"), primary: true, onClick: () => void save() },
      ]}
    >
      <p className="muted">{t("callsheet.templateHelp")}</p>
      <div className="pr-logo-row">
        {draft.logo ? <MediaImage path={draft.logo} alt={t("callsheet.logo")} className="pr-logo" /> : <span className="pr-logo empty" />}
        <button type="button" className="btn small" onClick={() => void pickImage().then(([p]) => p && setDraft({ ...draft, logo: p }))}>
          <ImagePlus aria-hidden="true" />
          {draft.logo ? t("callsheet.changeLogo") : t("callsheet.addLogo")}
        </button>
        {draft.logo && (
          <button type="button" className="btn small ghost" onClick={() => setDraft({ ...draft, logo: null })}>
            <Trash2 aria-hidden="true" />
            {t("common.removeAction")}
          </button>
        )}
      </div>
      <ol className="pr-template">
        {draft.sections.map((s, i) => (
          <li key={s.id}>
            <label className="choice">
              <input
                type="checkbox"
                checked={s.shown}
                onChange={(e) => setDraft({ ...draft, sections: draft.sections.map((x) => (x.id === s.id ? { ...x, shown: e.target.checked } : x)) })}
              />
              {t(`callsheet.sections.${s.id}`)}
            </label>
            <span className="spacer" />
            <button type="button" className="btn tiny ghost" disabled={i === 0} aria-label={t("callsheet.up", { name: t(`callsheet.sections.${s.id}`) })} onClick={() => move(i, -1)}>
              <ArrowUp aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn tiny ghost"
              disabled={i === SECTIONS.length - 1}
              aria-label={t("callsheet.down", { name: t(`callsheet.sections.${s.id}`) })}
              onClick={() => move(i, 1)}
            >
              <ArrowDown aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
