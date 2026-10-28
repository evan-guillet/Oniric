import { ArrowDownToLine, ArrowLeftRight, ArrowRight, ArrowUpToLine, Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, GitCompareArrows, Info, ListFilter, Lock, PenLine, Scissors, Trash2, Undo2, UnfoldVertical, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { FloatingMenu, MoreMenu } from "../../../../ui-kit/MoreMenu";
import { Segmented, type SegmentedOption } from "../../../../ui-kit/Segmented";
import { useProject } from "../../../project/ui/projectContext";
import { diffLines, diffScenes, foldLines, lineStats, type DiffLine, type LineSide, type SceneDiff } from "../domain/diff";
import { formatById } from "../domain/formats";
import { useScriptFormat } from "../application/formatSettings";
import {
  cutScenes,
  currentVersion,
  deleteVersionRow,
  freezeVersion,
  listVersions,
  purgeScene,
  readVersion,
  reinstate,
  versionScenes,
  type CutScene,
  type VersionFile,
  type VersionRow,
} from "../application/versions";
import { readTitlePage } from "../application/titlePageSettings";

import { Select } from "../../../../ui-kit/Select";
import { dateFormat as dates, plural, t } from "../../../../core/i18n";
const dateFormat = { format: (d: Date) => dates({ dateStyle: "medium", timeStyle: "short" }).format(d) };
const shortFormat = { format: (d: Date) => dates({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d) };
/** A date short enough for one line: the year only when it is not this one. */
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? shortFormat.format(d) : dateFormat.format(d);
};
const CURRENT = "__current__";

type Kind = SceneDiff["kind"];

/** One scene of a comparison, with its lines facing each other. */
interface ComparedScene {
  key: string;
  diff: SceneDiff;
  /** Place of the scene in the compared version, or in the reference one when it was removed. */
  number: number;
  lines: DiffLine[];
  added: number;
  removed: number;
}

interface Comparison {
  base: VersionFile;
  head: VersionFile;
  scenes: ComparedScene[];
}

function compareVersions(base: VersionFile, head: VersionFile): Comparison {
  const left = versionScenes(base);
  const right = versionScenes(head);
  const leftAt = new Map(left.map((s, i) => [s.id, i + 1]));
  const rightAt = new Map(right.map((s, i) => [s.id, i + 1]));
  const scenes = diffScenes(left, right).map((d, i) => {
    const lines = diffLines(d.left?.text ?? "", d.right?.text ?? "");
    const number = d.right ? (rightAt.get(d.right.id) ?? 0) : (leftAt.get(d.left!.id) ?? 0);
    return { key: `${(d.right ?? d.left)!.id}-${i}`, diff: d, number, lines, ...lineStats(lines) };
  });
  return { base, head, scenes };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");

/** What became of a scene: one scene, or the name of the filter over several. */
const kindOne = (k: Kind) => t(`versions.kind.${k}`);
const kindMany = (k: Kind) => t(`versions.kinds.${k}`);
const KINDS: Exclude<Kind, "same">[] = ["changed", "added", "removed", "moved"];

type Tab = "changes" | "versions" | "cuts";
const TABS: Tab[] = ["changes", "versions", "cuts"];
const TAB_KEY = "oniric.versions.tab";

/**
 * Frozen versions, their comparison and the cut scenes [REE-01, REE-02, REE-06], one at a time behind three
 * tabs in the header: what changed between two versions, the versions themselves, and the scenes cut from the screenplay.
 */
export function VersionsView() {
  const { session, project, notify, prompt, ask, headerActions } = useProject();
  const loaded = useLive(listVersions, ["script_version"]);
  const versions = loaded ?? [];
  const cuts = useLive(cutScenes, ["scene"]) ?? [];
  const format = useScriptFormat();
  const [tab, setTab] = useState<Tab>(() => stored(TAB_KEY, "changes", TABS));
  const [base, setBase] = useState("");
  const [head, setHead] = useState(CURRENT);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [now, setNow] = useState<VersionFile | null>(null);

  // The reference follows the latest frozen version, so that freezing leaves nothing to compare.
  const latest = versions[0]?.file ?? "";
  useEffect(() => setBase(latest), [latest]);
  useEffect(() => {
    if (head !== CURRENT && !versions.some((v) => v.file === head)) setHead(CURRENT);
  }, [versions, head]);

  const load = async (file: string) =>
    file === CURRENT ? currentVersion(session, project.title, format ?? formatById(null), await readTitlePage()) : readVersion(file);

  useEffect(() => {
    if (!base || base === head) {
      setCmp(null);
      return;
    }
    let live = true;
    setCmp(null);
    Promise.all([load(base), load(head)])
      .then(([a, b]) => live && setCmp(compareVersions(a, b)))
      .catch((e) => live && notify({ text: describeError(e), tone: "error" }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, head, format]);

  // The current version's size, measured again each time its tab opens.
  useEffect(() => {
    if (tab !== "versions") return;
    let live = true;
    load(CURRENT)
      .then((v) => live && setNow(v))
      .catch(() => live && setNow(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, format, loaded]);

  const open = (next: Tab) => {
    store(TAB_KEY, next);
    setTab(next);
  };

  const freeze = async () => {
    const name = await prompt(t("versions.freeze"), t("versions.name"), `V${versions.length + 1}`);
    if (!name) return;
    try {
      await session.flush();
      const v = await freezeVersion(await currentVersion(session, project.title, format ?? formatById(null), await readTitlePage(), name));
      notify({ text: t("versions.frozen", { name: v.name }) });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const restore = async (v: VersionRow) => {
    const c = await ask({
      title: t("versions.restoreAsk", { name: v.name }),
      text: <p>{t("versions.restoreText")}</p>,
      cancel: t("common.cancel"),
      choices: [{ label: t("versions.restore"), value: "y", primary: true }],
    });
    if (c !== "y") return;
    try {
      const file = await readVersion(v.file);
      session.editor?.restoreScenes(file.scenes.map((s) => ({ id: s.id, content: s.content })));
      await session.flush();
      notify({ text: t("versions.restored", { name: v.name }) });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const remove = async (v: VersionRow) => {
    const c = await ask({
      title: t("versions.removeAsk", { name: v.name }),
      text: <p>{t("versions.removeText")}</p>,
      cancel: t("common.cancel"),
      choices: [{ label: t("script.info.remove"), value: "y", danger: true }],
    });
    if (c === "y") await deleteVersionRow(v.id);
  };

  const reinstateCut = (c: CutScene) =>
    void reinstate(session, c)
      .then(() => notify({ text: t("versions.reinstated", { heading: c.heading || t("versions.noHeadingBare") }) }))
      .catch((e) => notify({ text: describeError(e), tone: "error" }));
  const purgeCut = async (c: CutScene) => {
    const x = await ask({
      title: t("versions.purgeAsk"),
      text: <p>{t("versions.purgeText", { heading: c.heading || t("versions.noHeadingBare") })}</p>,
      cancel: t("common.cancel"),
      choices: [{ label: t("versions.purge"), value: "y", danger: true }],
    });
    if (x === "y") await purgeScene(c.id);
  };

  const label = (file: string) => (file === CURRENT ? t("versions.current") : (versions.find((v) => v.file === file)?.name ?? file));
  // From the list of versions: what changed since this one, in the current text.
  const compareFrom = (file: string) => {
    setBase(file);
    setHead(CURRENT);
    open("changes");
  };
  const sections: SegmentedOption<Tab>[] = [
    { id: "changes", label: t("versions.changes"), icon: GitCompareArrows, hint: t("versions.changesHint") },
    { id: "versions", label: t("nav.views.versions"), icon: Lock, hint: t("versions.versionsHint") },
    { id: "cuts", label: t("versions.cuts"), icon: Scissors, hint: t("versions.cutsHint") },
  ];

  return (
    <div className="view versions-view">
      {headerActions &&
        createPortal(
          <div className="header-tools">
            <Segmented label={t("versions.sections")} options={sections} value={tab} onChange={open} compact />
          </div>,
          headerActions,
        )}

      <main className={`vr-main ${tab}`} aria-label={sections.find((o) => o.id === tab)?.label}>
        {/* Nothing while the versions are being read, so the first-version page does not flash before them. */}
        {!loaded ? null : tab === "changes" ? (
          versions.length === 0 ? (
            <FirstVersion onFreeze={() => void freeze()} />
          ) : (
            <Compare
              versions={versions}
              base={base}
              head={head}
              cmp={cmp}
              label={label}
              onBase={setBase}
              onHead={setHead}
              onSwap={() => {
                setBase(head);
                setHead(base);
              }}
              cutIds={new Set(cuts.map((c) => c.id))}
              onReinstate={(id) => {
                const c = cuts.find((x) => x.id === id);
                if (c) reinstateCut(c);
              }}
            />
          )
        ) : tab === "versions" ? (
          <VersionList versions={versions} now={now} base={base} onCompare={compareFrom} onRestore={restore} onRemove={remove} onFreeze={() => void freeze()} />
        ) : (
          <CutList cuts={cuts} onReinstate={reinstateCut} onPurge={(c) => void purgeCut(c)} />
        )}
      </main>
    </div>
  );
}

const delta = (before: number, after: number) => after !== before && <span className="vr-delta">{signed(after - before)}</span>;

/** The versions as a thread, newest first under the current one, each with what it holds and what it can do. */
function VersionList({
  versions,
  now,
  base,
  onCompare,
  onRestore,
  onRemove,
  onFreeze,
}: {
  versions: VersionRow[];
  now: VersionFile | null;
  base: string;
  onCompare: (file: string) => void;
  onRestore: (v: VersionRow) => void;
  onRemove: (v: VersionRow) => void;
  onFreeze: () => void;
}) {
  const { notify } = useProject();
  const newest = versions[0];
  return (
    <div className="vr-page">
      <Banner>{t("versions.versionsIntro")}</Banner>
      <ol className="vr-thread">
        <li className="vr-stop current">
          <span className="vr-node" aria-hidden="true">
            <PenLine />
          </span>
          <div className="vr-stop-card">
            <div className="vr-stop-text">
              <span className="vr-stop-title">
                <span className="vr-stop-name">{t("versions.current")}</span>
                <span className="vr-live">{t("versions.live")}</span>
              </span>
              <span className="vr-stop-meta">
                {now ? (
                  <>
                    <span title={newest ? t("versions.wasIn", { n: newest.pages, name: newest.name }) : undefined}>
                      {plural("versions.pages", now.pages)}
                      {newest && delta(newest.pages, now.pages)}
                    </span>
                    <span title={newest ? t("versions.wasIn", { n: newest.scenes, name: newest.name }) : undefined}>
                      {plural("sceneList.count", now.scenes.length)}
                      {newest && delta(newest.scenes, now.scenes.length)}
                    </span>
                  </>
                ) : (
                  t("versions.savedAsTyped")
                )}
              </span>
            </div>
            <div className="vr-stop-actions">
              <button type="button" className="btn primary small" onClick={onFreeze}>
                <Lock aria-hidden="true" />
                {t("versions.freezeShort")}
              </button>
            </div>
          </div>
        </li>
        {versions.map((v, i) => {
          const older = versions[i + 1];
          return (
            <li key={v.id} className={`vr-stop${v.file === base ? " base" : ""}`}>
              <span className="vr-node" aria-hidden="true">
                <Lock />
              </span>
              <div className="vr-stop-card">
                <div className="vr-stop-text">
                  <span className="vr-stop-title">
                    <span className="vr-stop-name">{v.name}</span>
                    {v.file === base && <span className="vr-role">{t("versions.reference")}</span>}
                  </span>
                  <span className="vr-stop-meta">
                    <span>{dateFormat.format(new Date(v.createdAt))}</span>
                    <span title={older ? t("versions.wasIn", { n: older.pages, name: older.name }) : undefined}>
                      {plural("versions.pages", v.pages)}
                      {older && delta(older.pages, v.pages)}
                    </span>
                    <span title={older ? t("versions.wasIn", { n: older.scenes, name: older.name }) : undefined}>
                      {plural("sceneList.count", v.scenes)}
                      {older && delta(older.scenes, v.scenes)}
                    </span>
                    <button
                      type="button"
                      className="vr-hash"
                      title={t("versions.copyHash")}
                      aria-label={`${t("versions.copyHash")} ${v.sha256.slice(0, 8)}`}
                      onClick={() => void navigator.clipboard.writeText(v.sha256).then(() => notify({ text: t("versions.hashCopied") }))}
                    >
                      {v.sha256.slice(0, 8)}
                    </button>
                  </span>
                </div>
                <div className="vr-stop-actions">
                  <button type="button" className="btn small" title={t("versions.seeSince", { name: v.name })} onClick={() => onCompare(v.file)}>
                    <GitCompareArrows aria-hidden="true" />
                    {t("versions.compare")}
                  </button>
                  <MoreMenu
                    label={t("versions.actionsFor", { name: v.name })}
                    items={[
                      { label: t("versions.restore"), icon: Undo2, onClick: () => onRestore(v) },
                      { label: t("versions.removeFromList"), icon: X, danger: true, onClick: () => onRemove(v) },
                    ]}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {versions.length === 0 && (
        <div className="vr-empty">
          <p className="vr-empty-title">{t("versions.noneYet")}</p>
          <p>{t("versions.noneYetText")}</p>
        </div>
      )}
    </div>
  );
}

/** What a tab holds and how it behaves, said once at its top. */
function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="vr-banner" role="note">
      <Info aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

/** The first lines of a cut scene's text, under its heading, so it can be recognised before it is put back. */
function cutExcerpt(content: string): { kind: string; text: string }[] {
  try {
    const blocks = JSON.parse(content) as { type: string; content?: { text?: string }[] }[];
    return blocks
      .filter((b, i) => !(i === 0 && b.type === "scene_heading"))
      .map((b) => ({ kind: b.type, text: (b.content ?? []).map((p) => p.text ?? "").join("") }))
      .filter((b) => b.text.trim());
  } catch {
    return [];
  }
}
const EXCERPT = 4;

/** The cut scenes, newest first, each with the start of its text and the way back. */
function CutList({ cuts, onReinstate, onPurge }: { cuts: CutScene[]; onReinstate: (c: CutScene) => void; onPurge: (c: CutScene) => void }) {
  if (cuts.length === 0)
    return (
      <div className="vr-page">
        <div className="vr-empty">
          <span className="vr-empty-icon" aria-hidden="true">
            <Scissors />
          </span>
          <p className="vr-empty-title">{t("versions.cutsEmpty")}</p>
          <p>{t("versions.cutsNote")}</p>
        </div>
      </div>
    );
  return (
    <div className="vr-page">
      <Banner>{t("versions.cutsNote")}</Banner>
      <ul className="vr-cut-list">
        {cuts.map((c) => {
          const lines = cutExcerpt(c.content);
          const heading = c.heading || t("dash.noHeading");
          return (
            <li key={c.id} className="vr-cut">
              <header className="vr-cut-head">
                <span className="vr-slug" title={heading}>
                  {heading}
                </span>
                <span className="vr-cut-date" title={t("versions.cutOn", { date: dateFormat.format(new Date(c.deletedAt)) })}>
                  {shortDate(c.deletedAt)}
                </span>
                <button type="button" className="btn small" onClick={() => onReinstate(c)}>
                  <Undo2 aria-hidden="true" />
                  {t("versions.reinstate")}
                </button>
                <MoreMenu label={t("versions.cutActions", { heading })} items={[{ label: t("versions.purge"), icon: Trash2, danger: true, onClick: () => onPurge(c) }]} />
              </header>
              {lines.length > 0 && (
                <div className="vr-cut-text">
                  {lines.slice(0, EXCERPT).map((l, i) => (
                    <p key={i} className={`vr-cut-line ${l.kind}`}>
                      {l.text}
                    </p>
                  ))}
                  {lines.length > EXCERPT && <p className="vr-cut-more">{plural("versions.moreLines", lines.length - EXCERPT)}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Before the first frozen version: what freezing does, with a glimpse of a comparison. */
function FirstVersion({ onFreeze }: { onFreeze: () => void }) {
  return (
    <div className="vr-first">
      <h2>{t("versions.firstTitle")}</h2>
      <p>{t("versions.firstText")}</p>
      <p className="vr-first-when">{t("versions.firstWhen")}</p>
      <button type="button" className="btn primary vr-first-go" onClick={onFreeze}>
        <Lock aria-hidden="true" />
        {t("versions.freeze")}
      </button>
      <figure className="vr-first-sample" aria-label={t("versions.sampleLabel")}>
        <div className="vr-file-head">
          <span className="vr-file-num">{t("versions.sceneShort", { n: 12 })}</span>
          <span className="vr-slug">{t("versions.sample.heading")}</span>
          <span className="vr-file-end">
            <LineStat added={1} removed={1} />
          </span>
        </div>
        <div className="vr-unified" aria-hidden="true">
          <span className="vr-ln">1</span>
          <span className="vr-code">{t("versions.sample.line")}</span>
          <span className="vr-ln del">−</span>
          <span className="vr-code del">
            {t("versions.sample.start")} <mark>{t("versions.sample.old")}</mark> {t("versions.sample.end")}
          </span>
          <span className="vr-ln ins">2</span>
          <span className="vr-code ins">
            {t("versions.sample.start")} <mark>{t("versions.sample.new")}</mark> {t("versions.sample.end")}
          </span>
        </div>
        <figcaption>{t("versions.sampleCaption")}</figcaption>
      </figure>
    </div>
  );
}

type Filter = "changes" | Kind | "all";

/** A choice kept on this computer; the page works the same without it. */
function stored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nowhere to keep it: the choice lasts as long as the page.
  }
}

/**
 * The comparison, laid out like a code review: a bar that says how much changed and between which versions,
 * each touched scene's text, the identical lines folded away, and the list of them on the right.
 */
function Compare({
  versions,
  base,
  head,
  cmp,
  label,
  onBase,
  onHead,
  onSwap,
  cutIds,
  onReinstate,
}: {
  versions: VersionRow[];
  base: string;
  head: string;
  cmp: Comparison | null;
  label: (file: string) => string;
  onBase: (file: string) => void;
  onHead: (file: string) => void;
  onSwap: () => void;
  cutIds: Set<string>;
  onReinstate: (id: string) => void;
}) {
  const { openScene } = useProject();
  const [filter, setFilter] = useState<Filter>("changes");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState("");
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setClosed(new Set());
    setReviewed(new Set());
    setActive("");
  }, [base, head]);

  const options = (
    <>
      <option value={CURRENT}>{t("versions.current")}</option>
      {versions.map((v) => (
        <option key={v.id} value={v.file}>
          {v.name}
        </option>
      ))}
    </>
  );
  const ready = !!cmp && base !== head;
  const touched = ready ? cmp.scenes.filter((s) => s.diff.kind !== "same") : [];
  const bar = (summary: ReactNode) => (
    <header className="vr-toolbar">
      <div className="vr-summary">{summary}</div>
      <div className="vr-toolbar-end">
        <div className="vr-pair" role="group" aria-label={t("versions.pair")}>
          <Select value={base} onChange={(e) => onBase(e.target.value)} aria-label={t("versions.reference")} title={t("versions.reference")}>
            {options}
          </Select>
          <ArrowRight aria-hidden="true" className="vr-pair-arrow" />
          <Select value={head} onChange={(e) => onHead(e.target.value)} aria-label={t("versions.compared")} title={t("versions.compared")}>
            {options}
          </Select>
          <button type="button" className="more-btn vr-swap" aria-label={t("versions.swap")} title={t("versions.swap")} onClick={onSwap}>
            <ArrowLeftRight aria-hidden="true" />
          </button>
        </div>

      </div>
    </header>
  );

  if (base === head) return <div className="vr-compare">{bar(<span className="vr-summary-title quiet">{t("versions.chooseTwo")}</span>)}</div>;
  if (!cmp)
    return (
      <div className="vr-compare">
        {bar(<span className="vr-summary-title quiet">{t("versions.comparing")}</span>)}
        <div className="vr-loading" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );

  if (touched.length === 0)
    return (
      <div className="vr-compare">
        {bar(<span className="vr-summary-title">{t("versions.nothingSince", { name: label(base) })}</span>)}
        <div className="vr-same">
          <span className="vr-same-icon" aria-hidden="true">
            <Check />
          </span>
          <p>{t("versions.same", { head: label(head), base: label(base) })}</p>
        </div>
      </div>
    );

  const count = (k: Kind) => cmp.scenes.filter((s) => s.diff.kind === k).length;
  const totals = touched.reduce((t, s) => ({ added: t.added + s.added, removed: t.removed + s.removed }), { added: 0, removed: 0 });
  const heading = (s: ComparedScene) => (s.diff.right ?? s.diff.left)?.heading || t("dash.noHeading");
  const shown = cmp.scenes
    .filter((s) => (filter === "all" ? true : filter === "changes" ? s.diff.kind !== "same" : s.diff.kind === filter));
  const setIn = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };
  // A scene read through folds away, as in a review; unticked, it opens again.
  const review = (key: string, on: boolean) => {
    setReviewed((r) => setIn(r, key, on));
    setClosed((c) => setIn(c, key, on));
  };
  const allClosed = shown.length > 0 && shown.every((s) => closed.has(s.key));
  const filterName = (f: Filter) => (f === "changes" ? t("versions.changes") : f === "all" ? t("versions.all") : kindMany(f));
  const filterCount = (f: Filter) => (f === "changes" ? touched.length : f === "all" ? cmp.scenes.length : count(f));
  const filters: Filter[] = ["changes", ...KINDS.filter((k) => count(k) > 0), "all"];

  // The scene at the top of the text is the one lit in the list.
  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    let at = "";
    for (const el of box.querySelectorAll<HTMLElement>(".vr-file")) {
      if (el.offsetTop - box.scrollTop > 48) break;
      at = el.dataset.key ?? "";
    }
    setActive(at);
  };
  const goTo = (key: string) => {
    setClosed((c) => setIn(c, key, false));
    requestAnimationFrame(() => {
      const box = scroller.current;
      const el = box?.querySelector<HTMLElement>(`.vr-file[data-key="${CSS.escape(key)}"]`);
      if (box && el) box.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
      setActive(key);
    });
  };
  const lit = shown.some((s) => s.key === active) ? active : shown[0]?.key;

  return (
    <div className="vr-compare">
      {bar(
        <>
          <span className="vr-summary-title">{plural("versions.changedCount", touched.length)}</span>
          <LineStat added={totals.added} removed={totals.removed} />
          <span className="vr-summary-sums">
            <span title={t("versions.wasIn", { n: cmp.base.scenes.length, name: label(base) })}>
              {plural("sceneList.count", cmp.head.scenes.length)}
              {delta(cmp.base.scenes.length, cmp.head.scenes.length)}
            </span>
            <span title={t("versions.wasIn", { n: cmp.base.pages, name: label(base) })}>
              {plural("versions.pages", cmp.head.pages)}
              {delta(cmp.base.pages, cmp.head.pages)}
            </span>
          </span>
        </>,
      )}

      <div className="vr-body">
        <div className="vr-files" ref={scroller} onScroll={onScroll}>
          {shown.map((s) => (
            <SceneFile
              key={s.key}
              scene={s}
              heading={heading(s)}
              open={!closed.has(s.key)}
              onToggle={() => setClosed((c) => setIn(c, s.key, !c.has(s.key)))}
              reviewed={reviewed.has(s.key)}
              onReview={(on) => review(s.key, on)}
              onOpen={head === CURRENT && s.diff.right ? () => openScene(s.diff.right!.id) : undefined}
              onReinstate={head === CURRENT && s.diff.kind === "removed" && cutIds.has(s.diff.left!.id) ? () => onReinstate(s.diff.left!.id) : undefined}
            />
          ))}
        </div>

        <nav className="vr-tree" aria-label={t("versions.tree")}>
            <div className="vr-tree-head">
              <button
                ref={filterButton}
                type="button"
                className={`btn vr-filter-btn${menuAt ? " on" : ""}${filter !== "changes" ? " set" : ""}`}
                title={t("versions.shownScenes")}
                aria-haspopup="menu"
                aria-expanded={!!menuAt}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenuAt(menuAt ? null : { top: r.bottom + 4, left: r.left });
                }}
              >
                <ListFilter aria-hidden="true" />
                <span className="vr-filter-name">{filterName(filter)}</span>
                <span className="vr-filter-n">{shown.length}</span>
                <ChevronDown aria-hidden="true" className="vr-filter-caret" />
              </button>
              {menuAt && (
                <FloatingMenu
                  anchor={filterButton}
                  style={{ top: menuAt.top, left: menuAt.left }}
                  onClose={() => setMenuAt(null)}
                  items={filters.map((f) => ({ label: `${filterName(f)} (${filterCount(f)})`, checked: filter === f, onClick: () => setFilter(f) }))}
                />
              )}
              <button
                type="button"
                className="btn icon-only vr-fold-all"
                disabled={shown.length === 0}
                aria-label={allClosed ? t("sceneList.unfold") : t("versions.foldAll")}
                title={allClosed ? t("sceneList.unfold") : t("versions.foldAll")}
                onClick={() => setClosed(allClosed ? new Set() : new Set(shown.map((s) => s.key)))}
              >
                {allClosed ? <ChevronsUpDown aria-hidden="true" /> : <ChevronsDownUp aria-hidden="true" />}
              </button>
            </div>
            <ul className="vr-tree-list">
              {shown.map((s) => (
                <li key={s.key}>
                  <button type="button" className={`vr-tree-item${s.key === lit ? " on" : ""}`} aria-current={s.key === lit || undefined} title={heading(s)} onClick={() => goTo(s.key)}>
                    {reviewed.has(s.key) ? <Check className="vr-tree-done" aria-label={t("versions.reviewed")} /> : <span className={`vr-dot ${s.diff.kind}`} aria-hidden="true" />}
                    <span className="vr-tree-name">{heading(s)}</span>
                    <span className="vr-tree-num">{s.number}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
      </div>
    </div>
  );
}

function LineStat({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="vr-linestat" title={`${plural("versions.linesAdded", added)}, ${plural("versions.linesRemoved", removed)}`}>
      <span className={added ? "vr-plus" : "vr-none"}>+{added}</span>
      <span className={removed ? "vr-minus" : "vr-none"}>−{removed}</span>
    </span>
  );
}

/** A line of the unified text: kept, taken out (from the reference) or put in (in the compared version). */
type Row = { tone: "same" | "del" | "ins"; side: LineSide; marked: boolean };

/** Each run of changes reads as its removed lines, then its added ones, as in a code review. */
function unify(lines: DiffLine[]): Row[] {
  const out: Row[] = [];
  let dels: Row[] = [];
  let ins: Row[] = [];
  const flush = () => {
    out.push(...dels, ...ins);
    dels = [];
    ins = [];
  };
  for (const l of lines) {
    if (l.kind === "same") {
      flush();
      out.push({ tone: "same", side: l.right!, marked: false });
      continue;
    }
    if (l.left) dels.push({ tone: "del", side: l.left, marked: l.kind === "changed" });
    if (l.right) ins.push({ tone: "ins", side: l.right, marked: l.kind === "changed" });
  }
  flush();
  return out;
}

/** A line's text, with the words that changed marked when it faces another. */
function LineText({ side, marked }: { side: LineSide; marked: boolean }) {
  if (side.parts.every((p) => !p.text)) return <> </>;
  if (!marked) return <>{side.parts.map((p) => p.text).join("")}</>;
  return <>{side.parts.map((p, i) => (p.kind === "same" ? <span key={i}>{p.text}</span> : <mark key={i}>{p.text}</mark>))}</>;
}

function SceneFile({
  scene,
  heading,
  open,
  onToggle,
  reviewed,
  onReview,
  onOpen,
  onReinstate,
}: {
  scene: ComparedScene;
  heading: string;
  open: boolean;
  onToggle: () => void;
  reviewed: boolean;
  onReview: (on: boolean) => void;
  onOpen?: () => void;
  /** The scene was removed from the current text and still waits among the cut scenes. */
  onReinstate?: () => void;
}) {
  const [unfolded, setUnfolded] = useState<Set<number>>(new Set());
  const hunks = useMemo(() => foldLines(scene.lines), [scene.lines]);
  const kind = scene.diff.kind;
  // Identical lines folded at the top open upwards, at the bottom downwards, between two changes both ways.
  const fold = (i: number, n: number) => {
    const between = i > 0 && i < hunks.length - 1;
    const Icon = i === 0 ? ArrowUpToLine : between ? UnfoldVertical : ArrowDownToLine;
    return (
      <button key={i} type="button" className={`vr-fold${between ? " between" : ""}`} onClick={() => setUnfolded(new Set(unfolded).add(i))}>
        <span className="vr-fold-icon">
          <Icon aria-hidden="true" />
        </span>
        <span className="vr-fold-label">{plural("versions.sameLines", n)}</span>
      </button>
    );
  };
  const body = (render: (lines: DiffLine[]) => ReactNode) =>
    hunks.map((h, i) => (h.kind === "fold" && !unfolded.has(i) ? fold(i, h.lines.length) : <Fragment key={i}>{render(h.lines)}</Fragment>));

  return (
    <section className={`vr-file ${kind}${reviewed ? " reviewed" : ""}`} data-key={scene.key} aria-label={heading}>
      <header className="vr-file-head">
        <button type="button" className="vr-file-toggle" aria-expanded={open} onClick={onToggle}>
          <ChevronDown aria-hidden="true" />
          <span className="vr-file-num">{t("versions.sceneShort", { n: scene.number })}</span>
          <span className="vr-slug">{heading}</span>
        </button>
        {kind !== "changed" && <span className={`vr-kind ${kind}`}>{kindOne(kind)}</span>}
        <span className="vr-file-end">
          {(scene.added > 0 || scene.removed > 0) && <LineStat added={scene.added} removed={scene.removed} />}
          <label className="vr-review" title={t("versions.reviewedHint")}>
            <input type="checkbox" checked={reviewed} onChange={(e) => onReview(e.target.checked)} />
            {t("versions.reviewed")}
          </label>
          {onReinstate && (
            <button type="button" className="btn small" onClick={onReinstate}>
              <Undo2 aria-hidden="true" />
              {t("versions.reinstate")}
            </button>
          )}
          {onOpen && <MoreMenu label={t("versions.sceneActions", { heading })} items={[{ label: t("versions.openInScript"), icon: PenLine, onClick: onOpen }]} />}
        </span>
      </header>
      {open && kind === "moved" && <div className="vr-split-note">{t("versions.moved")}</div>}
      {open && (
        <div className="vr-unified" role="table" aria-label={heading}>
          {body((lines) =>
            unify(lines).map((r, k) => (
              <div key={k} className={`vr-row ${r.tone}`} role="row">
                <span className={`vr-ln ${r.tone}`} role="cell" aria-label={r.tone === "del" ? t("versions.removedLine") : undefined}>
                  {r.tone === "del" ? "−" : r.side.n}
                </span>
                <span className={`vr-code ${r.tone}`} role="cell">
                  <LineText side={r.side} marked={r.marked} />
                </span>
              </div>
            )),
          )}
        </div>
      )}
    </section>
  );
}

