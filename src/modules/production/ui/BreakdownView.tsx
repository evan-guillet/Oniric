import { Check, ClipboardList, Download, FileSpreadsheet, ListChecks, Palette, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { db, query } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { describeError } from "../../../core/errors";
import { plural, t } from "../../../core/i18n";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { Segmented } from "../../../ui-kit/Segmented";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useProject } from "../../project/ui/projectContext";
import { ScenePicker, useSceneChoice } from "../../realisation/ui/common";
import { loadEntries } from "../../script/bible/application/bible";
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
  writeCategories,
  type Breakdown,
} from "../application/breakdown";
import { byCategory, categoryName, ranges, scenesBy, STANDARD_CATEGORIES, suggest, type Category, type Element, type ReportGroup } from "../domain/breakdown";
import { sceneFacts } from "../domain/sceneFacts";
import { exportBreakdownCsv, exportBreakdownPdf, notifyExported } from "./productionExport";
import { HeaderTabs } from "./parts";

type Tab = "sheets" | "reports";
type ReportBy = "category" | "set" | "character";

/** The breakdown: a sheet per scene, the text marked in the colours of its categories, and the reports [DEP-01 to DEP-07]. */
export function BreakdownView() {
  const [tab, setTab] = useStoredState<Tab>("oniric.breakdown.tab", "sheets");
  const { session, go } = useProject();
  const scenes = useScenes(session);
  const breakdown = useBreakdown();
  const cats = useCategories();
  return (
    <>
      <HeaderTabs
        label={t("breakdown.display")}
        value={tab}
        onChange={setTab}
        options={[
          { id: "sheets", label: t("breakdown.sheets"), icon: ClipboardList },
          { id: "reports", label: t("breakdown.reports"), icon: ListChecks },
        ]}
      />
      {scenes.length === 0 ? (
        <div className="view view-pad">
          <EmptyState title={t("breakdown.emptyTitle")}>
            <p className="muted">{t("breakdown.emptyText")}</p>
            <button type="button" className="btn" onClick={() => go("script")}>
              {t("shotlist.toScript")}
            </button>
          </EmptyState>
        </div>
      ) : breakdown && cats ? (
        tab === "sheets" ? (
          <Sheets scenes={scenes} breakdown={breakdown} cats={cats} />
        ) : (
          <Reports scenes={scenes} breakdown={breakdown} cats={cats} />
        )
      ) : null}
    </>
  );
}

/** Whether the text of a scene changed since its breakdown was checked [DEP-07]. */
export function needsReview(b: Breakdown, s: SceneInfo, has: boolean): boolean {
  const check = b.checks.get(s.id);
  return has && !!check?.checkedText && check.checkedText !== s.text;
}

