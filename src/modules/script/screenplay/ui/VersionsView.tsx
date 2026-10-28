import { ArrowDownToLine, ArrowRight, ArrowUpToLine, Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, Copy, Lock, Pencil, PenLine, Trash2, Undo2, UnfoldVertical, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { FloatingMenu, MoreMenu } from "../../../../ui-kit/MoreMenu";
import { Segmented, type SegmentedOption } from "../../../../ui-kit/Segmented";
import { useProject } from "../../../project/ui/projectContext";
import { diffLines, diffScenes, foldLines, lineStats, type DiffLine, type LineSide, type SceneDiff } from "../domain/diff";
import { formatById, lineHeightIn, type ElementStyle, type ScreenplayFormat } from "../domain/formats";
import { useScriptFormat } from "../application/formatSettings";
import {
  cutScenes,
  currentVersion,
  deleteVersionRow,
  renameVersion,
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
  /** The kind of element each line is, in the reference version and in the compared one. */
  types: { left: string[]; right: string[] };
  added: number;
  removed: number;
}

interface Comparison {
  base: VersionFile;
  head: VersionFile;
  scenes: ComparedScene[];
}

/** One element per line of a scene's text, in order: its kind, read from the stored elements. */
function blockTypes(v: VersionFile): Map<string, string[]> {
  return new Map(
    v.scenes.map((s) => {
      try {
        return [s.id, (JSON.parse(s.content) as { type: string }[]).map((b) => b.type)];
      } catch {
        return [s.id, []];
      }
    }),
  );
}

function compareVersions(base: VersionFile, head: VersionFile): Comparison {
  const leftTypes = blockTypes(base);
  const rightTypes = blockTypes(head);
  const left = versionScenes(base);
  const right = versionScenes(head);
  const leftAt = new Map(left.map((s, i) => [s.id, i + 1]));
  const rightAt = new Map(right.map((s, i) => [s.id, i + 1]));
  const scenes = diffScenes(left, right).map((d, i) => {
    const lines = diffLines(d.left?.text ?? "", d.right?.text ?? "");
    const number = d.right ? (rightAt.get(d.right.id) ?? 0) : (leftAt.get(d.left!.id) ?? 0);
    const types = { left: (d.left && leftTypes.get(d.left.id)) || [], right: (d.right && rightTypes.get(d.right.id)) || [] };
    return { key: `${(d.right ?? d.left)!.id}-${i}`, diff: d, number, lines, types, ...lineStats(lines) };
  });
  return { base, head, scenes };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");

/** What became of a scene: one scene, or the name of the filter over several. */
const kindOne = (k: Kind) => t(`versions.kind.${k}`);
const kindMany = (k: Kind) => t(`versions.kinds.${k}`);
const KINDS: Exclude<Kind, "same">[] = ["changed", "added", "removed", "moved"];

/** What the panel on the right shows: the touched scenes, the versions, or the cut scenes. */
type Pane = "scenes" | "versions" | "cuts";

/**
 * Frozen versions, their comparison and the cut scenes [REE-01, REE-02, REE-06], on one screen. The header asks the
 * question (which two versions) and holds the one act (freeze); the text of what changed fills the page; the panel on
 * the right shows one thing at a time, as in the Scénario: the touched scenes, the versions, or the cut scenes.
 */
export function VersionsView() {
  const { session, project, notify, prompt, ask, headerActions } = useProject();
  const loaded = useLive(listVersions, ["script_version"]);
  const versions = loaded ?? [];
  const cuts = useLive(cutScenes, ["scene"]) ?? [];
  const format = useScriptFormat();
  const [pane, setPane] = useState<Pane>("scenes");
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

  // Without a frozen version there is nothing to compare: the panel opens on the versions.
  const shownPane: Pane = versions.length === 0 && pane === "scenes" ? "versions" : pane;

  // The current version's size, measured again each time the versions show.
  useEffect(() => {
    if (shownPane !== "versions") return;
    let live = true;
    load(CURRENT)
      .then((v) => live && setNow(v))
      .catch(() => live && setNow(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPane, format, loaded]);

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

  const rename = async (v: VersionRow) => {
    const name = (await prompt(t("versions.renameVersion"), t("versions.name"), v.name))?.trim();
    if (!name || name === v.name) return;
    try {
      await renameVersion(v.id, name);
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
  // A version picked in the panel becomes the reference, compared with the current text.
  const compareFrom = (file: string) => {
    setBase(file);
    setHead(CURRENT);
  };

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
  const panes: SegmentedOption<Pane>[] = [
    ...(versions.length > 0 ? [{ id: "scenes" as const, label: t("versions.paneScenes"), hint: t("versions.paneScenesHint") }] : []),
    { id: "versions", label: t("nav.views.versions"), count: versions.length, hint: t("versions.historyHint") },
    { id: "cuts", label: t("versions.paneCuts"), count: cuts.length, hint: t("versions.cutsHint") },
  ];
  const side = (scenes: ReactNode) => (
    <aside className="vr-side" aria-label={t("versions.panel")}>
      <div className="vr-side-tabs">
        <Segmented label={t("versions.panel")} options={panes} value={shownPane} onChange={setPane} />
      </div>
      {shownPane === "scenes" ? (
        scenes
      ) : shownPane === "versions" ? (
        <VersionPane versions={versions} now={now} base={base} onCompare={compareFrom} onRename={rename} onRestore={restore} onRemove={remove} />
      ) : (
        <CutPane cuts={cuts} onReinstate={reinstateCut} onPurge={(c) => void purgeCut(c)} />
      )}
    </aside>
  );

  return (
    <div className="view versions-view">
      {headerActions &&
        loaded &&
        versions.length > 0 &&
        createPortal(
          <div className="header-tools">
            <div className="vr-pair" role="group" aria-label={t("versions.pair")}>
              <Select value={base} onChange={(e) => setBase(e.target.value)} aria-label={t("versions.reference")} title={t("versions.reference")}>
                {options}
              </Select>
              <ArrowRight aria-hidden="true" className="vr-pair-arrow" />
              <Select value={head} onChange={(e) => setHead(e.target.value)} aria-label={t("versions.compared")} title={t("versions.compared")}>
                {options}
              </Select>
            </div>
            <button type="button" className="btn primary" onClick={() => void freeze()}>
              <Lock aria-hidden="true" />
              {t("versions.freezeShort")}
            </button>
          </div>,
          headerActions,
        )}

      <main className="vr-main" aria-label={t("nav.views.versions")}>
        {/* Nothing while the versions are being read, so the first-version page does not flash before them. */}
        {!loaded ? null : versions.length === 0 ? (
          <div className="vr-compare">
            <div className="vr-col">
              <FirstVersion onFreeze={() => void freeze()} />
            </div>
            {side(null)}
          </div>
        ) : (
          <Compare
            format={format ?? formatById(null)}
            base={base}
            head={head}
            cmp={cmp}
            label={label}
            side={side}
            cutIds={new Set(cuts.map((c) => c.id))}
            onReinstate={(id) => {
              const c = cuts.find((x) => x.id === id);
              if (c) reinstateCut(c);
            }}
          />
        )}
      </main>
    </div>
  );
}

const delta = (before: number, after: number) => after !== before && <span className="vr-delta">{signed(after - before)}</span>;

/** The versions as a thread, the current one on top; picking a frozen one compares the current text with it. */
function VersionPane({
  versions,
  now,
  base,
  onCompare,
  onRename,
  onRestore,
  onRemove,
}: {
  versions: VersionRow[];
  now: VersionFile | null;
  base: string;
  onCompare: (file: string) => void;
  onRename: (v: VersionRow) => void;
  onRestore: (v: VersionRow) => void;
  onRemove: (v: VersionRow) => void;
}) {
  const { notify } = useProject();
  const newest = versions[0];
  return (
    <div className="vr-pane">
      <ol className="vr-thread">
        <li className="vr-stop current">
          <span className="vr-node" aria-hidden="true">
            <PenLine />
          </span>
          <div className="vr-stop-body">
            <span className="vr-stop-title">
              <span className="vr-stop-name">{t("versions.current")}</span>
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
        </li>
        {versions.map((v) => (
          <li key={v.id} className={`vr-stop${v.file === base ? " base" : ""}`}>
            <span className="vr-node" aria-hidden="true">
              <Lock />
            </span>
            <div className="vr-stop-card">
            <button type="button" className="vr-stop-body" aria-pressed={v.file === base} title={t("versions.seeSince", { name: v.name })} onClick={() => onCompare(v.file)}>
              <span className="vr-stop-title">
                <span className="vr-stop-name">{v.name}</span>
              </span>
              <span className="vr-stop-meta">
                <span title={dateFormat.format(new Date(v.createdAt))}>{shortDate(v.createdAt)}</span>
                <span>{plural("versions.pages", v.pages)}</span>
                <span>{plural("sceneList.count", v.scenes)}</span>
              </span>
            </button>
            <MoreMenu
              label={t("versions.actionsFor", { name: v.name })}
              items={[
                { label: t("versions.renameVersion"), icon: Pencil, onClick: () => onRename(v) },
                { label: t("versions.restore"), icon: Undo2, onClick: () => onRestore(v) },
                {
                  label: `${t("versions.copyHash")} · ${v.sha256.slice(0, 8)}`,
                  icon: Copy,
                  onClick: () => void navigator.clipboard.writeText(v.sha256).then(() => notify({ text: t("versions.hashCopied") })),
                },
                { label: t("versions.removeFromList"), icon: X, danger: true, onClick: () => onRemove(v) },
              ]}
            />
            </div>
          </li>
        ))}
      </ol>
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

/** The cut scenes, newest first: the heading, the start of the text, when it went and the way back. */
function CutPane({ cuts, onReinstate, onPurge }: { cuts: CutScene[]; onReinstate: (c: CutScene) => void; onPurge: (c: CutScene) => void }) {
  return (
    <div className="vr-pane">
      {cuts.length === 0 ? (
        <p className="vr-pane-empty">{t("versions.cutsEmpty")}</p>
      ) : (
        <ul className="vr-cut-list">
          {cuts.map((c) => {
            const first = cutExcerpt(c.content)[0];
            const heading = c.heading || t("dash.noHeading");
            return (
              <li key={c.id} className="vr-cut">
                <div className="vr-cut-top">
                  <span className="vr-slug" title={heading}>
                    {heading}
                  </span>
                  <MoreMenu label={t("versions.cutActions", { heading })} items={[{ label: t("versions.purge"), icon: Trash2, danger: true, onClick: () => onPurge(c) }]} />
                </div>
                {first && <p className="vr-cut-line">{first.text}</p>}
                <div className="vr-cut-foot">
                  <span className="vr-cut-date" title={t("versions.cutOn", { date: dateFormat.format(new Date(c.deletedAt)) })}>
                    {shortDate(c.deletedAt)}
                  </span>
                  <button type="button" className="btn small" onClick={() => onReinstate(c)}>
                    <Undo2 aria-hidden="true" />
                    {t("versions.reinstate")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
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

/**
 * The comparison, laid out like a code review: each touched scene's text, the identical lines folded away; its list of
 * scenes goes to the panel on the right, which the page gives it through `side`.
 */
function Compare({
  format,
  base,
  head,
  cmp,
  label,
  side,
  cutIds,
  onReinstate,
}: {
  format: ScreenplayFormat;
  base: string;
  head: string;
  cmp: Comparison | null;
  label: (file: string) => string;
  /** The panel on the right, given what its « Scènes » tab shows. */
  side: (scenes: ReactNode) => ReactNode;
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

  const ready = !!cmp && base !== head;
  const touched = ready ? cmp.scenes.filter((s) => s.diff.kind !== "same") : [];
  const layout = (main: ReactNode, scenes: ReactNode) => (
    <div className="vr-compare">
      {main}
      {side(scenes)}
    </div>
  );
  const quiet = (text: string) => (
    <div className="vr-pane">
      <p className="vr-pane-empty">{text}</p>
    </div>
  );

  if (base === head) return layout(<p className="vr-note">{t("versions.chooseTwo")}</p>, quiet(t("versions.chooseTwo")));
  if (!cmp)
    return layout(
      <div className="vr-loading" aria-label={t("versions.comparing")}>
        <span />
        <span />
        <span />
      </div>,
      null,
    );

  if (touched.length === 0)
    return layout(
      <div className="vr-col">
        <div className="vr-same">
          <span className="vr-same-icon" aria-hidden="true">
            <Check />
          </span>
          <p>{t("versions.same", { head: label(head), base: label(base) })}</p>
        </div>
      </div>,
      quiet(t("versions.nothingSince", { name: label(base) })),
    );

  const count = (k: Kind) => cmp.scenes.filter((s) => s.diff.kind === k).length;
  const totals = touched.reduce((t, s) => ({ added: t.added + s.added, removed: t.removed + s.removed }), { added: 0, removed: 0 });
  const heading = (s: ComparedScene) => (s.diff.right ?? s.diff.left)?.heading || t("dash.noHeading");
  const shown = cmp.scenes.filter((s) => (filter === "all" ? true : filter === "changes" ? s.diff.kind !== "same" : s.diff.kind === filter));
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

  return layout(
    <div className="vr-files" ref={scroller} onScroll={onScroll} style={pageWidth(format)}>
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
          format={format}
        />
      ))}
    </div>,
    <nav className="vr-tree" aria-label={t("versions.tree")}>
      {/* What the list shows and how much changed, on one quiet line above it. */}
      <div className="vr-tree-head">
        <button
          ref={filterButton}
          type="button"
          className={`vr-filter${menuAt ? " on" : ""}${filter !== "changes" ? " set" : ""}`}
          title={t("versions.shownScenes")}
          aria-haspopup="menu"
          aria-expanded={!!menuAt}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenuAt(menuAt ? null : { top: r.bottom + 4, left: r.left });
          }}
        >
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
        <LineStat added={totals.added} removed={totals.removed} />
        <button
          type="button"
          className="more-btn"
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
    </nav>,
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

/** The width of the text on the page, as in the Scénario's cards, and the font of the format. */
function pageWidth(f: ScreenplayFormat): CSSProperties {
  const lh = lineHeightIn(f);
  return {
    "--vr-text": `${f.page.width - f.margins.left - f.margins.right}in`,
    "--lh": `${lh}in`,
  } as CSSProperties;
}

/** An element laid out as in the editor: its indent, width, alignment, case and style. */
function elementStyle(s: ElementStyle, lh: number): CSSProperties {
  return {
    marginLeft: `${s.indent}in`,
    width: `${s.width}in`,
    textAlign: s.align,
    textTransform: s.uppercase ? "uppercase" : undefined,
    fontStyle: s.italic ? "italic" : undefined,
    textDecoration: s.underline ? "underline" : undefined,
    lineHeight: `${lh * (s.spacing ?? 1)}in`,
  };
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
  format,
}: {
  format: ScreenplayFormat;
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
  const lh = lineHeightIn(format);
  const body = (render: (lines: DiffLine[], first: boolean) => ReactNode) =>
    hunks.map((h, i) => (h.kind === "fold" && !unfolded.has(i) ? fold(i, h.lines.length) : <Fragment key={i}>{render(h.lines, i === 0 || (hunks[i - 1].kind === "fold" && !unfolded.has(i - 1)))}</Fragment>));

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
      {open && scene.lines.length > 0 && (
        <div className="vr-script" role="table" aria-label={heading} style={{ fontFamily: `"${format.fontFamily}", monospace`, fontSize: `${format.fontSizePt}pt` }}>
          {body((lines, first) =>
            unify(lines).map((r, k, rows) => {
              const type = (r.tone === "del" ? scene.types.left : scene.types.right)[r.side.n - 1] ?? "action";
              const el = format.elements[type as keyof ScreenplayFormat["elements"]] ?? format.elements.action;
              // The space the page leaves above the element; none at the top or under a fold, nor between a line and its rewrite.
              const tight = (first && k === 0) || (r.tone === "ins" && r.marked && rows[k - 1]?.tone === "del");
              return (
                <div key={k} className={`vr-line ${r.tone}`} role="row" style={tight ? undefined : { paddingTop: `${el.spaceBefore * lh}in` }}>
                  <span className="vr-ln" role="cell" aria-label={r.tone === "del" ? t("versions.removedLine") : undefined}>
                    {r.tone === "del" ? "−" : r.side.n}
                  </span>
                  <span className="vr-el" role="cell" style={elementStyle(el, lh)}>
                    <LineText side={r.side} marked={r.marked} />
                  </span>
                </div>
              );
            }),
          )}
        </div>
      )}
    </section>
  );
}

