import type { ReactNode } from "react";
import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { dateFormat, plural, t } from "../../../core/i18n";
import type { ProjectApi } from "../../project/ui/projectContext";
import { byScene, loadShots } from "../../realisation/application/shots";
import { formatMinutes, toCsv } from "../../realisation/domain/shots";
import { formatEighths } from "../../script/screenplay/domain/duration";
import { readImage } from "../../shared/media";
import { loadBreakdown, readCategories } from "../application/breakdown";
import type { Sheet } from "../application/callSheets";
import { loadPlans, type ProductionEvent } from "../application/schedule";
import { loadTeam, type Team } from "../application/team";
import { CSV_FIELDS, cardRow, toVCard } from "../domain/contacts";
import { departmentName, DEPARTMENTS } from "../domain/catalog";
import { changes, EMPTY_CALL, type Template } from "../domain/callSheet";
import { toBase64, toIcs, toXlsx } from "../domain/files";
import { parseDay, presence } from "../domain/schedule";
import { stripTone } from "../domain/sceneFacts";
import { sunTimes } from "../domain/sun";
import { reportGroups } from "./BreakdownView";
import type { Person } from "./CallSheetsView";
import { board, dayTitle, type Board } from "./ScheduleView";

type Api = Pick<ProjectApi, "session" | "printPdf" | "project" | "notify">;

const A4 = { long: 11.69, short: 8.27 };

const CSS = (width: number, height: number) => `
@page { size: ${width}in ${height}in; margin: 0; }
.pr-print { font-family: "Inter Variable", "Segoe UI", sans-serif; color: #111; font-size: 8.5pt; line-height: 1.35; }
.pr-print .run { padding: 0.45in 0.5in; }
.pr-print .page { width: ${width}in; min-height: ${height}in; padding: 0.4in 0.45in; box-sizing: border-box; break-after: page; }
.pr-print .page:last-child { break-after: auto; }
.pr-print h1 { font-size: 14pt; margin: 0 0 2pt; letter-spacing: -0.01em; }
.pr-print .sub { color: #555; margin: 0 0 12pt; }
.pr-print h2 { font-size: 9pt; font-weight: 700; margin: 12pt 0 4pt; break-after: avoid; border-bottom: 1pt solid #111; padding-bottom: 2pt; }
.pr-print h2 .dot { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 4pt; vertical-align: 0; }
.pr-print table { width: 100%; border-collapse: collapse; break-inside: auto; }
.pr-print th { text-align: left; font-weight: 600; color: #444; border-bottom: 0.75pt solid #999; padding: 2.5pt 4pt; font-size: 7.5pt; }
.pr-print td { border-bottom: 0.5pt solid #ddd; padding: 2.5pt 4pt; vertical-align: top; white-space: pre-wrap; }
.pr-print tr { break-inside: avoid; }
.pr-print .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pr-print .slug { font-weight: 600; text-transform: uppercase; font-size: 7.5pt; }
.pr-print .muted { color: #666; }
.pr-print .day { margin: 10pt 0 2pt; display: flex; gap: 8pt; align-items: baseline; font-weight: 700; break-after: avoid; }
.pr-print .day span { font-weight: 400; color: #555; }
.pr-print .off { margin: 6pt 0; padding: 3pt 6pt; background: #eee; font-weight: 600; }
.pr-print .strip td { border-bottom: 0.5pt solid #bbb; }
.pr-print .tone-int-day { background: #ffffff; }
.pr-print .tone-ext-day { background: #fff5b8; }
.pr-print .tone-int-night { background: #d6e6ff; }
.pr-print .tone-ext-night { background: #d6f2d6; }
.pr-print .tone-dawn { background: #ffe1c2; }
.pr-print .tone-dusk { background: #ffd6e5; }
.pr-print .banner td { background: #222; color: #fff; font-weight: 600; }
.pr-print .end td { border-bottom: 1.5pt solid #111; font-weight: 600; }
.pr-print .dood td, .pr-print .dood th { text-align: center; border: 0.5pt solid #ccc; padding: 2pt; }
.pr-print .dood th.name, .pr-print .dood td.name { text-align: left; }
.pr-print .cs-head { display: grid; grid-template-columns: auto 1fr auto; gap: 12pt; align-items: center; border-bottom: 1.5pt solid #111; padding-bottom: 6pt; }
.pr-print .cs-head img { max-height: 0.7in; max-width: 1.6in; object-fit: contain; }
.pr-print .cs-day { text-align: right; font-size: 18pt; font-weight: 700; line-height: 1; }
.pr-print .cs-day small { display: block; font-size: 8pt; font-weight: 500; color: #555; margin-top: 3pt; }
.pr-print .cs-you { margin: 8pt 0 0; padding: 6pt 8pt; border: 1.5pt solid #111; font-size: 11pt; font-weight: 700; display: flex; justify-content: space-between; }
.pr-print .cs-times { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt; margin-top: 8pt; }
.pr-print .cs-times div { border: 0.75pt solid #999; padding: 4pt 6pt; }
.pr-print .cs-times b { display: block; font-size: 13pt; }
.pr-print .cs-times span { color: #555; font-size: 7pt; }
.pr-print .cs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 14pt; }
.pr-print .cs-text { white-space: pre-wrap; margin: 0; }
.pr-print .chg { background: #fff1a8; }
.pr-print .version { color: #555; font-size: 7.5pt; margin-top: 2pt; }
.pr-print .foot { margin-top: 10pt; color: #777; font-size: 7pt; }
`;

