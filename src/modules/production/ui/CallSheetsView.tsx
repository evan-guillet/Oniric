import { ArrowDown, ArrowUp, ImagePlus, LayoutTemplate, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { describeError } from "../../../core/errors";
import { dateFormat, plural, t } from "../../../core/i18n";
import { Dialog } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useProject } from "../../project/ui/projectContext";
import { useLive } from "../../../core/db/live";
import { loadEntries, type Entry } from "../../script/bible/application/bible";
import { fold } from "../../script/bible/domain/types";
import { formatEighths } from "../../script/screenplay/domain/duration";
import { MediaImage, pickImage } from "../../shared/media";
import { useBreakdown, useCategories, elementsByScene, type Breakdown } from "../application/breakdown";
import { createSheet, markSent, saveSheet, sendVersion, setRecipient, useSheets, useTemplate, writeTemplate, type Recipient, type Sheet } from "../application/callSheets";
import { usePlans } from "../application/schedule";
import { useScouting, type Scouting } from "../application/scouting";
import { decorsOfPlace } from "../domain/permits";
import { decorRefs } from "./preparation";
import { useTeam, type Team } from "../application/team";
import { categoryName, type Category } from "../domain/breakdown";
import { departmentName } from "../domain/catalog";
import {
  changeCount,
  changes,
  EMPTY_CALL,
  earliest,
  emptySheet,
  normalizeTime,
  SECTIONS,
  type CallLocation,
  type CallSheetData,
  type SectionId,
  type Template,
} from "../domain/callSheet";
import { parseDay } from "../domain/schedule";
import { stripTone } from "../domain/sceneFacts";
import { sunTimes } from "../domain/sun";
import { exportCallSheets } from "./productionExport";
import { Field, Section, shortDate } from "./parts";
import { dayTitle, useBoard, type Board } from "./ScheduleView";

type DayInfo = Board["days"][number];

