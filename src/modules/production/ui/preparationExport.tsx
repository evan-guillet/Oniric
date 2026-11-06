import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { dateFormat, t } from "../../../core/i18n";
import type { ProjectApi } from "../../project/ui/projectContext";
import { byScene, loadShots } from "../../realisation/application/shots";
import { loadEntries } from "../../script/bible/application/bible";
import { loadBreakdown } from "../application/breakdown";
import { loadPlans } from "../application/schedule";
import { loadTeam } from "../application/team";
import { loadBudgets, type Budget, type BudgetRow } from "../application/budget";
import { loadPermits } from "../application/permits";
import { loadScouting } from "../application/scouting";
import { rollUp, spentBy, topsheet, type BudgetFacts, NO_COST, resolved } from "../domain/budget";
import { toBase64, toXlsx, type XlsxCell } from "../domain/files";
import { toDocx } from "../domain/permits";
import { formatDistance, formatDuration } from "../domain/scouting";
import { readImage } from "../../shared/media";
import { budgetFacts, decorRefs, money } from "./preparation";
import { board } from "./ScheduleView";
import { shortDate } from "./parts";

type Api = Pick<ProjectApi, "session" | "printPdf" | "project" | "notify">;

const A4 = { width: 8.27, height: 11.69 };

const CSS = `
@page { size: 8.27in 11.69in; margin: 0; }
.pr-print { font-family: "Inter Variable", "Segoe UI", sans-serif; color: #111; font-size: 9pt; line-height: 1.4; }
.pr-print .run { padding: 0.55in 0.6in; }
.pr-print h1 { font-size: 15pt; margin: 0 0 2pt; letter-spacing: -0.01em; }
.pr-print .sub { color: #555; margin: 0 0 14pt; }
.pr-print h2 { font-size: 10pt; font-weight: 700; margin: 14pt 0 4pt; break-after: avoid; border-bottom: 1pt solid #111; padding-bottom: 2pt; }
.pr-print table { width: 100%; border-collapse: collapse; }
.pr-print th { text-align: left; font-weight: 600; color: #444; border-bottom: 0.75pt solid #999; padding: 3pt 4pt; font-size: 8pt; }
.pr-print td { border-bottom: 0.5pt solid #ddd; padding: 3pt 4pt; vertical-align: top; white-space: pre-wrap; }
.pr-print tr { break-inside: avoid; }
.pr-print .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pr-print .chapter td { font-weight: 700; background: #f0f0f0; }
.pr-print .post td { font-weight: 600; }
.pr-print .sum td { font-weight: 600; border-top: 1pt solid #111; }
.pr-print .grand td { font-weight: 700; font-size: 11pt; border-top: 1.5pt solid #111; border-bottom: 0; padding-top: 6pt; }
.pr-print .muted { color: #666; }
.pr-print .card { break-inside: avoid; margin-bottom: 14pt; }
.pr-print .photos { display: flex; gap: 6pt; margin: 6pt 0; }
.pr-print .photos img { height: 1.2in; max-width: 2.2in; object-fit: cover; }
.pr-print .map { width: 100%; max-height: 3in; object-fit: contain; margin-top: 6pt; }
.pr-print .pairs { display: grid; grid-template-columns: 1fr 1fr; gap: 2pt 14pt; margin: 0; }
.pr-print .pairs dt { color: #555; font-size: 7.5pt; }
.pr-print .pairs dd { margin: 0 0 4pt; white-space: pre-wrap; }
.pr-print .letter { padding: 0.9in 1in; font-size: 11pt; line-height: 1.55; white-space: pre-wrap; }
.pr-print .letter h1 { margin-bottom: 18pt; }
`;

const today = () => dateFormat({ day: "numeric", month: "long", year: "numeric" }).format(new Date());

/** What the budget's exports read: the current version and what its links follow. */
async function budgetData(api: Api): Promise<{ budget: Budget; lines: BudgetRow[]; facts: BudgetFacts; expenses: Awaited<ReturnType<typeof loadBudgets>>["expenses"]; funding: Awaited<ReturnType<typeof loadBudgets>>["funding"] }> {
  const [data, plans, team, shots, scouting, breakdown, entries] = await Promise.all([loadBudgets(), loadPlans(), loadTeam(), loadShots(), loadScouting(), loadBreakdown(), loadEntries()]);
  const budget = data.budgets.find((b) => b.id === data.currentId);
  if (!budget) throw new Error(t("budget.nothingToExport"));
  const bd = board(api.session.scenes(), plans, team, plans.schedules.find((x) => x.id === plans.currentId) ?? null, byScene(shots));
  const facts = budgetFacts(bd, team, scouting, breakdown, decorRefs(scouting.locations, entries));
  return { budget, lines: data.lines.filter((l) => l.budgetId === budget.id), facts, expenses: data.expenses, funding: data.funding };
}

