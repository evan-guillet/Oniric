import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, ChevronRight, Copy, Link2, Paperclip, Pencil, Plus, Settings2, StickyNote, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import type { BudgetKind, FundingStatus } from "../../../core/db/schema";
import { describeError } from "../../../core/errors";
import { numberFormat, plural, t } from "../../../core/i18n";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { MoreMenu, type MoreItem } from "../../../ui-kit/MoreMenu";
import { SearchBox } from "../../../ui-kit/SearchBox";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { PAGE_KEY, useProject } from "../../project/ui/projectContext";
import { fold } from "../../script/bible/domain/types";
import {
  addExpense,
  addFunding,
  addRow,
  chooseBudget,
  createBudget,
  deleteBudget,
  deleteExpense,
  deleteFunding,
  deleteRow,
  duplicateBudget,
  updateBudget,
  updateExpense,
  updateFunding,
  updateRow,
  useBudgets,
  type Budget,
  type Budgets,
  type BudgetRow,
  type Expense,
  type Funding,
} from "../application/budget";
import { useBreakdown } from "../application/breakdown";
import { useScouting } from "../application/scouting";
import { useTeam } from "../application/team";
import {
  BUDGET_KINDS,
  cents,
  compareChapters,
  fundingTotals,
  FUNDING_KINDS,
  FUNDING_STATUSES,
  GRID_MODELS,
  NO_COST,
  overruns,
  resolved,
  rollUp,
  spentBy,
  topsheet,
  UNITS,
  type BudgetFacts,
  type BudgetSettings,
  type LineData,
  type LineLink,
} from "../domain/budget";
import { departmentName } from "../domain/catalog";
import { Field, ViewTools } from "./parts";
import { money, useBudgetFacts } from "./preparation";

type Tab = "grid" | "summary" | "expenses" | "funding";