/** Tells a file was written, with buttons to open it and to show it in its folder. */
export const notifyExported = (api: Pick<Api, "notify">, path: string) =>
  api.notify({
    text: t("workspace.exported", { file: path.split(/[\\/]/).slice(-2).join("\\") }),
    actions: [
      { label: t("workspace.openFile"), onClick: () => void commands.reveal(path, true) },
      { label: t("workspace.showInFolder"), onClick: () => void commands.reveal(path, false) },
    ],
  });

const today = () => dateFormat({ day: "numeric", month: "long", year: "numeric" }).format(new Date());
const longDate = (iso: string | null) => (iso ? dateFormat({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDay(iso)) : "");

/** The list of the crew and the cast, by department, to hand out [EQU-08]. */
export async function exportTeamPdf(api: Api): Promise<void> {
  const team = await loadTeam();
  const contact = new Map(team.contacts.map((c) => [c.id, c]));
  const depts = [...DEPARTMENTS, ...new Set(team.crew.map((m) => m.department))].filter((d, i, all) => all.indexOf(d) === i);
  await api.printPdf(
    `${t("team.listFile")} - ${api.project.title}.pdf`,
    <div className="pr-print">
      <div className="run">
        <h1>{t("team.listTitle", { title: api.project.title })}</h1>
        <p className="sub">{today()}</p>
        {depts.map((d) => {
          const members = team.crew.filter((m) => m.department === d).sort((a, b) => Number(b.head) - Number(a.head));
          if (!members.length) return null;
          return (
            <section key={d}>
              <h2>{departmentName(d)}</h2>
              <table>
                <tbody>
                  {members.map((m) => {
                    const c = contact.get(m.contactId);
                    return (
                      <tr key={m.id}>
                        <td style={{ width: "28%" }}>
                          <b>{c?.name}</b>
                        </td>
                        <td style={{ width: "26%" }}>{m.role}</td>
                        <td>{c?.data.phone}</td>
                        <td>{c?.data.email}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
        {team.cast.some((r) => r.contactId) && (
          <section>
            <h2>{t("team.tabs.cast")}</h2>
            <table>
              <tbody>
                {team.cast
                  .filter((r) => r.contactId)
                  .map((r) => {
                    const c = contact.get(r.contactId!);
                    return (
                      <tr key={r.id}>
                        <td style={{ width: "28%" }}>
                          <b>{c?.name}</b>
                        </td>
                        <td className="slug" style={{ width: "26%" }}>
                          {r.character}
                        </td>
                        <td>{c?.data.phone}</td>
                        <td>{c?.data.agent ? t("team.agentIs", { agent: c.data.agent }) : c?.data.email}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>,
    { width: A4.short, height: A4.long, css: CSS(A4.short, A4.long) },
  );
}

/** Every contact of the project, sensitive numbers left out [EQU-08]. */
export async function exportContactsCsv(api: Pick<Api, "project">): Promise<string> {
  const team = await loadTeam();
  const head = CSV_FIELDS.map((f) => t(`team.fields.${f}`));
  return unwrap(await commands.exportText(`${t("team.tabs.contacts")} - ${api.project.title}.csv`, toCsv(head, team.contacts.map(cardRow))));
}

export async function exportContactsVcf(api: Pick<Api, "project">): Promise<string> {
  const team = await loadTeam();
  return unwrap(await commands.exportText(`${t("team.tabs.contacts")} - ${api.project.title}.vcf`, toVCard(team.contacts)));
}

type ReportBy = "category" | "set" | "character";

async function breakdownGroups(api: Api, by: ReportBy) {
  await api.session.flush();
  const scenes = api.session.scenes();
  const [b, cats] = await Promise.all([loadBreakdown(), readCategories()]);
  return { scenes, groups: reportGroups(by, scenes, b, cats) };
}

const reportTitle = (by: ReportBy) => (by === "category" ? t("breakdown.byCategory") : by === "set" ? t("breakdown.bySet") : t("breakdown.byCharacter"));

/** The report of the breakdown in PDF [DEP-06]. */
export async function exportBreakdownPdf(api: Api, by: ReportBy): Promise<void> {
  const { scenes, groups } = await breakdownGroups(api, by);
  const number = new Map(scenes.map((s) => [s.id, s.number]));
  await api.printPdf(
    `${t("nav.views.breakdown")} - ${reportTitle(by)} - ${api.project.title}.pdf`,
    <div className="pr-print">
      <div className="run">
        <h1>
          {t("nav.views.breakdown")} · {reportTitle(by)}
        </h1>
        <p className="sub">
          {api.project.title} · {today()}
        </p>
        {groups.map((g) => (
          <section key={g.title}>
            <h2>
              {g.color && <span className="dot" style={{ background: g.color }} />}
              {g.title}
            </h2>
            <table>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={l.name}>
                    <td style={{ width: "34%" }}>
                      <b>{l.name}</b>
                    </td>
                    <td className="num" style={{ width: "10%" }}>
                      {l.scenes.length}
                    </td>
                    <td>{l.scenes.map((id) => number.get(id)).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>,
    { width: A4.short, height: A4.long, css: CSS(A4.short, A4.long) },
  );
}

export async function exportBreakdownCsv(api: Api, by: ReportBy): Promise<string> {
  const { scenes, groups } = await breakdownGroups(api, by);
  const number = new Map(scenes.map((s) => [s.id, s.number]));
  const rows = groups.flatMap((g) => g.lines.map((l) => [g.title, l.name, String(l.scenes.length), l.scenes.map((id) => number.get(id)).join(", ")]));
  return unwrap(
    await commands.exportText(
      `${t("nav.views.breakdown")} - ${reportTitle(by)} - ${api.project.title}.csv`,
      toCsv([t("breakdown.category"), t("breakdown.element"), t("breakdown.sceneCount"), t("breakdown.sceneList")], rows),
    ),
  );
}

/** The board of the schedule shown, worked out away from the view, for the export window. */
export async function boardNow(api: Pick<Api, "session">): Promise<Board> {
  await api.session.flush();
  const [plans, team, shots] = await Promise.all([loadPlans(), loadTeam(), loadShots()]);
  return board(api.session.scenes(), plans, team, plans.schedules.find((s) => s.id === plans.currentId) ?? null, byScene(shots));
}

/** The strips of the schedule day by day, in their colours, ready to print [PDT-07]. */
export async function exportSchedulePdf(api: Api, b?: Board): Promise<void> {
  const bd = b ?? (await boardNow(api));
  if (!bd.schedule) return;
  const team = await loadTeam();
  await api.printPdf(
    `${t("nav.views.schedule")} - ${bd.schedule.name} - ${api.project.title}.pdf`,
    <div className="pr-print">
      <div className="run">
        <h1>
          {t("nav.views.schedule")} · {bd.schedule.name}
        </h1>
        <p className="sub">
          {api.project.title} · {plural("schedule.shootDays", bd.shootDays)} · {today()}
        </p>
        <table>
          <thead>
            <tr>
              <th>{t("callsheet.sceneCol")}</th>
              <th>{t("schedule.ie")}</th>
              <th>{t("schedule.dn")}</th>
              <th>{t("callsheet.setCol")}</th>
              <th>{t("callsheet.castCol")}</th>
              <th className="num">{t("callsheet.pagesCol")}</th>
              <th className="num">{t("schedule.time")}</th>
            </tr>
          </thead>
          {bd.days.map((d) =>
            d.day.kind !== "shoot" ? (
              <tbody key={d.day.id}>
                <tr className="banner">
                  <td colSpan={7}>{dayTitle(d)}</td>
                </tr>
              </tbody>
            ) : (
              <tbody key={d.day.id}>
                {d.strips.map((s) => {
                  const info = s.sceneId ? bd.info.get(s.sceneId) : undefined;
                  if (!info)
                    return (
                      <tr key={s.id} className="banner">
                        <td colSpan={7}>{s.banner}</td>
                      </tr>
                    );
                  return (
                    <tr key={s.id} className={`strip tone-${stripTone(info.facts)}`}>
                      <td className="num">{info.scene.number}</td>
                      <td>{info.facts.side ? t(`schedule.sideShort.${info.facts.side}`) : ""}</td>
                      <td>{info.facts.moment ? t(`schedule.momentShort.${info.facts.moment}`) : ""}</td>
                      <td className="slug">{info.facts.place || info.scene.heading}</td>
                      <td>{info.cast.join(", ")}</td>
                      <td className="num">{formatEighths(info.scene.eighths)}</td>
                      <td className="num">{formatMinutes(info.minutes)}</td>
                    </tr>
                  );
                })}
                <tr className="end">
                  <td colSpan={5}>{t("schedule.endOfDay", { day: dayTitle(d) })}</td>
                  <td className="num">{formatEighths(d.eighths)}</td>
                  <td className="num">{formatMinutes(d.minutes)}</td>
                </tr>
              </tbody>
            ),
          )}
        </table>
        <h2>{t("schedule.castList")}</h2>
        <table>
          <tbody>
            {[...bd.numbers.entries()]
              .sort((x, y) => x[1] - y[1])
              .map(([name, n]) => {
                const id = team.cast.find((r) => r.character === name)?.contactId;
                return (
                  <tr key={name}>
                    <td className="num" style={{ width: "6%" }}>
                      {n}
                    </td>
                    <td className="slug">{name}</td>
                    <td>{id ? team.contacts.find((c) => c.id === id)?.name : ""}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>,
    { width: A4.long, height: A4.short, css: CSS(A4.long, A4.short) },
  );
}

/** The schedule and the presence of the cast as a workbook [PDT-07]. */
export async function exportScheduleXlsx(api: Api, b?: Board): Promise<string | null> {
  const bd = b ?? (await boardNow(api));
  if (!bd.schedule) return null;
  const strips: (string | number | null)[][] = [
    [t("schedule.day"), t("schedule.date"), t("callsheet.sceneCol"), t("schedule.ie"), t("schedule.dn"), t("callsheet.setCol"), t("callsheet.castCol"), t("callsheet.pagesCol"), t("schedule.minutes")],
  ];
  for (const d of bd.days) {
    const name = d.day.kind === "shoot" ? t("schedule.dayShort", { n: d.number }) : t(`schedule.kinds.${d.day.kind}`);
    if (d.day.kind !== "shoot" || d.strips.length === 0) strips.push([name, d.date, null, null, null, null, null, null, null]);
    for (const s of d.strips) {
      const info = s.sceneId ? bd.info.get(s.sceneId) : undefined;
      if (!info) {
        strips.push([name, d.date, null, null, null, s.banner, null, null, null]);
        continue;
      }
      strips.push([
        name,
        d.date,
        info.scene.number,
        info.facts.side ? t(`schedule.sideShort.${info.facts.side}`) : null,
        info.facts.moment ? t(`schedule.momentShort.${info.facts.moment}`) : null,
        info.facts.place || info.scene.heading,
        info.cast.join(", "),
        info.scene.eighths / 8,
        info.minutes,
      ]);
    }
  }
  const days = bd.days.filter((d) => d.day.kind !== "off");
  const dood: (string | number | null)[][] = [
    [t("team.number"), t("team.character"), ...days.map((d) => (d.day.kind === "shoot" ? t("schedule.dayShort", { n: d.number }) : t("schedule.travelShort"))), t("schedule.work"), t("schedule.hold")],
  ];
  for (const [name, n] of [...bd.numbers.entries()].sort((x, y) => x[1] - y[1])) {
    const marks = presence(
      days.map((d) => d.day),
      days.map((d) => d.characters.includes(name)),
    );
    dood.push([n, name, ...marks.map((m) => m || null), marks.filter((m) => m && m !== "H" && m !== "T").length, marks.filter((m) => m === "H").length]);
  }
  const bytes = toXlsx([
    { name: t("schedule.strips"), rows: strips, widths: [8, 12, 8, 6, 6, 36, 16, 8, 8] },
    { name: t("schedule.dood"), rows: dood, widths: [6, 24, ...days.map(() => 6), 8, 8] },
  ]);
  return unwrap(await commands.exportBytes(`${t("nav.views.schedule")} - ${bd.schedule.name} - ${api.project.title}.xlsx`, toBase64(bytes)));
}

/** The shooting days and the stages of the production, to import into any diary [PDT-06]. */
export async function exportCalendar(api: Api, b?: Board, events?: ProductionEvent[]): Promise<string> {
  const bd = b ?? (await boardNow(api));
  const stages = events ?? (await loadPlans()).events;
  const list = [
    ...bd.days
      .filter((d) => d.date && d.day.kind !== "off")
      .map((d) => ({
        uid: d.day.id,
        title: `${api.project.title} · ${d.day.kind === "shoot" ? t("schedule.dayN", { n: d.number, total: bd.shootDays }) : t("schedule.kinds.travel")}`,
        start: d.date!,
        end: d.date!,
        description: d.scenes.map((s) => `${s.scene.number}. ${s.scene.heading}`).join("\n"),
        location: [...new Set(d.scenes.map((s) => s.facts.place))].join(", "),
      })),
    ...stages.map((e) => ({ uid: e.id, title: `${api.project.title} · ${e.title}`, start: e.start, end: e.end, description: e.notes })),
  ];
  return unwrap(await commands.exportText(`${t("schedule.calendar")} - ${api.project.title}.ics`, toIcs(api.project.title, list)));
}

/** One call sheet as it prints; `person` puts their own call at the top [FDS-02, FDS-03]. */
function CallSheetPage({
  title,
  logo,
  template,
  board: b,
  team,
  day,
  sheet,
  person,
}: {
  title: string;
  logo: string | null;
  template: Template;
  board: Board;
  team: Team;
  day: Board["days"][number];
  sheet: Sheet;
  person?: Person;
}) {
  const data = sheet.data;
  const last = sheet.versions[sheet.versions.length - 1];
  const n = last ? (changes(last.data, data).size ? last.n + 1 : last.n) : 1;
  const prev = last && changes(last.data, data).size ? last.data : sheet.versions[sheet.versions.length - 2]?.data;
  const changed = prev ? changes(prev, data) : new Set<string>();
  const chg = (path: string) => (changed.has(path) ? "chg" : undefined);
  const sun = day.date && data.locations[0]?.coordinates ? sunTimes(day.date, data.locations[0].coordinates) : null;
  const contact = new Map(team.contacts.map((c) => [c.id, c]));
  const text = (v: string) => (v ? <p className="cs-text">{v}</p> : <p className="muted">–</p>);
  const sections: Record<string, ReactNode> = {
    times: (
      <section key="times">
        <div className="cs-times">
          {(["generalCall", "readyToShoot", "lunch", "wrap"] as const).map((k) => (
            <div key={k} className={chg(k)}>
              <span>{t(`callsheet.${k}`)}</span>
              <b>{data[k] || "–"}</b>
            </div>
          ))}
        </div>
        <p className="version">
          {[data.weather && `${t("callsheet.weather")} : ${data.weather}`, (data.sunrise || sun?.rise) && `${t("callsheet.sunrise")} ${data.sunrise || sun?.rise}`, (data.sunset || sun?.set) && `${t("callsheet.sunset")} ${data.sunset || sun?.set}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>
    ),
    locations: (
      <section key="locations">
        <h2>{t("callsheet.sections.locations")}</h2>
        <div className="cs-grid">
          {data.locations.map((l, i) => (
            <div key={i} className={chg(`locations.${i}`)}>
              <b>{l.name}</b>
              {text([l.address, l.parking && `${t("callsheet.parking")} : ${l.parking}`, l.notes].filter(Boolean).join("\n"))}
            </div>
          ))}
          {data.base && (
            <div className={chg("base")}>
              <b>{t("callsheet.base")}</b>
              {text(data.base)}
            </div>
          )}
        </div>
      </section>
    ),
    safety: (
      <section key="safety">
        <h2>{t("callsheet.sections.safety")}</h2>
        <div className="cs-grid">
          <div className={chg("hospital")}>
            <b>{t("callsheet.hospital")}</b>
            {text(data.hospital)}
          </div>
          <div className={chg("pharmacy")}>
            <b>{t("callsheet.pharmacy")}</b>
            {text(data.pharmacy)}
          </div>
        </div>
        <p className={chg("emergency")}>
          <b>{t("callsheet.emergency")} : </b>
          {data.emergency}
        </p>
        {data.safety && <div className={chg("safety")}>{text(data.safety)}</div>}
      </section>
    ),
    scenes: (
      <section key="scenes">
        <h2>{t("callsheet.sections.scenes")}</h2>
        <table>
          <thead>
            <tr>
              <th>{t("callsheet.sceneCol")}</th>
              <th>{t("callsheet.setCol")}</th>
              <th>{t("callsheet.castCol")}</th>
              <th className="num">{t("callsheet.pagesCol")}</th>
            </tr>
          </thead>
          <tbody>
            {day.scenes.map((s) => (
              <tr key={s.scene.id}>
                <td className="num">{s.scene.number}</td>
                <td className="slug">{s.scene.heading}</td>
                <td>{s.cast.join(", ")}</td>
                <td className="num">{formatEighths(s.scene.eighths)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ),
    cast: (
      <section key="cast">
        <h2>{t("callsheet.sections.cast")}</h2>
        <table>
          <thead>
            <tr>
              <th>{t("team.number")}</th>
              <th>{t("team.character")}</th>
              <th>{t("team.actor")}</th>
              <th>{t("callsheet.pickup")}</th>
              <th>{t("callsheet.hmc")}</th>
              <th>{t("callsheet.onSet")}</th>
              <th>{t("team.notes")}</th>
            </tr>
          </thead>
          <tbody>
            {day.characters.map((ch) => {
              const call = data.cast[ch] ?? EMPTY_CALL;
              const actor = team.cast.find((r) => r.character === ch)?.contactId;
              return (
                <tr key={ch} className={chg(`cast.${ch}`)}>
                  <td className="num">{b.numbers.get(ch) ?? ""}</td>
                  <td className="slug">{ch}</td>
                  <td>{actor ? contact.get(actor)?.name : ""}</td>
                  <td>{call.pickup}</td>
                  <td>{call.hmc}</td>
                  <td>{call.onSet}</td>
                  <td>{call.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    ),
    extras: data.extras ? (
      <section key="extras" className={chg("extras")}>
        <h2>{t("callsheet.sections.extras")}</h2>
        {text(data.extras)}
      </section>
    ) : null,
    departments: Object.values(data.departments).some(Boolean) ? (
      <section key="departments">
        <h2>{t("callsheet.sections.departments")}</h2>
        <table>
          <tbody>
            {Object.entries(data.departments)
              .filter(([, v]) => v)
              .map(([d, v]) => (
                <tr key={d} className={chg(`departments.${d}`)}>
                  <td>{departmentName(d)}</td>
                  <td className="num">{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    ) : null,
    needs: data.needs ? (
      <section key="needs" className={chg("needs")}>
        <h2>{t("callsheet.sections.needs")}</h2>
        {text(data.needs)}
      </section>
    ) : null,
    notes: data.notes ? (
      <section key="notes" className={chg("notes")}>
        <h2>{t("callsheet.sections.notes")}</h2>
        {text(data.notes)}
      </section>
    ) : null,
    nextDay: (
      <section key="nextDay" className={chg("nextDay")}>
        <h2>{t("callsheet.sections.nextDay")}</h2>
        {text(data.nextDay)}
      </section>
    ),
    contacts: data.contacts ? (
      <section key="contacts" className={chg("contacts")}>
        <h2>{t("callsheet.sections.contacts")}</h2>
        {text(data.contacts)}
      </section>
    ) : null,
  };
  return (
    <div className="page">
      <header className="cs-head">
        {logo ? <img src={logo} alt="" /> : <span />}
        <div>
          <h1>{title}</h1>
          <p className="sub" style={{ margin: 0 }}>
            {t("callsheet.sheetTitle")} · {longDate(day.date)}
          </p>
          <p className="version">{t("callsheet.versionN", { n })}</p>
        </div>
        <div className="cs-day">
          {t("schedule.dayN", { n: day.number, total: b.shootDays })}
          <small>{t("callsheet.generalCall")} {data.generalCall || "–"}</small>
        </div>
      </header>
      {person && (
        <div className="cs-you">
          <span>{t("callsheet.youAre", { name: person.name, what: person.what })}</span>
          <span>{t("callsheet.yourCall", { time: person.time || data.generalCall || "–" })}</span>
        </div>
      )}
      {template.sections.filter((s) => s.shown).map((s) => sections[s.id])}
      <p className="foot">{t("callsheet.printedOn", { date: today() })}</p>
    </div>
  );
}

/** The sheet of a day, general or one file per person named after them, in one go [FDS-05]. */
export async function exportCallSheets(
  api: Api,
  { board: b, team, day, sheet, template, people, individual }: { board: Board; team: Team; day: Board["days"][number]; sheet: Sheet; template: Template; people: Person[]; individual: boolean },
): Promise<void> {
  const logo = template.logo ? await readImage(template.logo).catch(() => null) : null;
  const name = t("schedule.dayShort", { n: day.number });
  const page = (person?: Person) => (
    <div className="pr-print">
      <CallSheetPage title={api.project.title} logo={logo} template={template} board={b} team={team} day={day} sheet={sheet} person={person} />
    </div>
  );
  const size = { width: A4.short, height: A4.long, css: CSS(A4.short, A4.long) };
  if (!individual) {
    await api.printPdf(`${t("callsheet.fileName", { day: name })} - ${api.project.title}.pdf`, page(), size);
    return;
  }
  const paths: string[] = [];
  for (const p of people) {
    const path = await api.printPdf(`${t("callsheet.fileName", { day: name })} - ${p.name}.pdf`, page(p), size, true);
    if (path) paths.push(path);
  }
  if (paths.length)
    api.notify({
      text: t("workspace.exportedMany", { count: paths.length }),
      actions: [{ label: t("workspace.showInFolder"), onClick: () => void commands.reveal(paths[0], false) }],
    });
}

/** The report of a day in PDF [FDS-08]. */
export async function exportDayReport(api: Api, { day, sheet, total }: { day: Board["days"][number]; sheet: Sheet; total: number }): Promise<void> {
  const r = sheet.report;
  const name = t("schedule.dayN", { n: day.number, total });
  await api.printPdf(
    `${t("callsheet.reportFile", { day: t("schedule.dayShort", { n: day.number }) })} - ${api.project.title}.pdf`,
    <div className="pr-print">
      <div className="run">
        <h1>
          {t("callsheet.report")} · {name}
        </h1>
        <p className="sub">
          {api.project.title} · {longDate(day.date)}
        </p>
        <h2>{t("callsheet.scenesShot")}</h2>
        <table>
          <tbody>
            {day.scenes.map((s) => (
              <tr key={s.scene.id}>
                <td className="num" style={{ width: "6%" }}>
                  {s.scene.number}
                </td>
                <td className="slug">{s.scene.heading}</td>
                <td>{r.scenes[s.scene.id] === "done" ? t("callsheet.doneShot") : r.scenes[s.scene.id] === "part" ? t("callsheet.partShot") : t("callsheet.notShot")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>{t("callsheet.realTimes")}</h2>
        <table>
          <tbody>
            <tr>
              {(["call", "firstShot", "lunch", "wrap"] as const).map((k) => (
                <td key={k}>
                  <span className="muted">{t(`callsheet.real.${k}`)}</span> <b>{r[k] || "–"}</b>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {(
          [
            ["shotsDone", r.shots],
            ["screenTime", r.screenTime],
            ["incidents", r.incidents],
            ["continuity", r.continuity],
          ] as const
        )
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <section key={k}>
              <h2>{t(`callsheet.${k}`)}</h2>
              <p className="cs-text">{v}</p>
            </section>
          ))}
        {r.notes && (
          <section>
            <h2>{t("team.notes")}</h2>
            <p className="cs-text">{r.notes}</p>
          </section>
        )}
      </div>
    </div>,
    { width: A4.short, height: A4.long, css: CSS(A4.short, A4.long) },
  );
}