/** The topsheet and the detail of the current version [BUD-08]. */
export async function exportBudgetPdf(api: Api): Promise<void> {
  const { budget, lines, facts, expenses } = await budgetData(api);
  const s = budget.settings;
  const sheet = topsheet(lines, s, facts);
  const costs = rollUp(lines, s, facts);
  const spent = spentBy(lines, expenses, s);
  const m = (n: number) => money(n, s.currency);
  const kids = (id: string) => lines.filter((l) => l.parentId === id);
  await api.printPdf(
    `${t("budget.fileName")} - ${budget.name} - ${api.project.title}.pdf`,
    <div className="pr-print">
      <div className="run">
        <h1>{t("budget.printTitle", { title: api.project.title })}</h1>
        <p className="sub">
          {[budget.name, t(`budget.kinds.${budget.kind}`)].filter((x, i, all) => all.indexOf(x) === i).join(" · ")} · {today()}
        </p>
        <h2>{t("budget.pages.summary")}</h2>
        <table>
          <tbody>
            {sheet.chapters.map((c) => (
              <tr key={c.id}>
                <td>{`${c.code} ${c.label}`.trim()}</td>
                <td className="num">{m(c.cost.gross)}</td>
              </tr>
            ))}
            <tr className="sum">
              <td>{t("budget.rows.lines")}</td>
              <td className="num">{m(sheet.lines)}</td>
            </tr>
            {(["social", "overheads", "insurance", "bond", "contingency"] as const).map(
              (k) =>
                sheet[k] > 0 && (
                  <tr key={k}>
                    <td>{t(`budget.rows.${k}`)}</td>
                    <td className="num">{m(sheet[k])}</td>
                  </tr>
                ),
            )}
            <tr className="sum">
              <td>{t("budget.rows.net")}</td>
              <td className="num">{m(sheet.net)}</td>
            </tr>
            {sheet.vat > 0 && (
              <tr>
                <td>{t("budget.rows.vat")}</td>
                <td className="num">{m(sheet.vat)}</td>
              </tr>
            )}
            <tr className="grand">
              <td>{t("budget.rows.total")}</td>
              <td className="num">{m(sheet.total)}</td>
            </tr>
          </tbody>
        </table>
        <h2>{t("budget.pages.grid")}</h2>
        <table>
          <thead>
            <tr>
              <th>{t("budget.columns.label")}</th>
              <th className="num">{t("budget.columns.quantity")}</th>
              <th>{t("budget.columns.unit")}</th>
              <th className="num">{t("budget.columns.people")}</th>
              <th className="num">{t("budget.columns.rate")}</th>
              <th className="num">{t("budget.columns.total")}</th>
              <th className="num">{t("budget.columns.spent")}</th>
            </tr>
          </thead>
          <tbody>
            {lines
              .filter((l) => l.level === "chapter")
              .flatMap((c) => [
                <tr key={c.id} className="chapter">
                  <td colSpan={5}>{`${c.data.code ?? ""} ${c.label}`.trim()}</td>
                  <td className="num">{m((costs.get(c.id) ?? NO_COST).gross)}</td>
                  <td className="num">{spent.get(c.id) ? m(spent.get(c.id)!) : ""}</td>
                </tr>,
                ...kids(c.id).flatMap((p) => {
                  const own = kids(p.id);
                  if (!own.length) return [];
                  return [
                    <tr key={p.id} className="post">
                      <td colSpan={5}>{p.label}</td>
                      <td className="num">{m((costs.get(p.id) ?? NO_COST).gross)}</td>
                      <td className="num">{spent.get(p.id) ? m(spent.get(p.id)!) : ""}</td>
                    </tr>,
                    ...own.map((l) => {
                      const d = resolved(l.data, facts);
                      return (
                        <tr key={l.id}>
                          <td>{l.label}</td>
                          <td className="num">{d.quantity}</td>
                          <td>{t(`budget.units.${d.unit}`)}</td>
                          <td className="num">{d.people}</td>
                          <td className="num">{m(d.rate)}</td>
                          <td className="num">{m((costs.get(l.id) ?? NO_COST).gross)}</td>
                          <td className="num">{spent.get(l.id) ? m(spent.get(l.id)!) : ""}</td>
                        </tr>
                      );
                    }),
                  ];
                }),
              ])}
          </tbody>
        </table>
      </div>
    </div>,
    { ...A4, css: CSS },
  );
}