/** A number written the way one writes it here: « 1 250,50 »; what reads as nothing is 0. */
export const readNumber = (text: string) => {
  const n = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function useFail() {
  const { notify } = useProject();
  return (e: unknown) => notify({ text: describeError(e), tone: "error" });
}

/** The budget of the film: the grid, its summary, what was spent and how it is financed [BUD-01 to BUD-09]. */
export function BudgetView() {
  const [tab] = useStoredState<Tab>(PAGE_KEY.budget, "grid");
  const b = useBudgets();
  const facts = useBudgetFacts();
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!b) return null;
  const current = b.budgets.find((x) => x.id === b.currentId) ?? null;
  if (!current) return <Start b={b} />;
  const lines = b.lines.filter((l) => l.budgetId === current.id);
  return (
    <>
      <Tools b={b} current={current} onSettings={() => setSettingsOpen(true)} />
      {tab === "grid" && <Grid key={current.id} b={b} budget={current} lines={lines} facts={facts} />}
      {tab === "summary" && <Summary b={b} budget={current} lines={lines} facts={facts} />}
      {tab === "expenses" && <Expenses b={b} budget={current} lines={lines} />}
      {tab === "funding" && <FundingPage b={b} budget={current} lines={lines} facts={facts} />}
      {settingsOpen && <SettingsDialog budget={current} onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

/** No budget yet: a grid to start from [BUD-01]. */
function Start({ b }: { b: Budgets }) {
  const fail = useFail();
  return (
    <div className="view view-pad">
      <EmptyState title={t("budget.emptyTitle")}>
        <p className="muted">{t("budget.emptyText")}</p>
        <div className="pr-start-choices">
          {GRID_MODELS.map((m, i) => (
            <button key={m.id} type="button" className={i === 0 ? "btn primary" : "btn"} onClick={() => void createBudget(b, t("budget.kinds.estimate"), "estimate", m).catch(fail)}>
              {t(`budget.models.${m.id}`)}
            </button>
          ))}
        </div>
      </EmptyState>
    </div>
  );
}

function Tools({ b, current, onSettings }: { b: Budgets; current: Budget; onSettings: () => void }) {
  const { prompt, ask } = useProject();
  const fail = useFail();
  const copy = async (from: Budget, kind: BudgetKind) => {
    const name = (await prompt(t("budget.newVersion"), t("budget.versionName"), t(`budget.kinds.${kind}`)))?.trim();
    if (name) await duplicateBudget(b, from, name, kind).catch(fail);
  };
  const items: MoreItem[] = GRID_MODELS.map((m) => ({
    label: t("budget.newFrom", { model: t(`budget.models.${m.id}`) }),
    icon: Plus,
    onClick: () => {
      void (async () => {
        const name = (await prompt(t("budget.newVersion"), t("budget.versionName"), t("budget.kinds.estimate")))?.trim();
        if (name) await createBudget(b, name, "estimate", m).catch(fail);
      })();
    },
  }));
  // What is done to one version, from the « ⋯ » of its row: the one shown or another.
  const versionItems = (id: string): MoreItem[] => {
    const x = b.budgets.find((v) => v.id === id);
    if (!x) return [];
    return [
      ...BUDGET_KINDS.map((k) => ({ label: t("budget.copyAs", { kind: t(`budget.kinds.${k}`) }), icon: Copy, onClick: () => void copy(x, k) })),
      {
        label: t("budget.rename"),
        icon: Pencil,
        onClick: () => {
          void (async () => {
            const name = (await prompt(t("budget.rename"), t("budget.versionName"), x.name))?.trim();
            if (name) await updateBudget(x.id, { name }).catch(fail);
          })();
        },
      },
      {
        label: t("budget.deleteVersion"),
        icon: Trash2,
        danger: true,
        onClick: () => {
          void (async () => {
            if (await confirmRemoval(ask, { title: t("budget.deleteTitle", { name: x.name }), text: t("budget.deleteText") })) await deleteBudget(x.id).catch(fail);
          })();
        },
      },
    ];
  };
  return (
    <ViewTools>
      <Select value={current.id} aria-label={t("budget.version")} actions={items} optionActions={versionItems} optionMenuLabel={(name) => t("budget.versionActions", { name })} onChange={(e) => void chooseBudget(e.target.value).catch(fail)}>
        {b.budgets.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </Select>
      <button type="button" className="btn view-tools-end" onClick={onSettings}>
        <Settings2 aria-hidden="true" />
        {t("budget.settings")}
      </button>
    </ViewTools>
  );
}

/** A number in a cell of the grid: plain until it is written in. */
function NumberCell({ label, value, onCommit, suffix, readOnly, title }: { label: string; value: number; onCommit: (n: number) => void; suffix?: string; readOnly?: boolean; title?: string }) {
  if (readOnly)
    return (
      <span className="bu-num bu-linked" title={title}>
        <Link2 aria-hidden="true" />
        {numberFormat({ maximumFractionDigits: 2 }).format(value)}
      </span>
    );
  return (
    <span className="bu-cell" data-suffix={suffix}>
      <Field label={label} hideLabel value={value ? String(value).replace(".", ",") : ""} placeholder="0" onCommit={(v) => onCommit(readNumber(v))} />
    </span>
  );
}

/** The grid: chapters, posts, lines, in one table; what is linked to the film follows it [BUD-01 to BUD-03]. */
function Grid({ b, budget, lines, facts }: { b: Budgets; budget: Budget; lines: BudgetRow[]; facts: BudgetFacts }) {
  const { project, ask } = useProject();
  const fail = useFail();
  const s = budget.settings;
  const [shut, setShut] = useStoredState<string[]>(`oniric.budget.shut.${project.id}`, []);
  const [linking, setLinking] = useState<BudgetRow | null>(null);
  const [noting, setNoting] = useState<BudgetRow | null>(null);
  const costs = useMemo(() => rollUp(lines, s, facts), [lines, s, facts]);
  const spent = useMemo(() => spentBy(lines, b.expenses, s), [lines, b.expenses, s]);
  const sum = useMemo(() => topsheet(lines, s, facts), [lines, s, facts]);
  const toggle = (id: string) => setShut(shut.includes(id) ? shut.filter((x) => x !== id) : [...shut, id]);
  const childrenOf = (id: string) => lines.filter((l) => l.parentId === id);
  const setLine = (l: BudgetRow, patch: Partial<LineData>) => void updateRow(l.id, { data: { ...l.data, ...patch } }).catch(fail);
  const remove = async (l: BudgetRow) => {
    const inside = l.level !== "line" && childrenOf(l.id).length > 0;
    const empty = !inside && !l.label && !l.data.rate;
    if (empty || (await confirmRemoval(ask, { title: t("budget.deleteRow", { name: l.label || t("budget.untitled") }), text: inside ? t("budget.deleteRowInside") : t("budget.deleteRowText") }))) await deleteRow(l.id).catch(fail);
  };
  const add = (parentId: string | null, level: BudgetRow["level"]) =>
    void addRow(b, budget.id, parentId, level)
      .then(() => {
        requestAnimationFrame(() => {
          const rows = document.querySelectorAll<HTMLInputElement>(`[data-level="${level}"] input`);
          const found = [...rows].filter((r) => r.closest("[data-parent]")?.getAttribute("data-parent") === (parentId ?? ""));
          found[found.length - 1]?.focus();
        });
      })
      .catch(fail);

  const totalCells = (id: string) => {
    const c = costs.get(id) ?? NO_COST;
    const out = spent.get(id) ?? 0;
    return (
      <>
        <td className="num bu-strong">{money(c.gross, s.currency)}</td>
        <td className="num muted">{c.social ? money(c.social, s.currency) : ""}</td>
        <td />
        <td className={out > c.gross ? "num bu-over" : "num muted"}>{out ? money(out, s.currency) : ""}</td>
      </>
    );
  };
  return (
    <div className="view pr-view">
      <main className="view-main pr-frame-main bu-grid-main">
        <div className="bu-scroll">
          <table className="bu-grid pr-quiet">
            <thead>
              <tr>
                <th className="bu-label">{t("budget.columns.label")}</th>
                <th className="num">{t("budget.columns.quantity")}</th>
                <th>{t("budget.columns.unit")}</th>
                <th className="num">{t("budget.columns.people")}</th>
                <th className="num">{t("budget.columns.rate")}</th>
                <th>{t("budget.columns.social")}</th>
                <th className="num">{t("budget.columns.vat")}</th>
                <th className="num">{t("budget.columns.total")}</th>
                <th className="num">{t("budget.columns.charges")}</th>
                <th />
                <th className="num">{t("budget.columns.spent")}</th>
                <th aria-label={t("budget.columns.actions")} />
              </tr>
            </thead>
            {lines
              .filter((l) => l.level === "chapter")
              .map((chapter) => {
                const open = !shut.includes(chapter.id);
                return (
                  <tbody key={chapter.id}>
                    <tr className="bu-chapter" data-level="chapter" data-parent="">
                      <th colSpan={7} scope="rowgroup">
                        <span className="bu-title">
                          <button type="button" className="icon-btn bu-fold" aria-expanded={open} aria-label={open ? t("budget.fold", { name: chapter.label }) : t("budget.unfold", { name: chapter.label })} onClick={() => toggle(chapter.id)}>
                            <ChevronRight aria-hidden="true" className={open ? "open" : ""} />
                          </button>
                          {chapter.data.code && <span className="bu-code">{chapter.data.code}</span>}
                          <Field label={t("budget.chapterName")} hideLabel value={chapter.label} placeholder={t("budget.chapterName")} onCommit={(v) => void updateRow(chapter.id, { label: v }).catch(fail)} />
                        </span>
                      </th>
                      {totalCells(chapter.id)}
                      <td>
                        <span className="bu-row-tools">
                          <button type="button" className="icon-btn bu-add-post" title={t("budget.addPost")} aria-label={t("budget.addPost")} onClick={() => add(chapter.id, "post")}>
                            <Plus aria-hidden="true" />
                          </button>
                          <MoreMenu label={t("budget.rowMenu")} items={[{ label: t("budget.deleteChapter"), icon: Trash2, danger: true, onClick: () => void remove(chapter) }]} />
                        </span>
                      </td>
                    </tr>
                    {open &&
                      childrenOf(chapter.id).map((post) => {
                        const postOpen = !shut.includes(post.id);
                        return [
                          <tr key={post.id} className="bu-post" data-level="post" data-parent={chapter.id}>
                            <th colSpan={7} scope="row">
                              <span className="bu-title">
                                <button type="button" className="icon-btn bu-fold" aria-expanded={postOpen} aria-label={postOpen ? t("budget.fold", { name: post.label }) : t("budget.unfold", { name: post.label })} onClick={() => toggle(post.id)}>
                                  <ChevronRight aria-hidden="true" className={postOpen ? "open" : ""} />
                                </button>
                                <Field label={t("budget.postName")} hideLabel value={post.label} placeholder={t("budget.postName")} onCommit={(v) => void updateRow(post.id, { label: v }).catch(fail)} />
                              </span>
                            </th>
                            {totalCells(post.id)}
                            <td>
                              <span className="bu-row-tools">
                                <button type="button" className="icon-btn bu-add-line" title={t("budget.addLine")} aria-label={t("budget.addLine")} onClick={() => add(post.id, "line")}>
                                  <Plus aria-hidden="true" />
                                </button>
                                <MoreMenu label={t("budget.rowMenu")} items={[{ label: t("budget.deletePost"), icon: Trash2, danger: true, onClick: () => void remove(post) }]} />
                              </span>
                            </td>
                          </tr>,
                          ...(postOpen
                            ? childrenOf(post.id).map((l) => <Line key={l.id} line={l} settings={s} facts={facts} cells={totalCells(l.id)} onSet={(p) => setLine(l, p)} onLink={() => setLinking(l)} onNotes={() => setNoting(l)} onDelete={() => void remove(l)} />)
                            : []),
                        ];
                      })}
                  </tbody>
                );
              })}
            <tfoot>
              <tr>
                <td colSpan={7}>
                  <button type="button" className="btn text small" onClick={() => add(null, "chapter")}>
                    <Plus aria-hidden="true" />
                    {t("budget.addChapter")}
                  </button>
                </td>
                <td className="num bu-strong">{money(sum.lines, s.currency)}</td>
                <td className="num">{money(sum.social, s.currency)}</td>
                <td colSpan={3} className="num bu-total" title={t("budget.totalHint")}>
                  {t("budget.grandTotal", { total: money(sum.total, s.currency) })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </main>
      {linking && <LinkDialog line={linking} onClose={() => setLinking(null)} />}
      {noting && <NotesDialog line={noting} onClose={() => setNoting(null)} />}
    </div>
  );
}

function Line({ line: l, settings: s, facts, cells, onSet, onLink, onNotes, onDelete }: { line: BudgetRow; settings: BudgetSettings; facts: BudgetFacts; cells: React.ReactNode; onSet: (p: Partial<LineData>) => void; onLink: () => void; onNotes: () => void; onDelete: () => void }) {
  const fail = useFail();
  const d = resolved(l.data, facts);
  const link = l.data.link;
  const rateFollows = !!link && (link.kind === "crew" ? facts.crew.get(link.id)?.rate != null : link.kind === "location" ? facts.location.get(link.id)?.rental != null : false);
  return (
    <tr className="bu-line" data-level="line" data-parent={l.parentId ?? ""}>
      <th scope="row" className="bu-label">
        <span className="bu-line-label">
          <Field label={t("budget.columns.label")} hideLabel value={l.label} placeholder={t("budget.linePlaceholder")} onCommit={(v) => void updateRow(l.id, { label: v }).catch(fail)} />
          {l.data.notes && (
            <button type="button" className="icon-btn" title={l.data.notes} aria-label={t("budget.notes")} onClick={onNotes}>
              <StickyNote aria-hidden="true" />
            </button>
          )}
        </span>
      </th>
      <td className="num">
        <NumberCell label={t("budget.columns.quantity")} value={d.quantity} readOnly={!!link} title={t("budget.linkedHint")} onCommit={(n) => onSet({ quantity: n })} />
      </td>
      <td>
        <Select value={d.unit} disabled={!!link} aria-label={t("budget.columns.unit")} onChange={(e) => onSet({ unit: e.target.value as LineData["unit"] })}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {t(`budget.units.${u}`)}
            </option>
          ))}
        </Select>
      </td>
      <td className="num">
        <NumberCell label={t("budget.columns.people")} value={d.people} onCommit={(n) => onSet({ people: n })} />
      </td>
      <td className="num bu-rate">
        <span className="bu-rate-cell">
          <NumberCell label={t("budget.columns.rate")} value={d.rate} readOnly={rateFollows} title={t("budget.linkedHint")} onCommit={(n) => onSet({ rate: n })} />
          {/* Only a budget that knows other currencies needs the choice; a line in one no longer listed keeps showing it. */}
          {(s.exchange.length > 0 || (d.currency && d.currency !== s.currency)) && (
            <Select className="bu-currency" value={d.currency || s.currency} aria-label={t("budget.currency")} onChange={(e) => onSet({ currency: e.target.value === s.currency ? "" : e.target.value })}>
              {[...new Set([s.currency, ...s.exchange.map((x) => x.currency).filter(Boolean), d.currency || s.currency])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </span>
      </td>
      <td>
        <Select value={d.social} aria-label={t("budget.columns.social")} onChange={(e) => onSet({ social: e.target.value })}>
          <option value="">{t("budget.noSocial")}</option>
          {s.regimes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </td>
      <td className="num">
        <NumberCell label={t("budget.columns.vat")} value={d.vat} onCommit={(n) => onSet({ vat: n })} />
      </td>
      {cells}
      <td>
        <span className="bu-row-tools">
        <MoreMenu
          label={t("budget.rowMenu")}
          items={[
            { label: link ? t("budget.changeLink") : t("budget.link"), icon: Link2, hint: t("budget.linkHint"), onClick: onLink },
            { label: t("budget.notes"), icon: StickyNote, onClick: onNotes },
            { label: t("budget.deleteLine"), icon: Trash2, danger: true, onClick: onDelete },
          ]}
        />
        </span>
      </td>
    </tr>
  );
}

/** Ties a line to a post of the crew, an element, a set or the days of the schedule [BUD-03]. */
function LinkDialog({ line, onClose }: { line: BudgetRow; onClose: () => void }) {
  const fail = useFail();
  const team = useTeam();
  const breakdown = useBreakdown();
  const scouting = useScouting();
  const [kind, setKind] = useState<LineLink["kind"] | "">(line.data.link?.kind ?? "");
  const [id, setId] = useState(line.data.link && "id" in line.data.link ? line.data.link.id : "");
  const options = useMemo((): { id: string; name: string }[] => {
    if (kind === "crew") {
      const names = new Map(team?.contacts.map((c) => [c.id, c.name]));
      return (team?.crew ?? []).map((m) => ({ id: m.id, name: `${m.role || departmentName(m.department)} · ${names.get(m.contactId) ?? ""}` }));
    }
    if (kind === "element") return (breakdown?.elements ?? []).map((e) => ({ id: e.id, name: e.name }));
    if (kind === "location") return (scouting?.locations ?? []).filter((l) => l.kind === "set").map((l) => ({ id: l.id, name: l.name }));
    return [];
  }, [kind, team, breakdown, scouting]);
  const needsId = kind !== "" && kind !== "shootDays";
  const chosen = options.find((o) => o.id === id)?.id ?? options[0]?.id ?? "";
  const save = () => {
    const link: LineLink | null = kind === "" ? null : kind === "shootDays" ? { kind } : chosen ? { kind, id: chosen } : null;
    void updateRow(line.id, { data: { ...line.data, link } }).catch(fail);
    onClose();
  };
  return (
    <Dialog title={t("budget.linkTitle", { name: line.label || t("budget.untitled") })} onCancel={onClose} actions={[{ label: t("common.cancel"), onClick: onClose }, { label: t("common.save"), primary: true, disabled: needsId && !chosen, onClick: save }]}>
      <p className="muted">{t("budget.linkText")}</p>
      <div className="pr-form">
        <label className="pr-field">
          <span>{t("budget.linkKind")}</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value as LineLink["kind"] | "")}>
            <option value="">{t("budget.linkKinds.none")}</option>
            <option value="shootDays">{t("budget.linkKinds.shootDays")}</option>
            <option value="crew">{t("budget.linkKinds.crew")}</option>
            <option value="element">{t("budget.linkKinds.element")}</option>
            <option value="location">{t("budget.linkKinds.location")}</option>
          </Select>
        </label>
        {needsId && (
          <label className="pr-field">
            <span>{t(`budget.linkKinds.${kind}`)}</span>
            {options.length ? (
              <Select value={chosen} onChange={(e) => setId(e.target.value)}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="muted">{t("budget.linkNothing")}</p>
            )}
          </label>
        )}
      </div>
    </Dialog>
  );
}

function NotesDialog({ line, onClose }: { line: BudgetRow; onClose: () => void }) {
  const fail = useFail();
  const [text, setText] = useState(line.data.notes);
  const save = () => {
    void updateRow(line.id, { data: { ...line.data, notes: text } }).catch(fail);
    onClose();
  };
  return (
    <Dialog title={t("budget.notesTitle", { name: line.label || t("budget.untitled") })} onCancel={onClose} actions={[{ label: t("common.cancel"), onClick: onClose }, { label: t("common.save"), primary: true, onClick: save }]}>
      <label className="pr-field">
        <span>{t("budget.notes")}</span>
        <textarea rows={5} value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      </label>
    </Dialog>
  );
}

/** What one version reckons on top of its lines, and in which currency [BUD-02, BUD-04, BUD-09]. */
function SettingsDialog({ budget, onClose }: { budget: Budget; onClose: () => void }) {
  const fail = useFail();
  const [s, setS] = useState<BudgetSettings>(budget.settings);
  const [kind, setKind] = useState<BudgetKind>(budget.kind);
  const pct = (key: "contingency" | "overheads" | "insurance" | "bond") => (
    <Field key={key} label={t(`budget.percent.${key}`)} value={String(s[key]).replace(".", ",")} onCommit={(v) => setS({ ...s, [key]: readNumber(v) })} />
  );
  const save = () => {
    void updateBudget(budget.id, { settings: s, kind }).catch(fail);
    onClose();
  };
  return (
    <Dialog wide title={t("budget.settingsTitle", { name: budget.name })} onCancel={onClose} actions={[{ label: t("common.cancel"), onClick: onClose }, { label: t("common.save"), primary: true, onClick: save }]}>
      <div className="pr-form bu-settings">
        <label className="pr-field">
          <span>{t("budget.kind")}</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value as BudgetKind)}>
            {BUDGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`budget.kinds.${k}`)}
              </option>
            ))}
          </Select>
        </label>
        <Field label={t("budget.currency")} value={s.currency} normalize={(v) => v.trim().toUpperCase().slice(0, 3)} onCommit={(v) => setS({ ...s, currency: v || "EUR" })} />
        {pct("contingency")}
        {pct("overheads")}
        {pct("insurance")}
        {pct("bond")}
      </div>
      <h3 className="bu-dialog-title">{t("budget.regimes")}</h3>
      <p className="muted">{t("budget.regimesText")}</p>
      <ul className="bu-pairs">
        {s.regimes.map((r, i) => (
          <li key={r.id}>
            <Field label={t("budget.regimeName")} hideLabel value={r.name} placeholder={t("budget.regimeName")} onCommit={(v) => setS({ ...s, regimes: s.regimes.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
            <span className="bu-percent">
              <Field label={t("budget.regimeRate")} hideLabel value={String(r.rate).replace(".", ",")} onCommit={(v) => setS({ ...s, regimes: s.regimes.map((x, j) => (j === i ? { ...x, rate: readNumber(v) } : x)) })} />
            </span>
            <button type="button" className="icon-btn" aria-label={t("common.removeAction")} onClick={() => setS({ ...s, regimes: s.regimes.filter((_x, j) => j !== i) })}>
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn text small" onClick={() => setS({ ...s, regimes: [...s.regimes, { id: `r${Date.now()}`, name: "", rate: 0 }] })}>
        <Plus aria-hidden="true" />
        {t("budget.addRegime")}
      </button>
      <h3 className="bu-dialog-title">{t("budget.exchange")}</h3>
      <p className="muted">{t("budget.exchangeText", { currency: s.currency })}</p>
      <ul className="bu-pairs">
        {s.exchange.map((r, i) => (
          <li key={i}>
            <Field label={t("budget.currency")} hideLabel value={r.currency} placeholder="USD" normalize={(v) => v.trim().toUpperCase().slice(0, 3)} onCommit={(v) => setS({ ...s, exchange: s.exchange.map((x, j) => (j === i ? { ...x, currency: v } : x)) })} />
            <Field label={t("budget.exchangeRate")} hideLabel value={String(r.rate).replace(".", ",")} onCommit={(v) => setS({ ...s, exchange: s.exchange.map((x, j) => (j === i ? { ...x, rate: readNumber(v) } : x)) })} />
            <button type="button" className="icon-btn" aria-label={t("common.removeAction")} onClick={() => setS({ ...s, exchange: s.exchange.filter((_x, j) => j !== i) })}>
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn text small" onClick={() => setS({ ...s, exchange: [...s.exchange, { currency: "", rate: 1 }] })}>
        <Plus aria-hidden="true" />
        {t("budget.addExchange")}
      </button>
    </Dialog>
  );
}

/** How much of a whole is used: a thin gauge, red past the whole. */
function Gauge({ part, whole, label }: { part: number; whole: number; label?: string }) {
  const ratio = whole > 0 ? part / whole : 0;
  return (
    <span className={`bu-gauge${ratio > 1 ? " over" : ""}`} role="img" aria-label={label} title={label}>
      <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </span>
  );
}

const percent = (part: number, whole: number) => (whole > 0 ? numberFormat({ maximumFractionDigits: 0 }).format((part / whole) * 100) : "0");

/**
 * The topsheet, set into the page [BUD-05, BUD-06, BUD-08]. A band says first what the film costs and how much is
 * spent, the overruns follow in one amber line, then the chapters with what each has spent against what it plans.
 */
function Summary({ b, budget, lines, facts }: { b: Budgets; budget: Budget; lines: BudgetRow[]; facts: BudgetFacts }) {
  const { project } = useProject();
  const s = budget.settings;
  const [withId, setWithId] = useStoredState<string>(`oniric.budget.compare.${project.id}`, "");
  const other = b.budgets.find((x) => x.id === withId && x.id !== budget.id) ?? null;
  const sheet = useMemo(() => topsheet(lines, s, facts), [lines, s, facts]);
  const otherSheet = useMemo(() => (other ? topsheet(b.lines.filter((l) => l.budgetId === other.id), other.settings, facts) : null), [other, b.lines, facts]);
  const costs = useMemo(() => rollUp(lines, s, facts), [lines, s, facts]);
  const spent = useMemo(() => spentBy(lines, b.expenses, s), [lines, b.expenses, s]);
  const over = useMemo(() => overruns(lines, costs, spent), [lines, costs, spent]);
  const totalSpent = cents(lines.filter((l) => l.level === "chapter").reduce((n, l) => n + (spent.get(l.id) ?? 0), 0));
  const delta = (a: number, c: number) => {
    const n = cents(a - c);
    if (!n) return <span className="muted">–</span>;
    return <span className={n > 0 ? "bu-delta up" : "bu-delta down"}>{`${n > 0 ? "+" : "−"}${money(Math.abs(n), s.currency)}`}</span>;
  };
  const compared = otherSheet ? compareChapters(otherSheet, sheet) : null;
  const rows = ["social", "overheads", "insurance", "bond", "contingency"] as const;
  const empty = <td />;
  return (
    <div className="view pr-view bu-page">
      <header className="bu-head">
        <div className="bu-figure">
          <span>{t("budget.rows.total")}</span>
          <b>{money(sheet.total, s.currency)}</b>
        </div>
        <div className="bu-figure">
          <span>{t("budget.columns.spent")}</span>
          <b>{money(totalSpent, s.currency)}</b>
          <span className="bu-figure-gauge">
            <Gauge part={totalSpent} whole={sheet.total} />
            <span className="muted">{t("budget.ofBudget", { pct: percent(totalSpent, sheet.total) })}</span>
          </span>
        </div>
        {b.budgets.length > 1 && (
          <span className="bu-head-end">
            <Select value={other?.id ?? ""} aria-label={t("budget.compareWith")} onChange={(e) => setWithId(e.target.value)}>
              <option value="">{t("budget.noCompare")}</option>
              {b.budgets
                .filter((x) => x.id !== budget.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {t("budget.compareTo", { name: x.name })}
                  </option>
                ))}
            </Select>
          </span>
        )}
      </header>
      {over.length > 0 && (
        <p className="bu-overruns" role="status">
          <AlertTriangle aria-hidden="true" />
          <b>{plural("budget.overruns", over.length)}</b>
          <span>
            {over.slice(0, 5).map((o, i) => (
              <span key={o.id}>
                {i > 0 && <span className="bu-sep"> · </span>}
                {o.label || t("budget.untitled")} <span className="bu-over-by">+{money(o.over, s.currency)}</span>
              </span>
            ))}
          </span>
        </p>
      )}
      <div className="bu-sheet">
        <table className="bu-flat bu-topsheet">
          <thead>
            <tr>
              <th>{t("budget.columns.chapter")}</th>
              {other && <th className="num">{other.name}</th>}
              <th className="num">{budget.name}</th>
              {other && <th className="num">{t("budget.columns.delta")}</th>}
              <th className="num">{t("budget.columns.share")}</th>
              <th className="bu-spent-col">{t("budget.columns.spent")}</th>
            </tr>
          </thead>
          <tbody>
            {(compared ?? sheet.chapters.map((c) => ({ origin: c.origin, code: c.code, label: c.label, a: 0, b: c.cost.gross, delta: 0 }))).map((c) => {
              const own = sheet.chapters.find((x) => x.origin === c.origin);
              const used = own ? (spent.get(own.id) ?? 0) : 0;
              return (
                <tr key={c.origin}>
                  <th scope="row">
                    {c.code && <span className="bu-code">{c.code}</span>}
                    {c.label || t("budget.untitled")}
                  </th>
                  {other && <td className="num muted">{money(c.a, other.settings.currency)}</td>}
                  <td className="num">{money(c.b, s.currency)}</td>
                  {other && <td className="num">{delta(c.b, c.a)}</td>}
                  <td className="num muted">{sheet.lines ? `${Math.round((c.b / sheet.lines) * 100)} %` : ""}</td>
                  <td className="bu-spent-col">
                    {used > 0 && (
                      <span className="bu-spent">
                        <span className="num">{money(cents(used), s.currency)}</span>
                        <Gauge part={used} whole={c.b} label={t("budget.spentOfPlanned", { pct: percent(used, c.b) })} />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="bu-subtotal">
              <th scope="row">{t("budget.rows.lines")}</th>
              {otherSheet && <td className="num muted">{money(otherSheet.lines, other!.settings.currency)}</td>}
              <td className="num">{money(sheet.lines, s.currency)}</td>
              {otherSheet && <td className="num">{delta(sheet.lines, otherSheet.lines)}</td>}
              {empty}
              <td className="bu-spent-col">
                {totalSpent > 0 && (
                  <span className="bu-spent">
                    <span className="num">{money(totalSpent, s.currency)}</span>
                    <Gauge part={totalSpent} whole={sheet.lines} label={t("budget.spentOfPlanned", { pct: percent(totalSpent, sheet.lines) })} />
                  </span>
                )}
              </td>
            </tr>
            {rows.map((key) => {
              const v = sheet[key];
              const pct = key === "social" ? null : s[key];
              if (!v && !(otherSheet && otherSheet[key])) return null;
              return (
                <tr key={key}>
                  <th scope="row">
                    {t(`budget.rows.${key}`)}
                    {pct ? <span className="muted"> · {numberFormat({ maximumFractionDigits: 2 }).format(pct)} %</span> : null}
                  </th>
                  {otherSheet && <td className="num muted">{money(otherSheet[key], other!.settings.currency)}</td>}
                  <td className="num">{money(v, s.currency)}</td>
                  {otherSheet && <td className="num">{delta(v, otherSheet[key])}</td>}
                  {empty}
                  {empty}
                </tr>
              );
            })}
            <tr className="bu-subtotal">
              <th scope="row">{t("budget.rows.net")}</th>
              {otherSheet && <td className="num muted">{money(otherSheet.net, other!.settings.currency)}</td>}
              <td className="num">{money(sheet.net, s.currency)}</td>
              {otherSheet && <td className="num">{delta(sheet.net, otherSheet.net)}</td>}
              {empty}
              {empty}
            </tr>
            {sheet.vat > 0 && (
              <tr>
                <th scope="row">{t("budget.rows.vat")}</th>
                {otherSheet && <td className="num muted">{money(otherSheet.vat, other!.settings.currency)}</td>}
                <td className="num">{money(sheet.vat, s.currency)}</td>
                {otherSheet && <td className="num">{delta(sheet.vat, otherSheet.vat)}</td>}
                {empty}
                {empty}
              </tr>
            )}
            <tr className="bu-grand">
              <th scope="row">{t("budget.rows.total")}</th>
              {otherSheet && <td className="num">{money(otherSheet.total, other!.settings.currency)}</td>}
              <td className="num">{money(sheet.total, s.currency)}</td>
              {otherSheet && <td className="num">{delta(sheet.total, otherSheet.total)}</td>}
              {empty}
              {empty}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A file kept with the project: a button to choose it, then its name, which opens it. */
export function Attachment({ path, kind, onChange, label }: { path: string | null; kind: string; onChange: (path: string | null) => void; label: string }) {
  const { project, notify } = useProject();
  const choose = async () => {
    try {
      const f = await open({ title: label, filters: [{ name: t("budget.documents"), extensions: ["pdf", "png", "jpg", "jpeg", "webp", "heic", "doc", "docx", "odt"] }] });
      if (typeof f === "string") onChange(unwrap(await commands.mediaImport(f, kind)));
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  if (!path)
    return (
      <button type="button" className="btn ghost small" onClick={() => void choose()}>
        <Paperclip aria-hidden="true" />
        {label}
      </button>
    );
  const name = path.split(/[\\/]/).pop() ?? path;
  return (
    <span className="bu-file">
      <button type="button" className="btn text small" title={name} onClick={() => void commands.reveal(`${project.dir}\\${path.replace(/\//g, "\\")}`, true).then(unwrap).catch((e) => notify({ text: describeError(e), tone: "error" }))}>
        <Paperclip aria-hidden="true" />
        <span className="bu-file-name">{name}</span>
      </button>
      <button type="button" className="icon-btn" aria-label={t("common.removeAction")} onClick={() => onChange(null)}>
        <X aria-hidden="true" />
      </button>
    </span>
  );
}

/** An amount as one reads it (« 6 300 », « 186,40 »), read back by `readNumber` when it is changed. */
const amountText = (n: number) => (n ? numberFormat({ minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n) : "");

/**
 * Money spent, on a line of the budget, with its receipt [BUD-06]. The list is set into the page under a band that
 * keeps the search, the total and « Nouvelle dépense »; the fields read as text, the receipt and the bin wait for the
 * pointer.
 */
function Expenses({ b, budget, lines }: { b: Budgets; budget: Budget; lines: BudgetRow[] }) {
  const { ask } = useProject();
  const fail = useFail();
  const s = budget.settings;
  const [q, setQ] = useState("");
  const pickable = lines.filter((l) => l.level === "line");
  const chapters = lines.filter((l) => l.level === "chapter");
  const postsOf = (id: string) => lines.filter((l) => l.parentId === id && l.level === "post");
  const lineOf = new Map(pickable.map((l) => [l.origin, l]));
  const shown = b.expenses.filter((e) => !q || fold(`${e.label} ${e.supplier} ${lineOf.get(e.origin ?? "")?.label ?? ""}`).includes(fold(q)));
  const total = b.expenses.reduce((n, e) => n + e.amount * (e.currency && e.currency !== s.currency ? (s.exchange.find((x) => x.currency === e.currency)?.rate ?? 1) : 1), 0);
  const add = () => void addExpense(null, s.currency).catch(fail);
  const remove = async (e: Expense) => {
    if ((!e.label && !e.amount) || (await confirmRemoval(ask, { title: t("budget.deleteExpense", { name: e.label || money(e.amount, e.currency || s.currency) }), text: t("budget.deleteExpenseText") }))) await deleteExpense(e.id).catch(fail);
  };
  return (
    <div className="view pr-view bu-page">
      <header className="bu-head">
        {b.expenses.length > 0 && <SearchBox value={q} onChange={setQ} placeholder={t("budget.searchExpense")} label={t("budget.searchExpense")} />}
        <span className="bu-head-end">
          {b.expenses.length > 0 && (
            <span className="bu-head-total">
              <b>{money(cents(total), s.currency)}</b> <span className="muted">{t("budget.spentWord")}</span>
            </span>
          )}
          <button type="button" className="btn primary" onClick={add}>
            <Plus aria-hidden="true" />
            {t("budget.newExpense")}
          </button>
        </span>
      </header>
      {b.expenses.length === 0 ? (
        <div className="bu-sheet bu-sheet-pad">
          <EmptyState title={t("budget.noExpenseTitle")}>
            <p className="muted">{t("budget.noExpenseText")}</p>
          </EmptyState>
        </div>
      ) : shown.length === 0 ? (
        <div className="bu-sheet bu-sheet-pad">
          <p className="muted pr-none" role="status">
            {t("budget.noMatch")}
          </p>
        </div>
      ) : (
        <div className="bu-sheet">
          <table className="bu-flat pr-quiet bu-table bu-expenses">
            <colgroup>
              <col className="bu-c-date" />
              <col />
              <col className="bu-c-supplier" />
              <col className="bu-c-line" />
              <col className="bu-c-amount" />
              <col className="bu-c-receipt" />
              <col className="bu-c-act" />
            </colgroup>
            <thead>
              <tr>
                <th>{t("budget.columns.date")}</th>
                <th>{t("budget.columns.expense")}</th>
                <th>{t("budget.columns.supplier")}</th>
                <th>{t("budget.columns.line")}</th>
                <th className="num">{t("budget.columns.amount")}</th>
                <th>{t("budget.columns.receipt")}</th>
                <th aria-label={t("budget.columns.actions")} />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="bu-date">
                    <Field label={t("budget.columns.date")} hideLabel type="date" value={e.date ?? ""} onCommit={(v) => void updateExpense(e.id, { date: v || null }).catch(fail)} />
                  </td>
                  <td>
                    <Field label={t("budget.columns.expense")} hideLabel value={e.label} title={e.label} placeholder={t("budget.expensePlaceholder")} onCommit={(v) => void updateExpense(e.id, { label: v }).catch(fail)} />
                  </td>
                  <td>
                    <Field label={t("budget.columns.supplier")} hideLabel value={e.supplier} title={e.supplier} placeholder="–" onCommit={(v) => void updateExpense(e.id, { supplier: v }).catch(fail)} />
                  </td>
                  <td>
                    <Select value={e.origin ?? ""} aria-label={t("budget.columns.line")} onChange={(x) => void updateExpense(e.id, { origin: x.target.value || null }).catch(fail)}>
                      <option value="">{t("budget.noLine")}</option>
                      {chapters.flatMap((c) =>
                        postsOf(c.id).map((p) => {
                          const own = pickable.filter((l) => l.parentId === p.id);
                          return own.length ? (
                            <optgroup key={p.id} label={`${c.label} › ${p.label}`}>
                              {own.map((l) => (
                                <option key={l.id} value={l.origin}>
                                  {l.label || t("budget.untitled")}
                                </option>
                              ))}
                            </optgroup>
                          ) : null;
                        }),
                      )}
                    </Select>
                  </td>
                  <td className="num">
                    <span className="bu-amount">
                      <Field label={t("budget.columns.amount")} hideLabel value={amountText(e.amount)} placeholder="0" onCommit={(v) => void updateExpense(e.id, { amount: readNumber(v) }).catch(fail)} />
                      <Field label={t("budget.currency")} hideLabel className="bu-cur" value={e.currency} normalize={(v) => v.trim().toUpperCase().slice(0, 3)} onCommit={(v) => void updateExpense(e.id, { currency: v }).catch(fail)} />
                    </span>
                  </td>
                  <td className={e.receipt ? undefined : "bu-later"}>
                    <Attachment path={e.receipt} kind="justificatifs" label={t("budget.attachReceipt")} onChange={(p) => void updateExpense(e.id, { receipt: p }).catch(fail)} />
                  </td>
                  <td className="bu-later">
                    <button type="button" className="icon-btn" aria-label={t("budget.deleteExpenseShort")} onClick={() => void remove(e)}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The colour of each state of a source, from asked to paid. */
const fundingTone: Record<FundingStatus, string> = { asked: "warn", granted: "info", paid: "ok" };

/**
 * Where the money comes from, and how much of the budget it covers [BUD-07]. A band reads the cover first: what is
 * found against what the film costs, then one gauge in three shades (paid, granted, asked) over what is missing.
 */
function FundingPage({ b, budget, lines, facts }: { b: Budgets; budget: Budget; lines: BudgetRow[]; facts: BudgetFacts }) {
  const { ask } = useProject();
  const fail = useFail();
  const s = budget.settings;
  const totals = useMemo(() => fundingTotals(b.funding, s), [b.funding, s]);
  const need = useMemo(() => topsheet(lines, s, facts).total, [lines, s, facts]);
  const missing = cents(need - totals.total);
  const scale = Math.max(need, totals.total) || 1;
  const remove = async (f: Funding) => {
    if ((!f.name && !f.amount) || (await confirmRemoval(ask, { title: t("budget.deleteFunding", { name: f.name || t("budget.untitled") }), text: t("budget.deleteFundingText") }))) await deleteFunding(f.id).catch(fail);
  };
  const parts = (["paid", "granted", "asked"] as const).filter((k) => totals[k] > 0);
  return (
    <div className="view pr-view bu-page">
      <header className="bu-head bu-cover-head">
        <div className="bu-cover-text">
          {need > 0 ? (
            <p className="bu-cover">
              {t("budget.coverage", { covered: money(totals.total, s.currency), need: money(need, s.currency) })}
              {missing > 0 && <span className="muted"> · {t("budget.missing", { amount: money(missing, s.currency) })}</span>}
            </p>
          ) : (
            <span />
          )}
          <button type="button" className="btn primary" onClick={() => void addFunding(b, s.currency).catch(fail)}>
            <Plus aria-hidden="true" />
            {t("budget.newFunding")}
          </button>
        </div>
        {need > 0 && totals.total > 0 && (
          <>
            <span className="bu-cover-gauge" role="img" aria-label={t("budget.coverage", { covered: money(totals.total, s.currency), need: money(need, s.currency) })}>
              {parts.map((k) => (
                <i key={k} className={fundingTone[k]} style={{ width: `${(totals[k] / scale) * 100}%` }} />
              ))}
            </span>
            <ul className="bu-legend">
              {parts.map((k) => (
                <li key={k}>
                  <span className={`bu-dot ${fundingTone[k]}`} aria-hidden="true" />
                  {t(`budget.fundingStatuses.${k}`)} <b>{money(totals[k], s.currency)}</b>
                </li>
              ))}
              {missing > 0 && (
                <li>
                  <span className="bu-dot" aria-hidden="true" />
                  {t("budget.missingShort")} <b>{money(missing, s.currency)}</b>
                </li>
              )}
            </ul>
          </>
        )}
      </header>
      {b.funding.length === 0 ? (
        <div className="bu-sheet bu-sheet-pad">
          <EmptyState title={t("budget.noFundingTitle")}>
            <p className="muted">{t("budget.noFundingText")}</p>
          </EmptyState>
        </div>
      ) : (
        <div className="bu-sheet">
          <table className="bu-flat pr-quiet bu-table bu-funding">
            <colgroup>
              <col className="bu-c-source" />
              <col className="bu-c-kind" />
              <col className="bu-c-amount" />
              <col className="bu-c-state" />
              <col />
              <col className="bu-c-act" />
            </colgroup>
            <thead>
              <tr>
                <th>{t("budget.columns.source")}</th>
                <th>{t("budget.columns.fundingKind")}</th>
                <th className="num">{t("budget.columns.amount")}</th>
                <th>{t("budget.columns.status")}</th>
                <th>{t("budget.notes")}</th>
                <th aria-label={t("budget.columns.actions")} />
              </tr>
            </thead>
            <tbody>
              {b.funding.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Field label={t("budget.columns.source")} hideLabel value={f.name} title={f.name} placeholder={t("budget.sourcePlaceholder")} onCommit={(v) => void updateFunding(f.id, { name: v }).catch(fail)} />
                  </td>
                  <td>
                    <Select value={f.kind} aria-label={t("budget.columns.fundingKind")} onChange={(e) => void updateFunding(f.id, { kind: e.target.value }).catch(fail)}>
                      {FUNDING_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`budget.fundingKinds.${k}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="num">
                    <span className="bu-amount">
                      <Field label={t("budget.columns.amount")} hideLabel value={amountText(f.amount)} placeholder="0" onCommit={(v) => void updateFunding(f.id, { amount: readNumber(v) }).catch(fail)} />
                      <Field label={t("budget.currency")} hideLabel className="bu-cur" value={f.currency} normalize={(v) => v.trim().toUpperCase().slice(0, 3)} onCommit={(v) => void updateFunding(f.id, { currency: v }).catch(fail)} />
                    </span>
                  </td>
                  <td>
                    <Select
                      value={f.status}
                      aria-label={t("budget.columns.status")}
                      className="bu-state-select"
                      display={
                        <span className="bu-state">
                          <span className={`bu-dot ${fundingTone[f.status]}`} aria-hidden="true" />
                          {t(`budget.fundingStatuses.${f.status}`)}
                        </span>
                      }
                      onChange={(e) => void updateFunding(f.id, { status: e.target.value as FundingStatus }).catch(fail)}
                    >
                      {FUNDING_STATUSES.map((k) => (
                        <option key={k} value={k}>
                          {t(`budget.fundingStatuses.${k}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <Field label={t("budget.notes")} hideLabel value={f.notes} title={f.notes} placeholder="–" onCommit={(v) => void updateFunding(f.id, { notes: v }).catch(fail)} />
                  </td>
                  <td className="bu-later">
                    <button type="button" className="icon-btn" aria-label={t("budget.deleteFundingShort")} onClick={() => void remove(f)}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