/** The call sheets: one per shooting day, made from the schedule, sent as PDF, and its versions [FDS-01 to FDS-07]. */
export function CallSheetsView() {
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
    <div className="view split pr-split">
      <main className={sheet ? "view-main pr-sheet-main on-paper" : "view-main pr-sheet-main"}>
        {sheet ? (
          <SheetPage key={sheet.id} board={b} team={team} day={day} sheet={sheet} recipients={sheets.recipients.filter((r) => r.sheetId === sheet.id)} />
        ) : (
          <NewSheet board={b} team={team} day={day} />
        )}
      </main>
      <nav className="view-side pr-side" aria-label={t("callsheet.days")}>
        <ul className="pr-side-list pr-side-days">
          {days.map((d) => {
            const st = status(d);
            return (
              <li key={d.day.id}>
                <button type="button" className={d.day.id === day.day.id ? "on" : ""} aria-current={d.day.id === day.day.id} onClick={() => setPicked(d.day.id)}>
                  <span className="pr-row-title">{t("schedule.dayShort", { n: d.number })}</span>
                  <span className="pr-side-sub">{d.date ? shortDate(d.date) : t("schedule.noDate")}</span>
                  <span className={`pr-side-state ${st.tone}`}>{st.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** The sheet of a day not prepared yet, and the button that fills it from the schedule [FDS-01]. */
function NewSheet({ board: b, team, day }: { board: Board; team: Team; day: DayInfo }) {
  const { notify } = useProject();
  const breakdown = useBreakdown();
  const cats = useCategories();
  const entries = useLive(loadEntries, ["bible_entry"]);
  const scouting = useScouting();
  const make = async () => {
    try {
      await createSheet(day.day.id, prefill(emptySheet(), b, team, day, breakdown, cats ?? [], entries ?? [], scouting));
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
  scouting?: Scouting,
): CallSheetData {
  const places = [...new Set(day.scenes.map((s) => s.facts.place).filter(Boolean))];
  const known = new Map(base.locations.map((l) => [fold(l.name), l]));
  const locations: CallLocation[] = places.map((p) => {
    const kept = known.get(fold(p));
    if (kept) return kept;
    const entry = entries.find((e) => e.type === "location" && [e.name, ...e.aliases].some((n) => fold(n) === fold(p)));
    // The set chosen in the scouting knows more than the bible's note: where it is and how to get there [REP-02].
    const decor = decorsOfPlace(p, decorRefs(scouting?.locations ?? [], entries))
      .map((d) => scouting!.locations.find((l) => l.id === d.id)!)
      .sort((a, b) => Number(b.status === "booked" || b.status === "kept") - Number(a.status === "booked" || a.status === "kept"))[0];
    if (decor) return { name: p, address: [decor.name, decor.address].filter(Boolean).join("\n"), coordinates: decor.lat !== null ? `${decor.lat}, ${decor.lon}` : "", parking: decor.data.parking, notes: decor.data.access };
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

function SheetPage({ board: b, team, day, sheet, recipients }: { board: Board; team: Team; day: DayInfo; sheet: Sheet; recipients: Recipient[] }) {
  const api = useProject();
  const { notify } = api;
  const template = useTemplate();
  const breakdown = useBreakdown();
  const cats = useCategories();
  const scouting = useScouting();
  const entries = useLive(loadEntries, ["bible_entry"]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  // PDFs being written: nothing says so otherwise for the seconds a whole list takes.
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const data = sheet.data;
  const last = sheet.versions[sheet.versions.length - 1];
  const changed = useMemo(() => (last ? changes(last.data, data) : new Set<string>()), [last, data]);
  const save = (patch: Partial<CallSheetData>) => void saveSheet(sheet.id, { ...data, ...patch }).catch(fail);
  const people = useRecipients(team, day, data, recipients);
  // Nothing to send but the version already out: the button then opens who got it.
  const pending = !last || changed.size > 0;
  const version = pending ? (last?.n ?? 0) + 1 : last.n;

  const working = async (total: number, work: () => Promise<void>) => {
    setRun({ done: 0, total });
    try {
      await work();
    } catch (e) {
      fail(e);
    } finally {
      setRun(null);
    }
  };
  const onProgress = (done: number, total: number) => setRun({ done, total });
  /** The PDFs come first: if they can't be written, nothing is marked as sent. */
  const send = (to: Person[]) => {
    setSendOpen(false);
    const ids = to.map((p) => p.contactId);
    void working(to.length, async () => {
      if (to.length) await exportCallSheets(api, { board: b, team, day, sheet, template: template!, people: to, individual: true, onProgress, notice: plural("callsheet.sentFiles", to.length, { v: version }) });
      await (pending ? sendVersion(sheet, ids) : markSent(sheet.id, ids));
      if (!to.length) notify({ text: t("callsheet.sentDone", { n: version }) });
    });
  };
  const refill = () => {
    if (!breakdown || !cats || !entries) return;
    void saveSheet(sheet.id, prefill(data, b, team, day, breakdown, cats, entries, scouting)).catch(fail);
  };
  const sentOn = (v: { n: number; at: string }) => t("callsheet.sentOn", { n: v.n, date: shortDate(v.at.slice(0, 10)) });
  const longDate = day.date ? dateFormat({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDay(day.date)) : t("schedule.noDate");

  return (
    <div className="pr-sheet">
      <header className="pr-sheet-bar">
        <div>
          <h2 className="visually-hidden">{t("schedule.dayN", { n: day.number, total: b.shootDays })}</h2>
          {run && run.total > 1 ? (
            <p className="pr-sheet-state" role="status">
              {t("callsheet.writing", { done: run.done, total: run.total })}
            </p>
          ) : (
            <p className={last && changed.size ? "pr-sheet-state warn" : "pr-sheet-state"}>
              {last ? (changed.size ? t("callsheet.changedNote", { n: last.n }) : sentOn(last)) : t("callsheet.draft")}
            </p>
          )}
        </div>
        <span className="spacer" />
        <button type="button" className="btn" disabled={!template || !!run} onClick={() => setTemplateOpen(true)}>
          <LayoutTemplate aria-hidden="true" />
          {t("callsheet.template")}
        </button>
        <button type="button" className={pending ? "btn primary" : "btn"} disabled={!template || !!run} onClick={() => setSendOpen(true)}>
          <Send aria-hidden="true" />
          {pending ? t("callsheet.sendN", { n: version }) : t("callsheet.sendFollow", { n: version })}
        </button>
      </header>
      {template && (
        <article className="pr-callsheet" aria-label={t("callsheet.paperTitle")}>
          <Masthead title={api.project.title} logo={template.logo} day={day} total={b.shootDays} date={longDate} data={data} changed={changed} save={save} />
          {halves(template.sections.filter((s) => s.shown && s.id !== "times").map((s) => s.id)).map(({ id, half }) => (
            <SheetSection key={id} id={id} half={half} data={data} day={day} numbers={b.numbers} team={team} changed={changed} save={save} onRefill={refill} />
          ))}
        </article>
      )}
      {sendOpen && <SendDialog sheet={sheet} people={people} version={version} pending={pending} changes={changeCount(changed)} onSend={(to) => void send(to)} onClose={() => setSendOpen(false)} />}
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
  return useMemo(() => recipientsOf(team, day, data, recipients), [team, day, data, recipients]);
}

export function recipientsOf(team: Team, day: DayInfo, data: CallSheetData, recipients: Recipient[]): Person[] {
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
}

/** The top of the sheet as it is printed: the film and the day, the general call in large, the times and the weather of the day. */
function Masthead({
  title,
  logo,
  day,
  total,
  date,
  data,
  changed,
  save,
}: {
  title: string;
  logo: string | null;
  day: DayInfo;
  total: number;
  date: string;
  data: CallSheetData;
  changed: Set<string>;
  save: (p: Partial<CallSheetData>) => void;
}) {
  const c = (path: string) => (changed.has(path) ? "changed" : "");
  const sun = day.date && data.locations[0]?.coordinates ? sunTimes(day.date, data.locations[0].coordinates) : null;
  const time = (key: "readyToShoot" | "lunch" | "wrap" | "sunrise" | "sunset", label: string, placeholder = t("callsheet.timePlaceholder"), hint?: string) => (
    <Field key={key} label={label} className={c(key)} value={data[key]} placeholder={placeholder} normalize={normalizeTime} title={hint} onCommit={(v) => save({ [key]: v })} />
  );
  return (
    <header className="pr-cs-mast">
      <div className="pr-cs-id">
        {logo && <MediaImage path={logo} alt="" className="pr-cs-logo" />}
        <div>
          <h3>{title}</h3>
          <p>{t("callsheet.paperTitle")}</p>
        </div>
      </div>
      <p className="pr-cs-day">
        <strong>{t("schedule.dayN", { n: day.number, total })}</strong>
        <span>{date}</span>
      </p>
      <Field
        label={t("callsheet.generalCall")}
        className={`pr-cs-call ${c("generalCall")}`}
        value={data.generalCall}
        placeholder={t("callsheet.timePlaceholder")}
        normalize={normalizeTime}
        onCommit={(v) => save({ generalCall: v })}
      />
      <div className="pr-cs-times">
        {time("readyToShoot", t("callsheet.readyToShoot"))}
        {time("lunch", t("callsheet.lunch"))}
        {time("wrap", t("callsheet.wrap"))}
        {time("sunrise", t("callsheet.sunrise"), sun?.rise ?? "–", sun ? t("callsheet.sunComputed") : undefined)}
        {time("sunset", t("callsheet.sunset"), sun?.set ?? "–", sun ? t("callsheet.sunComputed") : undefined)}
        <Field label={t("callsheet.weather")} className={c("weather")} multiline value={data.weather} placeholder={t("callsheet.weatherPlaceholder")} onCommit={(v) => save({ weather: v })} />
      </div>
      {!sun && <p className="pr-cs-sun">{t("callsheet.sunHelp")}</p>}
    </header>
  );
}

/** The short texts that follow one another go two by two; one left alone takes the whole width. */
const HALF: SectionId[] = ["extras", "needs", "notes", "nextDay", "contacts"];

function halves(ids: SectionId[]): { id: SectionId; half: boolean }[] {
  let run = 0;
  return ids.map((id, i) => {
    run = HALF.includes(id) ? run + 1 : 0;
    const paired = run % 2 === 0 || HALF.includes(ids[i + 1]);
    return { id, half: run > 0 && paired };
  });
}

function SheetSection({
  id,
  half,
  data,
  day,
  numbers,
  team,
  changed,
  save,
  onRefill,
}: {
  id: SectionId;
  half: boolean;
  data: CallSheetData;
  day: DayInfo;
  numbers: Map<string, number>;
  team: Team;
  changed: Set<string>;
  save: (p: Partial<CallSheetData>) => void;
  onRefill: () => void;
}) {
  const c = (path: string) => (changed.has(path) ? "changed" : "");
  const title = t(`callsheet.sections.${id}`);
  const text = (key: "extras" | "needs" | "notes" | "nextDay" | "contacts", placeholder?: string) => (
    <Section title={title} className={`${c(key)} ${half ? "half" : ""}`}>
      <Field label={title} hideLabel multiline value={data[key]} placeholder={placeholder ?? "–"} onCommit={(v) => save({ [key]: v })} />
    </Section>
  );
  switch (id) {
    case "times":
      // Always at the top of the page, in the masthead.
      return null;
    case "locations":
      return (
        <Section
          title={title}
          className={c("locations") || c("base")}
          aside={
            <button type="button" className="btn small ghost" onClick={() => save({ locations: [...data.locations, { name: "", address: "", coordinates: "", parking: "", notes: "" }] })}>
              <Plus aria-hidden="true" />
              {t("callsheet.addLocation")}
            </button>
          }
        >
          {data.locations.map((l, i) => {
            const set = (p: Partial<CallLocation>) => save({ locations: data.locations.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <div key={i} className="pr-cs-set">
                <div className="pr-cs-where">
                  <Field label={t("callsheet.setName")} hideLabel className={`pr-cs-setname ${c(`locations.${i}.name`)}`} value={l.name} placeholder={t("callsheet.setName")} onCommit={(v) => set({ name: v })} />
                  <Field label={t("callsheet.address")} hideLabel multiline className={c(`locations.${i}.address`)} value={l.address} placeholder={t("callsheet.address")} onCommit={(v) => set({ address: v })} />
                </div>
                <div className="pr-cs-lines">
                  <Field label={t("callsheet.coordinates")} className={`pr-cs-line ${c(`locations.${i}.coordinates`)}`} value={l.coordinates} placeholder={t("callsheet.coordinatesPlaceholder")} onCommit={(v) => set({ coordinates: v })} />
                  <Field label={t("callsheet.parking")} multiline className={`pr-cs-line ${c(`locations.${i}.parking`)}`} value={l.parking} placeholder="–" onCommit={(v) => set({ parking: v })} />
                  <Field label={t("callsheet.access")} multiline className={`pr-cs-line ${c(`locations.${i}.notes`)}`} value={l.notes} placeholder="–" onCommit={(v) => set({ notes: v })} />
                </div>
                <button
                  type="button"
                  className="btn tiny ghost pr-cs-set-x"
                  aria-label={t("callsheet.removeLocation", { name: l.name })}
                  title={t("callsheet.removeLocation", { name: l.name })}
                  onClick={() => save({ locations: data.locations.filter((_x, j) => j !== i) })}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <Field label={t("callsheet.base")} className={`pr-cs-line pr-cs-base ${c("base")}`} multiline value={data.base} placeholder={t("callsheet.basePlaceholder")} onCommit={(v) => save({ base: v })} />
        </Section>
      );
    case "safety":
      return (
        <Section title={title} className={c("hospital") || c("pharmacy") || c("emergency") || c("safety")}>
          <div className="pr-cs-cells">
            <Field label={t("callsheet.emergency")} className={c("emergency")} multiline value={data.emergency} placeholder="–" onCommit={(v) => save({ emergency: v })} />
            <Field label={t("callsheet.hospital")} className={c("hospital")} multiline value={data.hospital} placeholder="–" onCommit={(v) => save({ hospital: v })} />
            <Field label={t("callsheet.pharmacy")} className={c("pharmacy")} multiline value={data.pharmacy} placeholder="–" onCommit={(v) => save({ pharmacy: v })} />
          </div>
          <Field label={t("callsheet.safety")} className={`pr-cs-line pr-cs-base ${c("safety")}`} multiline value={data.safety} placeholder={t("callsheet.safetyPlaceholder")} onCommit={(v) => save({ safety: v })} />
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
          <table className="pr-table pr-cs-scenes">
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
              {day.scenes.map((s) => {
                const summary = s.scene.text.split("\n").slice(1).find((l) => l.trim()) ?? "";
                return (
                  <tr key={s.scene.id}>
                    <td>
                      <span className={`pr-cs-sc tone-${stripTone(s.facts)}`}>{s.scene.number}</span>
                    </td>
                    <td className="pr-slug">{s.scene.heading}</td>
                    <td className="muted">
                      <span className="pr-cs-summary" title={summary}>
                        {summary}
                      </span>
                    </td>
                    <td className="pr-cs-who">{s.cast.join(", ")}</td>
                    <td className="num">{formatEighths(s.scene.eighths)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>{plural("callsheet.sceneTotal", day.scenes.length)}</td>
                <td className="num">{formatEighths(day.eighths)}</td>
              </tr>
            </tfoot>
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
                  <th className="num">{t("team.number")}</th>
                  <th>{t("team.character")}</th>
                  <th>{t("team.actor")}</th>
                  <th className="pr-cs-time">{t("callsheet.pickup")}</th>
                  <th className="pr-cs-time">{t("callsheet.hmc")}</th>
                  <th className="pr-cs-time">{t("callsheet.onSet")}</th>
                  <th>{t("team.notes")}</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((ch) => {
                  const call = data.cast[ch] ?? EMPTY_CALL;
                  const set = (p: Partial<typeof call>) => save({ cast: { ...data.cast, [ch]: { ...call, ...p } } });
                  const cell = (key: "pickup" | "hmc" | "onSet", label: string) => (
                    <td className={`pr-cs-time ${c(`cast.${ch}.${key}`)}`}>
                      <Field label={`${label} – ${ch}`} hideLabel value={call[key]} placeholder="–" normalize={normalizeTime} onCommit={(v) => set({ [key]: v })} />
                    </td>
                  );
                  return (
                    <tr key={ch}>
                      <td className="num">{numbers.get(ch) ?? ""}</td>
                      <td className="pr-slug">{ch}</td>
                      <td>{actor(ch) ?? <span className="muted">{t("team.toCast")}</span>}</td>
                      {cell("pickup", t("callsheet.pickup"))}
                      {cell("hmc", t("callsheet.hmc"))}
                      {cell("onSet", t("callsheet.onSet"))}
                      <td className={c(`cast.${ch}.notes`)}>
                        <Field label={`${t("team.notes")} – ${ch}`} hideLabel multiline value={call.notes} placeholder="–" onCommit={(v) => set({ notes: v })} />
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
      return text("extras", t("callsheet.extrasPlaceholder"));
    case "departments": {
      const depts = [...new Set(team.crew.map((m) => m.department))];
      return (
        <Section title={title} className={c("departments")}>
          {depts.length === 0 ? (
            <p className="muted small">{t("callsheet.noCrew")}</p>
          ) : (
            <div className="pr-cs-depts">
              {depts.map((d) => (
                <Field
                  key={d}
                  label={departmentName(d)}
                  className={`pr-cs-line ${c(`departments.${d}`)}`}
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
      return text("needs", t("callsheet.needsPlaceholder"));
    case "notes":
      return text("notes");
    case "nextDay":
      return text("nextDay");
    case "contacts":
      return text("contacts", t("callsheet.contactsPlaceholder"));
  }
}

/**
 * Before the sheet goes out: who gets it, their own time, and who has confirmed. Once the version is out, the same
 * window tells who got it, and sends it to whoever has not yet [FDS-03, FDS-06].
 */
function SendDialog({
  sheet,
  people,
  version,
  pending,
  changes: count,
  onSend,
  onClose,
}: {
  sheet: Sheet;
  people: Person[];
  version: number;
  pending: boolean;
  changes: number;
  onSend: (to: Person[]) => void;
  onClose: () => void;
}) {
  const { notify } = useProject();
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const [chosen, setChosen] = useState(() => new Set(people.filter((p) => pending || !p.sent).map((p) => p.contactId)));
  // The list is sorted by call time: a time changed here must not make its row jump away.
  const [order] = useState(() => people.map((p) => p.contactId));
  const rank = (p: Person) => {
    const i = order.indexOf(p.contactId);
    return i < 0 ? order.length : i;
  };
  const rows = [...people].sort((a, b) => rank(a) - rank(b));
  const to = rows.filter((p) => chosen.has(p.contactId));
  const all = to.length === people.length;
  // Nothing was sent yet the first time: the two columns of what came back would stay empty.
  const followed = sheet.versions.length > 0;
  const lastN = sheet.versions[sheet.versions.length - 1]?.n;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
  };
  const help = !pending
    ? t("callsheet.sendFollowText", { sent: people.filter((p) => p.sent).length, confirmed: people.filter((p) => p.confirmed).length, total: people.length })
    : followed
      ? plural("callsheet.sendAgainText", count, { v: lastN })
      : t("callsheet.sendText");
  const label = to.length === 0 ? t(pending ? "callsheet.sendN" : "callsheet.sendAgain", { n: version }) : plural(pending ? "callsheet.sendTo" : "callsheet.sendAgainTo", to.length, { v: version });
  return (
    <Dialog
      title={t(pending ? "callsheet.sendTitle" : "callsheet.sendFollowTitle", { n: version })}
      className="pr-send"
      onCancel={onClose}
      actions={[
        { label: pending ? t("common.cancel") : t("common.close"), onClick: onClose },
        { label, primary: true, disabled: to.length === 0 && (!pending || people.length > 0), onClick: () => onSend(to) },
      ]}
    >
      {people.length === 0 ? (
        <>
          <p>
            <strong>{t("callsheet.noRecipientTitle")}</strong>
          </p>
          <p className="muted">{t("callsheet.noRecipientText")}</p>
        </>
      ) : (
        <>
          <p className="muted">{help}</p>
          <div className="pr-send-list">
            <table className="pr-table pr-quiet">
              <thead>
                <tr>
                  <th>
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={all}
                        ref={(el) => {
                          if (el) el.indeterminate = to.length > 0 && !all;
                        }}
                        onChange={(e) => setChosen(new Set(e.target.checked ? people.map((p) => p.contactId) : []))}
                      />
                      {t("team.person")}
                    </label>
                  </th>
                  <th>{t("callsheet.forWhat")}</th>
                  <th>{t("callsheet.callTime")}</th>
                  {followed && <th className="center">{t("callsheet.sentCol")}</th>}
                  {followed && <th className="center">{t("callsheet.confirmedCol")}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.contactId} className={chosen.has(p.contactId) ? "" : "off"}>
                    <th scope="row">
                      <label className="choice">
                        <input type="checkbox" checked={chosen.has(p.contactId)} onChange={(e) => toggle(p.contactId, e.target.checked)} />
                        {p.name}
                      </label>
                    </th>
                    <td className="muted">{p.what}</td>
                    <td className="pr-send-time">
                      <Field
                        label={t("callsheet.callOf", { name: p.name })}
                        hideLabel
                        value={p.own ? p.time : ""}
                        placeholder={p.time || "–"}
                        normalize={normalizeTime}
                        onCommit={(v) => void setRecipient(sheet.id, p.contactId, { callTime: v }).catch(fail)}
                      />
                    </td>
                    {followed && <td className="center muted">{p.sent ? t("callsheet.versionShort", { n: lastN }) : "–"}</td>}
                    {followed && (
                      <td className="center">
                        <input
                          type="checkbox"
                          checked={p.confirmed}
                          aria-label={t("callsheet.confirmedBy", { name: p.name })}
                          onChange={(e) => void setRecipient(sheet.id, p.contactId, { confirmed: e.target.checked, ...(e.target.checked && { sent: true }) }).catch(fail)}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Dialog>
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