/** The same in a workbook: a sheet for the summary, the grid, the expenses, the financing [BUD-08]. */
export async function exportBudgetXlsx(api: Api): Promise<string> {
  const { budget, lines, facts, expenses, funding } = await budgetData(api);
  const s = budget.settings;
  const sheet = topsheet(lines, s, facts);
  const costs = rollUp(lines, s, facts);
  const summary: XlsxCell[][] = [
    [t("budget.columns.chapter"), `${t("budget.columns.total")} (${s.currency})`],
    ...sheet.chapters.map((c): XlsxCell[] => [`${c.code} ${c.label}`.trim(), c.cost.gross]),
    [t("budget.rows.lines"), sheet.lines],
    ...(["social", "overheads", "insurance", "bond", "contingency"] as const).map((k): XlsxCell[] => [t(`budget.rows.${k}`), sheet[k]]),
    [t("budget.rows.net"), sheet.net],
    [t("budget.rows.vat"), sheet.vat],
    [t("budget.rows.total"), sheet.total],
  ];
  const kids = (id: string) => lines.filter((l) => l.parentId === id);
  const grid: XlsxCell[][] = [[t("budget.columns.chapter"), t("budget.columns.post"), t("budget.columns.label"), t("budget.columns.quantity"), t("budget.columns.unit"), t("budget.columns.people"), t("budget.columns.rate"), t("budget.columns.total"), t("budget.columns.charges"), t("budget.columns.vat")]];
  for (const c of lines.filter((l) => l.level === "chapter"))
    for (const p of kids(c.id))
      for (const l of kids(p.id)) {
        const d = resolved(l.data, facts);
        const cost = costs.get(l.id) ?? NO_COST;
        grid.push([c.label, p.label, l.label, d.quantity, t(`budget.units.${d.unit}`), d.people, d.rate, cost.gross, cost.social, cost.vat]);
      }
  const lineName = new Map(lines.map((l) => [l.origin, l.label]));
  const spend: XlsxCell[][] = [[t("budget.columns.date"), t("budget.columns.expense"), t("budget.columns.supplier"), t("budget.columns.line"), t("budget.columns.amount"), t("budget.currency")], ...expenses.map((e): XlsxCell[] => [e.date, e.label, e.supplier, e.origin ? (lineName.get(e.origin) ?? "") : "", e.amount, e.currency])];
  const plan: XlsxCell[][] = [[t("budget.columns.source"), t("budget.columns.fundingKind"), t("budget.columns.amount"), t("budget.currency"), t("budget.columns.status")], ...funding.map((f): XlsxCell[] => [f.name, t(`budget.fundingKinds.${f.kind}`), f.amount, f.currency, t(`budget.fundingStatuses.${f.status}`)])];
  const bytes = toXlsx([
    { name: t("budget.pages.summary"), rows: summary, widths: [42, 16] },
    { name: t("budget.pages.grid"), rows: grid, widths: [28, 28, 36, 10, 10, 10, 12, 12, 12, 12] },
    { name: t("budget.pages.expenses"), rows: spend, widths: [12, 32, 24, 32, 12, 8] },
    { name: t("budget.pages.funding"), rows: plan, widths: [32, 24, 12, 8, 12] },
  ]);
  return unwrap(await commands.exportBytes(`${t("budget.fileName")} - ${budget.name} - ${api.project.title}.xlsx`, toBase64(bytes)));
}

/** The file of the sets: what one needs to know to go there, with the photos and the map [REP-01]. */
export async function exportScoutingPdf(api: Api): Promise<void> {
  const s = await loadScouting();
  const base = s.locations.find((l) => l.kind === "base");
  const list = s.locations.filter((l) => l.status !== "refused");
  const images = new Map<string, string>();
  for (const l of list)
    for (const p of [...l.data.photos.slice(0, 3), ...(l.data.capture ? [l.data.capture] : [])]) {
      const url = await readImage(p).catch(() => null);
      if (url) images.set(p, url);
    }
  const pairs: (keyof typeof list[number]["data"])[] = ["type", "ownerName", "ownerContact", "access", "parking", "power", "toilets", "network", "noise", "constraints", "hospital", "pharmacy"];
  await api.printPdf(
    `${t("scouting.fileName")} - ${api.project.title}.pdf`,
    <div className="pr-print">
      <div className="run">
        <h1>{t("scouting.printTitle", { title: api.project.title })}</h1>
        <p className="sub">{today()}</p>
        {list.map((l) => {
          const route = base ? s.routes.find((r) => r.from === base.id && r.to === l.id && r.mode === "car") : undefined;
          return (
            <section key={l.id} className="card">
              <h2>
                {l.name} · {l.kind === "set" ? t(`scouting.statuses.${l.status}`) : t(`scouting.kinds.${l.kind}`)}
              </h2>
              {l.address && <p>{l.address}</p>}
              {l.lat !== null && (
                <p className="muted">
                  {l.lat}, {l.lon}
                  {route && ` · ${t("scouting.fromBaseRoute", { distance: formatDistance(route.distance), time: formatDuration(route.duration) })}`}
                </p>
              )}
              <div className="photos">{l.data.photos.slice(0, 3).map((p) => images.get(p) && <img key={p} src={images.get(p)} alt="" />)}</div>
              <dl className="pairs">
                {pairs.map(
                  (k) =>
                    l.data[k] && (
                      <div key={k}>
                        <dt>{t(`scouting.fields.${k}`)}</dt>
                        <dd>{String(l.data[k])}</dd>
                      </div>
                    ),
                )}
              </dl>
              {l.data.capture && images.get(l.data.capture) && <img className="map" src={images.get(l.data.capture)} alt="" />}
            </section>
          );
        })}
      </div>
    </div>,
    { ...A4, css: CSS },
  );
}