function Sheets({ scenes, breakdown, cats }: { scenes: SceneInfo[]; breakdown: Breakdown; cats: Category[] }) {
  const { project, session, notify } = useProject();
  const [current, choose] = useSceneChoice(project.id, scenes);
  const entries = useLive(loadEntries, ["bible_entry"]) ?? [];
  const perScene = useMemo(() => elementsByScene(breakdown), [breakdown]);
  const perElement = useMemo(() => scenesByElement(breakdown), [breakdown]);
  const facts = useMemo(() => sceneFacts(scenes.map((s) => s.heading)), [scenes]);
  const [catsOpen, setCatsOpen] = useState(false);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const scene = current ?? scenes[0];
  const have = perScene.get(scene.id) ?? [];
  const check = breakdown.checks.get(scene.id);
  const suggestions = useMemo(() => {
    const [text] = sceneTexts([scene]);
    return suggest(text, entries, have, check?.rejected ?? []);
    // `have` changes with the breakdown.
  }, [scene, entries, breakdown]);
  const catOf = new Map(cats.map((c) => [c.id, c]));
  const shown = cats.filter((c) => !c.hidden);
  const f = facts[scene.index];
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

  const meta = (s: SceneInfo) => {
    const n = perScene.get(s.id)?.length ?? 0;
    if (needsReview(breakdown, s, n > 0)) return <span className="pr-dot warn">{t("breakdown.toReview")}</span>;
    return n ? plural("breakdown.elements", n) : <span className="muted">{t("breakdown.notYet")}</span>;
  };

  return (
    <div className="view pr-view pr-bd">
      <div className="rz-head rz-head-scene here pr-bd-head">
        <ScenePicker projectId={project.id} scenes={scenes} current={scene.id} onSelect={choose} meta={meta}>
          <span className="rz-head-num">{scene.number}</span>
          <span className="rz-head-title">{scene.heading || t("workspace.noHeading")}</span>
        </ScenePicker>
        <span className="rz-head-meta">
          {[f.side && t(`breakdown.side.${f.side}`), f.moment && t(`breakdown.moment.${f.moment}`), t("breakdown.pages", { pages: formatEighths(scene.eighths) })].filter(Boolean).join(" · ")}
        </span>
        <button type="button" className="btn small" onClick={() => setCatsOpen(true)}>
          <Palette aria-hidden="true" />
          {t("breakdown.categoriesTitle")}
        </button>
      </div>
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
                <h2>{t("breakdown.suggestions")}</h2>
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
                  <h2>
                    <span className="pr-cat-dot" aria-hidden="true" />
                    {categoryName(c)}
                  </h2>
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
      {catsOpen && <CategoriesDialog cats={cats} onClose={() => setCatsOpen(false)} />}
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
      <p className="pr-bd-hint muted">{t("breakdown.markHint")}</p>
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

/** The categories of the project: their names, colours, the ones not used hidden, and the project's own [DEP-02]. */
function CategoriesDialog({ cats, onClose }: { cats: Category[]; onClose: () => void }) {
  const { notify, ask } = useProject();
  const [list, setList] = useState(cats);
  const [name, setName] = useState("");
  const set = (id: string, p: Partial<Category>) => setList(list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const save = async () => {
    try {
      await writeCategories(list);
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={t("breakdown.categoriesTitle")}
      wide
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: t("common.save"), primary: true, onClick: () => void save() },
      ]}
    >
      <p className="muted">{t("breakdown.categoriesHelp")}</p>
      <ul className="pr-cat-edit">
        {list.map((c) => {
          const standard = STANDARD_CATEGORIES.find((s) => s.id === c.id);
          return (
            <li key={c.id} className={c.hidden ? "off" : ""}>
              <input type="color" value={c.color} aria-label={t("breakdown.colorOf", { name: categoryName(c) })} onChange={(e) => set(c.id, { color: e.target.value })} />
              <input
                type="text"
                value={c.name}
                placeholder={standard ? t(`breakdown.categories.${c.id}`) : ""}
                aria-label={t("breakdown.nameOf", { name: categoryName(c) })}
                onChange={(e) => set(c.id, { name: e.target.value })}
              />
              <label className="choice">
                <input type="checkbox" className="switch" checked={!c.hidden} onChange={(e) => set(c.id, { hidden: !e.target.checked })} />
                <span className="visually-hidden">{t("breakdown.shown", { name: categoryName(c) })}</span>
              </label>
              {standard ? (
                <button
                  type="button"
                  className="btn tiny ghost"
                  title={t("breakdown.resetCategory")}
                  aria-label={t("breakdown.resetCategory")}
                  disabled={c.name === "" && c.color === standard.color && !c.hidden}
                  onClick={() => set(c.id, { name: "", color: standard.color, hidden: false })}
                >
                  <RotateCcw aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn tiny ghost"
                  title={t("breakdown.deleteCategory")}
                  aria-label={t("breakdown.deleteCategory")}
                  onClick={async () => {
                    if (await confirmRemoval(ask, { title: t("breakdown.deleteCategoryTitle", { name: categoryName(c) }), text: t("breakdown.deleteCategoryText") }))
                      setList(list.filter((x) => x.id !== c.id));
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="input-row">
        <input type="text" value={name} placeholder={t("breakdown.newCategory")} aria-label={t("breakdown.newCategory")} onChange={(e) => setName(e.target.value)} />
        <button
          type="button"
          className="btn"
          disabled={!name.trim()}
          onClick={() => {
            setList([...list, { id: `own-${Date.now().toString(36)}`, name: name.trim(), color: "#6a7a8c" }]);
            setName("");
          }}
        >
          <Plus aria-hidden="true" />
          {t("common.add")}
        </button>
      </div>
    </Dialog>
  );
}

/** The lists the production reads: elements by category, scenes by set and by character [DEP-06]. */
function Reports({ scenes, breakdown, cats }: { scenes: SceneInfo[]; breakdown: Breakdown; cats: Category[] }) {
  const api = useProject();
  const [by, setBy] = useStoredState<ReportBy>("oniric.breakdown.report", "category");
  const groups = useMemo(() => reportGroups(by, scenes, breakdown, cats), [by, scenes, breakdown, cats]);
  const label = new Map(scenes.map((s) => [s.id, s]));
  const fail = (e: unknown) => api.notify({ text: describeError(e), tone: "error" });
  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div className="pr-toolbar">
          <Segmented
            label={t("breakdown.reportBy")}
            value={by}
            onChange={setBy}
            options={[
              { id: "category", label: t("breakdown.byCategory") },
              { id: "set", label: t("breakdown.bySet") },
              { id: "character", label: t("breakdown.byCharacter") },
            ]}
          />
          <span className="spacer" />
          {groups.length > 0 && (
            <>
              <button type="button" className="btn" title={t("transfer.breakdownCsvHelp")} onClick={() => void exportBreakdownCsv(api, by).then((p) => notifyExported(api, p)).catch(fail)}>
                <FileSpreadsheet aria-hidden="true" />
                {t("breakdown.exportCsv")}
              </button>
              <button type="button" className="btn primary" onClick={() => void exportBreakdownPdf(api, by).catch(fail)}>
                <Download aria-hidden="true" />
                {t("breakdown.exportPdf")}
              </button>
            </>
          )}
        </div>
        {groups.length === 0 ? (
          <EmptyState title={t("breakdown.reportEmptyTitle")}>
            <p className="muted">{t("breakdown.reportEmptyText")}</p>
          </EmptyState>
        ) : (
          groups.map((g) => (
            <section key={g.title} className="pr-group">
              <h2 className="pr-group-head">
                {g.color && <span className="pr-cat-dot" style={{ background: g.color }} aria-hidden="true" />}
                {g.title}
                <span className="pr-count">{g.lines.length}</span>
              </h2>
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
            </section>
          ))
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
