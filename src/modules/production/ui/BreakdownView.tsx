import { Check, ChevronRight, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { db, query } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { describeError } from "../../../core/errors";
import { plural, t } from "../../../core/i18n";
import { EmptyState } from "../../../ui-kit/Form";
import { SearchBox } from "../../../ui-kit/SearchBox";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { PAGE_KEY, useProject } from "../../project/ui/projectContext";
import { useSceneChoice } from "../../realisation/ui/common";
import { loadEntries } from "../../script/bible/application/bible";
import { fold } from "../../script/bible/domain/types";
import { sceneTexts } from "../../script/bible/application/sceneTexts";
import { useScenes, type SceneInfo } from "../../script/screenplay/application/scriptSession";
import { diffLines } from "../../script/screenplay/domain/diff";
import { formatEighths } from "../../script/screenplay/domain/duration";
import { updateSceneMeta } from "../../script/views/application/story";
import {
  acceptSuggestions,
  addToScene,
  elementsByScene,
  markChecked,
  rejectSuggestions,
  removeFromScene,
  scenesByElement,
  setQuantity,
  useBreakdown,
  useCategories,
  type Breakdown,
} from "../application/breakdown";
import { byCategory, categoryName, ranges, scenesBy, suggest, type Category, type Element, type ReportGroup } from "../domain/breakdown";
import { sceneFacts } from "../domain/sceneFacts";

type Tab = "sheets" | "reports";
type ReportBy = "category" | "set" | "character";

/** The breakdown: a sheet per scene, the text marked in the colours of its categories, and the reports [DEP-01 to DEP-07]. */
export function BreakdownView() {
  const [tab] = useStoredState<Tab>(PAGE_KEY.breakdown, "sheets");
  const { session, go } = useProject();
  const scenes = useScenes(session);
  const breakdown = useBreakdown();
  const cats = useCategories();
  if (scenes.length === 0) {
    return (
      <div className="view view-pad">
        <EmptyState title={t("breakdown.emptyTitle")}>
          <p className="muted">{t("breakdown.emptyText")}</p>
          <button type="button" className="btn" onClick={() => go("script")}>
            {t("shotlist.toScript")}
          </button>
        </EmptyState>
      </div>
    );
  }
  if (!breakdown || !cats) return null;
  return tab === "sheets" ? <Sheets scenes={scenes} breakdown={breakdown} cats={cats} /> : <Reports scenes={scenes} breakdown={breakdown} cats={cats} />;
}

/** Whether the text of a scene changed since its breakdown was checked [DEP-07]. */
export function needsReview(b: Breakdown, s: SceneInfo, has: boolean): boolean {
  const check = b.checks.get(s.id);
  return has && !!check?.checkedText && check.checkedText !== s.text;
}

/** The scenes one under the other: a click unfolds the sheet of one and folds the one that was open. */
function Sheets({ scenes, breakdown, cats }: { scenes: SceneInfo[]; breakdown: Breakdown; cats: Category[] }) {
  const { project } = useProject();
  const [current, choose] = useSceneChoice(project.id, scenes);
  const [open, setOpen] = useState<string | null>(current?.id ?? null);
  const perScene = useMemo(() => elementsByScene(breakdown), [breakdown]);
  const perElement = useMemo(() => scenesByElement(breakdown), [breakdown]);
  const facts = useMemo(() => sceneFacts(scenes.map((s) => s.heading)), [scenes]);
  const list = useRef<HTMLDivElement>(null);
  // The scene above folding would carry this one away: it comes to the top of the page.
  useLayoutEffect(() => {
    if (open) list.current?.querySelector(`[data-scene="${CSS.escape(open)}"]`)?.scrollIntoView({ block: "start" });
  }, [open]);
  const state = (s: SceneInfo) => {
    const n = perScene.get(s.id)?.length ?? 0;
    if (needsReview(breakdown, s, n > 0)) return <span className="pr-dot warn">{t("breakdown.toReview")}</span>;
    return n ? plural("breakdown.elements", n) : <span className="muted">{t("breakdown.notYet")}</span>;
  };
  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div ref={list} className="pr-bd-list">
          {scenes.map((s) => {
            const unfolded = s.id === open;
            const f = facts[s.index];
            return (
              <section key={s.id} className="pr-bd-scene" data-scene={s.id} aria-label={s.heading || t("workspace.noHeading")}>
                <h2>
                  <button
                    type="button"
                    className="pr-bd-row"
                    aria-expanded={unfolded}
                    onClick={() => {
                      if (!unfolded) choose(s.id);
                      setOpen(unfolded ? null : s.id);
                    }}
                  >
                    <ChevronRight className="pr-bd-caret" aria-hidden="true" />
                    <span className="pr-bd-num">{s.number}</span>
                    <span className="pr-bd-heading">{s.heading || t("workspace.noHeading")}</span>
                    <span className="pr-bd-facts">
                      {[f.side && t(`breakdown.side.${f.side}`), f.moment && t(`breakdown.moment.${f.moment}`), t("breakdown.pages", { pages: formatEighths(s.eighths) })].filter(Boolean).join(" · ")}
                    </span>
                    <span className="pr-bd-state">{state(s)}</span>
                  </button>
                </h2>
                {unfolded && <SceneSheet scene={s} breakdown={breakdown} cats={cats} have={perScene.get(s.id) ?? []} perElement={perElement} />}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

/** The sheet of the scene unfolded: its text, marked, on the left; what the scene needs on the right. */
function SceneSheet({ scene, breakdown, cats, have, perElement }: { scene: SceneInfo; breakdown: Breakdown; cats: Category[]; have: Element[]; perElement: Map<string, string[]> }) {
  const { session, notify } = useProject();
  const entries = useLive(loadEntries, ["bible_entry"]) ?? [];
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const check = breakdown.checks.get(scene.id);
  const suggestions = useMemo(() => {
    const [text] = sceneTexts([scene]);
    return suggest(text, entries, have, check?.rejected ?? []);
    // `have` changes with the breakdown.
  }, [scene, entries, breakdown]);
  const catOf = new Map(cats.map((c) => [c.id, c]));
  const shown = cats.filter((c) => !c.hidden);
  const review = needsReview(breakdown, scene, have.length > 0);
  const qty = new Map(breakdown.items.filter((i) => i.sceneId === scene.id).map((i) => [i.elementId, i.quantity]));

  const add = async (category: string, name: string) => {
    try {
      await session.flush();
      await addToScene(breakdown, scene.id, [{ category, name }], scene.text);
    } catch (e) {
      fail(e);
    }
  };
  const accept = async (list: typeof suggestions) => {
    try {
      await session.flush();
      await acceptSuggestions(breakdown, scene.id, list, scene.text);
    } catch (e) {
      fail(e);
    }
  };
  const reject = async (keys: string[]) => {
    try {
      await session.flush();
      await rejectSuggestions(scene.id, check, keys);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="pr-bd-body">
      <SceneText scene={scene} elements={have} cats={catOf} onAdd={add} />
      <aside className="pr-bd-sheet" aria-label={t("breakdown.sheetOf", { n: scene.number })}>
        <label className="pr-field">
          <span>{t("breakdown.summary")}</span>
          <SummaryField scene={scene} />
        </label>
        {review && <Review scene={scene} checked={check!.checkedText!} onDone={() => void markChecked(scene.id, scene.text).catch(fail)} />}
        {suggestions.length > 0 && (
          <section className="pr-suggest" aria-label={t("breakdown.suggestions")}>
            <header>
              <Sparkles aria-hidden="true" />
              <h3>{t("breakdown.suggestions")}</h3>
              <span className="spacer" />
              <button type="button" className="btn tiny" onClick={() => void accept(suggestions)}>
                {t("breakdown.acceptAll")}
              </button>
              <button type="button" className="btn tiny ghost" onClick={() => void reject(suggestions.map((s) => s.key))}>
                {t("breakdown.rejectAll")}
              </button>
            </header>
            <ul>
              {suggestions.map((s) => {
                const c = catOf.get(s.category);
                return (
                  <li key={s.key}>
                    <span className="pr-cat-dot" style={{ background: c?.color }} aria-hidden="true" />
                    <span className="pr-suggest-name">{s.name}</span>
                    <span className="muted">{c ? categoryName(c) : s.category}</span>
                    <button type="button" className="btn tiny ghost" title={t("breakdown.accept")} aria-label={t("breakdown.acceptOne", { name: s.name })} onClick={() => void accept([s])}>
                      <Check aria-hidden="true" />
                    </button>
                    <button type="button" className="btn tiny ghost" title={t("breakdown.reject")} aria-label={t("breakdown.rejectOne", { name: s.name })} onClick={() => void reject([s.key])}>
                      <X aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div className="pr-bd-cats">
          {shown
            .filter((c) => have.some((e) => e.category === c.id))
            .map((c) => (
              <section key={c.id} className="pr-bd-cat" style={{ "--cat": c.color } as React.CSSProperties}>
                <h3>
                  <span className="pr-cat-dot" aria-hidden="true" />
                  {categoryName(c)}
                </h3>
                <ul className="pr-bd-items">
                  {have
                    .filter((e) => e.category === c.id)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((e) => (
                      <li key={e.id} className="pr-bd-item">
                        <span title={e.entryId ? t("breakdown.fromBible") : undefined}>{e.name}</span>
                        {(c.id === "extras" || c.id === "bits") && (
                          <input
                            type="number"
                            min={1}
                            className="pr-qty"
                            aria-label={t("breakdown.quantityOf", { name: e.name })}
                            placeholder="×"
                            defaultValue={qty.get(e.id) ?? ""}
                            onBlur={(ev) => {
                              const v = ev.target.value ? Math.max(1, Math.round(Number(ev.target.value))) : null;
                              if (v !== (qty.get(e.id) ?? null)) void setQuantity(scene.id, e.id, v).catch(fail);
                            }}
                          />
                        )}
                        <button
                          type="button"
                          className="pr-x"
                          aria-label={t("breakdown.removeOne", { name: e.name })}
                          title={t("breakdown.remove")}
                          onClick={() => void removeFromScene(scene.id, e.id, (perElement.get(e.id) ?? []).length <= 1).catch(fail)}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          {have.length === 0 && <p className="muted small">{t("breakdown.sheetEmpty")}</p>}
        </div>
        <AddElement cats={shown} elements={breakdown.elements} onAdd={add} />
      </aside>
    </div>
  );
}

/** The summary of the scene, the same as in the Structure's card. */
function SummaryField({ scene }: { scene: SceneInfo }) {
  const { session, notify } = useProject();
  const summary = useLive(async () => (await query(db.selectFrom("scene").select("summary").where("id", "=", scene.id)))[0]?.summary ?? "", ["scene"], [scene.id]) ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <textarea
      rows={2}
      value={draft ?? summary}
      placeholder={t("breakdown.summaryPlaceholder")}
      onFocus={() => setDraft(summary)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        const v = draft;
        setDraft(null);
        if (v === null || v === summary) return;
        try {
          await session.flush();
          await updateSceneMeta(scene.id, { summary: v });
        } catch (e) {
          notify({ text: describeError(e), tone: "error" });
        }
      }}
    />
  );
}

/** What changed in the text since the breakdown was checked, and the button that checks it again [DEP-07]. */
function Review({ scene, checked, onDone }: { scene: SceneInfo; checked: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => diffLines(checked, scene.text).filter((l) => l.kind !== "same"), [checked, scene.text]);
  return (
    <section className="pr-review" role="status">
      <p>
        <strong>{t("breakdown.changedTitle")}</strong> {t("breakdown.changedText")}
      </p>
      <div className="pr-review-actions">
        <button type="button" className="btn tiny ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t("breakdown.hideChanges") : plural("breakdown.showChanges", lines.length)}
        </button>
        <span className="spacer" />
        <button type="button" className="btn tiny" onClick={onDone}>
          <Check aria-hidden="true" />
          {t("breakdown.reviewed")}
        </button>
      </div>
      {open && (
        <ul className="pr-review-lines">
          {lines.map((l, i) => (
            <li key={i}>
              {l.left && <del>{l.left.parts.map((p) => p.text).join("")}</del>}
              {l.right && <ins>{l.right.parts.map((p) => p.text).join("")}</ins>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A name typed in a category, among the elements the project already has there. */
function AddElement({ cats, elements, onAdd }: { cats: Category[]; elements: Element[]; onAdd: (category: string, name: string) => void }) {
  const [category, setCategory] = useStoredState("oniric.breakdown.addCategory", "props");
  const [name, setName] = useState("");
  const cat = cats.find((c) => c.id === category) ?? cats[0];
  const listId = "pr-bd-known";
  const add = () => {
    if (!name.trim() || !cat) return;
    onAdd(cat.id, name);
    setName("");
  };
  if (!cat) return null;
  return (
    <div className="pr-bd-add">
      <Select value={cat.id} aria-label={t("breakdown.category")} onChange={(e) => setCategory(e.target.value)} display={<CatLabel c={cat} />}>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            {categoryName(c)}
          </option>
        ))}
      </Select>
      <input
        type="text"
        value={name}
        list={listId}
        placeholder={t("breakdown.addPlaceholder")}
        aria-label={t("breakdown.addLabel", { category: categoryName(cat) })}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      <datalist id={listId}>
        {elements
          .filter((e) => e.category === cat.id)
          .map((e) => (
            <option key={e.id} value={e.name} />
          ))}
      </datalist>
      <button type="button" className="btn" disabled={!name.trim()} onClick={add}>
        <Plus aria-hidden="true" />
        {t("common.add")}
      </button>
    </div>
  );
}

function CatLabel({ c }: { c: Category }) {
  return (
    <span className="pr-cat-label">
      <span className="pr-cat-dot" style={{ background: c.color }} aria-hidden="true" />
      {categoryName(c)}
    </span>
  );
}

/**
 * The text of the scene as the screenplay lays it out, its elements highlighted in the colour of their category;
 * a selection opens the categories to add it to [DEP-03].
 */
function SceneText({ scene, elements, cats, onAdd }: { scene: SceneInfo; elements: Element[]; cats: Map<string, Category>; onAdd: (category: string, name: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState<{ text: string; top: number; left: number } | null>(null);
  const names = elements.filter((e) => !cats.get(e.category)?.hidden).map((e) => ({ name: e.name, category: e.category }));
  const blocks: { type: string; text: string }[] = [];
  scene.node.forEach((b) => blocks.push({ type: b.type.name, text: b.textContent }));
  const offerSelection = () => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!sel || !text || text.length > 80 || !box.current?.contains(sel.anchorNode)) return setPicking(null);
    const r = sel.getRangeAt(0).getBoundingClientRect();
    setPicking({ text, top: r.bottom + 6, left: r.left });
  };
  const paint = (text: string) => {
    const found = ranges(text, names);
    if (!found.length) return text;
    const out: ReactNode[] = [];
    let at = 0;
    for (const r of found) {
      if (r.from > at) out.push(text.slice(at, r.from));
      const c = cats.get(r.category);
      out.push(
        <mark key={r.from} className="pr-mark" style={{ "--cat": c?.color } as React.CSSProperties} title={c ? categoryName(c) : undefined}>
          {text.slice(r.from, r.to)}
        </mark>,
      );
      at = r.to;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  };
  return (
    <article className="pr-bd-text" aria-label={t("breakdown.textOf", { n: scene.number })}>
      <div ref={box} className="pr-script" onMouseUp={offerSelection} onKeyUp={(e) => e.shiftKey && offerSelection()}>
        {blocks.map((b, i) => (
          <p key={i} className={`pr-el el-${b.type}`}>
            {b.text ? paint(b.text) : " "}
          </p>
        ))}
      </div>
      {picking && (
        <CategoryPicker
          at={picking}
          cats={[...cats.values()].filter((c) => !c.hidden)}
          title={t("breakdown.addAs", { text: picking.text })}
          onPick={(c) => {
            onAdd(c, picking.text);
            setPicking(null);
            window.getSelection()?.removeAllRanges();
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </article>
  );
}

/** The categories in a small floating list, each in its colour, to file the text selected. */
function CategoryPicker({
  at,
  cats,
  title,
  onPick,
  onClose,
}: {
  at: { top: number; left: number };
  cats: Category[];
  title: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ top: at.top, left: at.left, visibility: "hidden" });
  useLayoutEffect(() => {
    const m = menu.current;
    if (!m) return;
    const h = m.offsetHeight;
    const w = m.offsetWidth;
    setStyle({
      top: at.top + h > window.innerHeight - 8 ? Math.max(8, at.top - h - 30) : at.top,
      left: Math.max(8, Math.min(at.left, window.innerWidth - w - 8)),
    });
  }, [at.top, at.left]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const all = [...(menu.current?.querySelectorAll("button") ?? [])];
        const i = all.indexOf(document.activeElement as HTMLButtonElement);
        all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  return createPortal(
    <div ref={menu} className="pr-cat-menu" style={style} role="menu" aria-label={title}>
      <p className="pr-cat-menu-title">{title}</p>
      <div className="pr-cat-menu-grid">
        {cats.map((c) => (
          <button key={c.id} type="button" role="menuitem" onClick={() => onPick(c.id)}>
            <span className="pr-cat-dot" style={{ background: c.color }} aria-hidden="true" />
            {categoryName(c)}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The lists the production reads [DEP-06], one under the other as the sheets are: a click unfolds one and folds the one
 * that was open. By category a row holds its elements and their scenes; by set or by character, its scenes.
 * A search keeps what it finds; by category the rows found are unfolded, to show the elements found.
 */
function Reports({ scenes, breakdown, cats }: { scenes: SceneInfo[]; breakdown: Breakdown; cats: Category[] }) {
  const api = useProject();
  const [by, setBy] = useStoredState<ReportBy>("oniric.breakdown.report", "category");
  const [open, setOpen] = useStoredState<string>(`oniric.breakdown.reportOpen.${by}`, "");
  const groups = useMemo(() => reportGroups(by, scenes, breakdown, cats), [by, scenes, breakdown, cats]);
  const all: ReportGroup[] = by === "category" ? groups : (groups[0]?.lines ?? []).map((l) => ({ title: l.name, lines: [l] }));
  const [query, setQuery] = useState("");
  // The rows found and folded by hand: the next search starts over.
  const [shut, setShut] = useState<ReadonlySet<string>>(new Set());
  const needle = fold(query.trim());
  const rows = needle
    ? all.flatMap((g) => {
        if (fold(g.title).includes(needle)) return [g];
        const lines = g.lines.filter((l) => fold(l.name).includes(needle));
        return lines.length ? [{ ...g, lines }] : [];
      })
    : all;
  const allOpen = !!needle && by === "category";
  const label = new Map(scenes.map((s) => [s.id, s]));
  const list = useRef<HTMLDivElement>(null);
  // The row above folding would carry the one clicked away: it comes to the top of the page. Coming back, the page stays at its top.
  const clicked = useRef(false);
  useLayoutEffect(() => {
    if (open && clicked.current) list.current?.querySelector(`[data-row="${CSS.escape(open)}"]`)?.scrollIntoView({ block: "start" });
    clicked.current = false;
  }, [open]);
  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div className="bible-toolbar pr-report-by">
          {all.length > 0 && (
            <SearchBox
              value={query}
              onChange={(v) => {
                setQuery(v);
                setShut(new Set());
              }}
              placeholder={t("breakdown.searchReport")}
              label={t("breakdown.searchReport")}
            />
          )}
          <Select value={by} aria-label={t("breakdown.reportBy")} onChange={(e) => setBy(e.target.value as ReportBy)}>
            <option value="category">{t("breakdown.byCategory")}</option>
            <option value="set">{t("breakdown.bySet")}</option>
            <option value="character">{t("breakdown.byCharacter")}</option>
          </Select>
        </div>
        {all.length === 0 ? (
          <EmptyState title={t("breakdown.reportEmptyTitle")}>
            <p className="muted">{t("breakdown.reportEmptyText")}</p>
          </EmptyState>
        ) : rows.length === 0 ? (
          <p className="muted pr-none" role="status">
            {t("breakdown.reportNoMatch")}
          </p>
        ) : (
          <div ref={list} className="pr-bd-list">
            {rows.map((g) => {
              const unfolded = allOpen ? !shut.has(g.title) : g.title === open;
              return (
                <section key={g.title} className="pr-bd-scene" data-row={g.title} aria-label={g.title}>
                  <h2>
                    <button
                      type="button"
                      className="pr-bd-row pr-report-row"
                      aria-expanded={unfolded}
                      onClick={() => {
                        if (allOpen) {
                          const next = new Set(shut);
                          if (unfolded) next.add(g.title);
                          else next.delete(g.title);
                          setShut(next);
                          return;
                        }
                        clicked.current = !unfolded;
                        setOpen(unfolded ? "" : g.title);
                      }}
                    >
                      <ChevronRight className="pr-bd-caret" aria-hidden="true" />
                      <span className="pr-report-title">
                        {g.color && <span className="pr-cat-dot" style={{ background: g.color }} aria-hidden="true" />}
                        <span className="pr-bd-heading">{g.title}</span>
                      </span>
                      <span className="pr-bd-state">{by === "category" ? plural("breakdown.elements", g.lines.length) : plural("sceneList.count", g.lines[0].scenes.length)}</span>
                    </button>
                  </h2>
                  {unfolded &&
                    (by === "category" ? (
                      <table className="pr-table pr-report">
                        <tbody>
                          {g.lines.map((l) => (
                            <tr key={l.name}>
                              <th scope="row">{l.name}</th>
                              <td className="num muted">{plural("sceneList.count", l.scenes.length)}</td>
                              <td>
                                <span className="pr-scene-nums">
                                  {l.scenes.map((id) => {
                                    const s = label.get(id);
                                    return s ? (
                                      <button key={id} type="button" className="pr-scene-num" title={s.heading} onClick={() => api.openScene(id)}>
                                        {s.number}
                                      </button>
                                    ) : null;
                                  })}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <ul className="pr-report-scenes">
                        {g.lines[0].scenes.map((id) => {
                          const s = label.get(id);
                          return s ? (
                            <li key={id}>
                              <button type="button" className="pr-report-scene" onClick={() => api.openScene(id)}>
                                <span className="pr-bd-num">{s.number}</span>
                                <span className="pr-report-slug">{s.heading || t("workspace.noHeading")}</span>
                                <span className="pr-bd-facts">{t("breakdown.pages", { pages: formatEighths(s.eighths) })}</span>
                              </button>
                            </li>
                          ) : null;
                        })}
                      </ul>
                    ))}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

/** The groups of a report, the scenes of each line in screenplay order. */
export function reportGroups(by: ReportBy, scenes: SceneInfo[], b: Breakdown, cats: Category[]): ReportGroup[] {
  const order = new Map(scenes.map((s, i) => [s.id, i]));
  const sorted = (ids: string[]) => ids.filter((id) => order.has(id)).sort((x, y) => order.get(x)! - order.get(y)!);
  if (by === "category") {
    const per = scenesByElement(b);
    return byCategory(cats, b.elements, (id) => sorted(per.get(id) ?? []));
  }
  const facts = sceneFacts(scenes.map((s) => s.heading));
  const lines = scenesBy(scenes.map((s, i) => ({ id: s.id, keys: by === "set" ? [facts[i].place] : s.characters }))).map((l) => ({ ...l, scenes: sorted(l.scenes) }));
  return lines.length ? [{ title: by === "set" ? t("breakdown.bySet") : t("breakdown.byCharacter"), lines }] : [];
}