/** Where each permit stands, each release and each insurance, on one list [AUT-02]. */
export async function exportPermitsPdf(api: Api): Promise<void> {
  const [p, s] = await Promise.all([loadPermits(), loadScouting()]);
  const place = (id: string | null) => s.locations.find((l) => l.id === id)?.name ?? "";
  await api.printPdf(
    `${t("permits.fileName")} - ${api.project.title}.pdf`,
    <div className="pr-print">
      <div className="run">
        <h1>{t("permits.printTitle", { title: api.project.title })}</h1>
        <p className="sub">{today()}</p>
        <h2>{t("permits.pages.requests")}</h2>
        <table>
          <thead>
            <tr>
              <th>{t("permits.set")}</th>
              <th>{t("permits.kind")}</th>
              <th>{t("permits.authority")}</th>
              <th>{t("permits.start")}</th>
              <th>{t("permits.end")}</th>
              <th>{t("permits.deadline")}</th>
              <th>{t("permits.status")}</th>
            </tr>
          </thead>
          <tbody>
            {p.permits.map((x) => (
              <tr key={x.id}>
                <td>{place(x.locationId)}</td>
                <td>{t(`permits.kinds.${x.kind}`)}</td>
                <td>{x.authority ? t(`permits.authorities.${x.authority}`, { defaultValue: x.authority }) : ""}</td>
                <td>{shortDate(x.start)}</td>
                <td>{shortDate(x.end)}</td>
                <td>{shortDate(x.deadline)}</td>
                <td>{t(`permits.statuses.${x.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {p.releases.length > 0 && (
          <>
            <h2>{t("permits.pages.releases")}</h2>
            <table>
              <tbody>
                {p.releases.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{t(`permits.releaseStatuses.${r.status}`)}</td>
                    <td>{shortDate(r.signedOn)}</td>
                    <td>{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {p.insurances.length > 0 && (
          <>
            <h2>{t("permits.pages.insurance")}</h2>
            <table>
              <tbody>
                {p.insurances.map((i) => (
                  <tr key={i.id}>
                    <td>{i.activity}</td>
                    <td>{i.locationId ? place(i.locationId) : t("permits.wholeShoot")}</td>
                    <td>{i.insurer}</td>
                    <td>{i.policy}</td>
                    <td>{shortDate(i.start)}</td>
                    <td>{shortDate(i.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>,
    { ...A4, css: CSS },
  );
}

const safeName = (title: string) => title.replace(/[\\/:*?"<>|]/g, " ").trim();

export async function legalDocuments(): Promise<{ id: string; title: string }[]> {
  return (await loadPermits()).documents.map((d) => ({ id: d.id, title: d.title }));
}

/** A letter or a contract as a PDF [AUT-03]. */
export async function exportLegalPdf(api: Api, id: string): Promise<void> {
  const d = (await loadPermits()).documents.find((x) => x.id === id);
  if (!d) return;
  await api.printPdf(
    `${safeName(d.title)}.pdf`,
    <div className="pr-print">
      <div className="letter">
        <h1>{d.title}</h1>
        {d.body}
      </div>
    </div>,
    { ...A4, css: CSS },
  );
}

/** The same in Word, to rework it or hand it over [AUT-03]. */
export async function exportLegalDocx(id: string): Promise<string | null> {
  const d = (await loadPermits()).documents.find((x) => x.id === id);
  if (!d) return null;
  return unwrap(await commands.exportBytes(`${safeName(d.title)}.docx`, toBase64(toDocx(d.title, d.body))));
}
