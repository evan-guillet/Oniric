import { ArrowLeftRight, ArrowRight, Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, Copy, Lock, PenLine, Trash2, Undo2, UnfoldVertical, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { MoreMenu } from "../../../../ui-kit/MoreMenu";
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

/**
 * Frozen versions, their comparison and the cut scenes [REE-01, REE-02, REE-06]: the thread of the versions
 * on the left, newest first, and on the right what changed between the two chosen ones, scene by scene.
 */
export function VersionsView() {
  const { session, project, notify, prompt, ask, headerActions } = useProject();
  const loaded = useLive(listVersions, ["script_version"]);
  const versions = loaded ?? [];
  const cuts = useLive(cutScenes, ["scene"]) ?? [];
  const format = useScriptFormat();
  const [base, setBase] = useState("");
  const [head, setHead] = useState(CURRENT);
  const [cmp, setCmp] = useState<Comparison | null>(null);

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
  const pick = (file: string) => {
    if (file === CURRENT) {
      setHead(CURRENT);
      if (base === CURRENT) setBase(latest);
      return;
    }
    setBase(file);
    if (head === file) setHead(CURRENT);
  };
  // What the current version looks like, once a comparison has read it.
  const current = cmp ? (head === CURRENT ? cmp.head : base === CURRENT ? cmp.base : null) : null;

  return (
    <div className="view versions-view">
      {headerActions &&
        createPortal(
          <div className="header-tools">
            <button type="button" className="btn primary" onClick={() => void freeze()}>
              <Lock aria-hidden="true" />
              {t("versions.freeze")}
            </button>
          </div>,
          headerActions,
        )}

      <aside className="vr-rail" aria-label={t("versions.thread")}>
        <h2 className="vr-rail-title">
          {t("nav.views.versions")}
          {versions.length > 0 && <span className="count">{versions.length}</span>}
        </h2>
        <ol className="vr-thread">
          <li className={`vr-stop current${head === CURRENT ? " head" : ""}${base === CURRENT ? " base" : ""}`}>
            <span className="vr-node" aria-hidden="true">
              <PenLine />
            </span>
            <button type="button" className="vr-stop-main" aria-pressed={head === CURRENT} onClick={() => pick(CURRENT)}>
              <span className="vr-stop-title">
                <span className="vr-stop-name">{t("versions.current")}</span>
                <RoleTag file={CURRENT} base={base} head={head} />
              </span>
              <span className="vr-stop-meta">
                <span className="vr-live">{t("versions.live")}</span>
                {current ? ` · ${plural("versions.pages", current.pages)} · ${plural("sceneList.count", current.scenes.length)}` : ` · ${t("versions.savedAsTyped")}`}
              </span>
            </button>
          </li>
          {versions.map((v, i) => {
            const older = versions[i + 1];
            return (
              <li key={v.id} className={`vr-stop${v.file === base ? " base" : ""}${v.file === head ? " head" : ""}`}>
                <span className="vr-node" aria-hidden="true">
                  <Lock />
                </span>
                <button type="button" className="vr-stop-main" aria-pressed={v.file === base} onClick={() => pick(v.file)} title={t("versions.seeSince", { name: v.name })}>
                  <span className="vr-stop-title">
                    <span className="vr-stop-name">{v.name}</span>
                    <RoleTag file={v.file} base={base} head={head} />
                  </span>
                  <span className="vr-stop-meta">{dateFormat.format(new Date(v.createdAt))}</span>
                  <span className="vr-stop-meta">
                    {plural("versions.pages", v.pages)} · {plural("sceneList.count", v.scenes)}
                    {older && v.scenes !== older.scenes && <span className="vr-gain"> ({signed(v.scenes - older.scenes)})</span>}
                  </span>
                </button>
                <MoreMenu
                  label={t("versions.actionsFor", { name: v.name })}
                  className="vr-stop-more"
                  items={[
                    { label: t("versions.restore"), icon: Undo2, onClick: () => void restore(v) },
                    {
                      label: t("versions.copyHash"),
                      icon: Copy,
                      onClick: () => void navigator.clipboard.writeText(v.sha256).then(() => notify({ text: t("versions.hashCopied") })),
                    },
                    { label: t("versions.removeFromList"), icon: X, danger: true, onClick: () => void remove(v) },
                  ]}
                />
              </li>
            );
          })}
        </ol>

        <section className="vr-cuts" aria-labelledby="vr-cuts-title">
          <h2 id="vr-cuts-title" className="vr-rail-title">
            {t("versions.cuts")}
            {cuts.length > 0 && <span className="count">{cuts.length}</span>}
          </h2>
          {cuts.length === 0 && <p className="vr-cuts-note">{t("versions.cutsNote")}</p>}
          {cuts.length > 0 && (
            <ul className="vr-cut-list">
              {cuts.map((c) => (
                <li key={c.id} className="vr-cut">
                  <span className="vr-slug">{c.heading || t("dash.noHeading")}</span>
                  <span className="vr-stop-meta" title={t("versions.cutOn", { date: dateFormat.format(new Date(c.deletedAt)) })}>
                    {shortDate(c.deletedAt)}
                  </span>
                  <button type="button" className="btn ghost small vr-cut-back" onClick={() => reinstateCut(c)}>
                    <Undo2 aria-hidden="true" />
                    {t("versions.reinstate")}
                  </button>
                  <MoreMenu label={t("versions.cutActions", { heading: c.heading })} items={[{ label: t("versions.purge"), icon: Trash2, danger: true, onClick: () => void purgeCut(c) }]} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main className="vr-main">
        {/* Nothing while the versions are being read, so the first-version page does not flash before them. */}
        {!loaded ? null : versions.length === 0 ? (
          <FirstVersion />
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
          />
        )}
      </main>
    </div>
  );
}

/** « Référence » or « Comparée » on the two versions being compared. */
function RoleTag({ file, base, head }: { file: string; base: string; head: string }) {
  if (base === head) return null;
  if (file === base) return <span className="vr-role">{t("versions.reference")}</span>;
  if (file === head) return <span className="vr-role head">{t("versions.compared")}</span>;
  return null;
}

/** Before the first frozen version: what freezing does, with a glimpse of a comparison. */
function FirstVersion() {
  return (
    <div className="vr-first">
      <h2>{t("versions.firstTitle")}</h2>
      <p>{t("versions.firstText")}</p>
      <p className="vr-first-when">{t("versions.firstWhen")}</p>
      <figure className="vr-first-sample" aria-label={t("versions.sampleLabel")}>
        <div className="vr-file-head">
          <span className="vr-file-num">{t("versions.sceneShort", { n: 12 })}</span>
          <span className="vr-slug">{t("versions.sample.heading")}</span>
          <span className="vr-kind changed">{t("versions.kind.changed")}</span>
        </div>
        <div className="vr-split" aria-hidden="true">
          <span className="vr-ln">1</span>
          <span className="vr-code">
            <span className="vr-sign"> </span>{t("versions.sample.line")}
          </span>
          <span className="vr-ln">1</span>
          <span className="vr-code">
            <span className="vr-sign"> </span>{t("versions.sample.line")}
          </span>
          <span className="vr-ln del">2</span>
          <span className="vr-code del">
            <span className="vr-sign">−</span>{t("versions.sample.start")} <mark>{t("versions.sample.old")}</mark> {t("versions.sample.end")}
          </span>
          <span className="vr-ln ins">2</span>
          <span className="vr-code ins">
            <span className="vr-sign">+</span>{t("versions.sample.start")} <mark>{t("versions.sample.new")}</mark> {t("versions.sample.end")}
          </span>
        </div>
        <figcaption>{t("versions.sampleCaption")}</figcaption>
      </figure>
    </div>
  );
}

type Filter = "changes" | Kind | "all";

function Compare({
  versions,
  base,
  head,
  cmp,
  label,
  onBase,
  onHead,
  onSwap,
}: {
  versions: VersionRow[];
  base: string;
  head: string;
  cmp: Comparison | null;
  label: (file: string) => string;
  onBase: (file: string) => void;
  onHead: (file: string) => void;
  onSwap: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("changes");
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => setClosed(new Set()), [base, head]);

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
  const pair = (
    <div className="vr-pair" role="group" aria-label={t("versions.pair")}>
      <label className="vr-pick">
        <span className="vr-pick-role">{t("versions.reference")}</span>
        <Select value={base} onChange={(e) => onBase(e.target.value)}>
          {options}
        </Select>
      </label>
      <ArrowRight aria-hidden="true" className="vr-pair-arrow" />
      <label className="vr-pick">
        <span className="vr-pick-role">{t("versions.compared")}</span>
        <Select value={head} onChange={(e) => onHead(e.target.value)}>
          {options}
        </Select>
      </label>
      <button type="button" className="btn ghost vr-swap" aria-label={t("versions.swap")} title={t("versions.swap")} onClick={onSwap}>
        <ArrowLeftRight aria-hidden="true" />
      </button>
    </div>
  );

  if (base === head)
    return (
      <header className="vr-head">
        <div className="vr-head-top">
          {pair}
          <h2>{t("versions.chooseTwo")}</h2>
        </div>
      </header>
    );
  if (!cmp)
    return (
      <>
        <header className="vr-head">
          <div className="vr-head-top">
            {pair}
            <h2>{t("versions.comparing")}</h2>
          </div>
        </header>
        <div className="vr-loading" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </>
    );

  const count = (k: Kind) => cmp.scenes.filter((s) => s.diff.kind === k).length;
  const changed = cmp.scenes.filter((s) => s.diff.kind !== "same");
  const totals = changed.reduce((t, s) => ({ added: t.added + s.added, removed: t.removed + s.removed }), { added: 0, removed: 0 });
  const heading = (s: ComparedScene) => (s.diff.right ?? s.diff.left)?.heading || t("dash.noHeading");
  const needle = search.trim().toLocaleLowerCase("fr");
  const shown = cmp.scenes
    .filter((s) => (filter === "all" ? true : filter === "changes" ? s.diff.kind !== "same" : s.diff.kind === filter))
    .filter((s) => !needle || heading(s).toLocaleLowerCase("fr").includes(needle));
  const toggle = (key: string) =>
    setClosed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allClosed = shown.length > 0 && shown.every((s) => closed.has(s.key));

  return (
    <>
      <header className="vr-head">
        <div className="vr-head-top">
          {pair}
          <h2>
            {changed.length === 0
              ? t("versions.nothingSince", { name: label(base) })
              : plural("versions.touchedSince", changed.length, { name: label(base) })}
          </h2>
        </div>
        <dl className="vr-figures">
          <Figure label={t("dash.scenes")} before={cmp.base.scenes.length} after={cmp.head.scenes.length} baseLabel={label(base)} />
          <Figure label={t("dash.pages")} before={cmp.base.pages} after={cmp.head.pages} baseLabel={label(base)} />
          {changed.length > 0 && (
            <div className="vr-figure">
              <dt>{t("versions.lines")}</dt>
              <dd className="vr-figure-value">
                <LineStat added={totals.added} removed={totals.removed} />
              </dd>
            </div>
          )}
        </dl>
      </header>

      {changed.length === 0 ? (
        <div className="vr-same">
          <span className="vr-same-icon" aria-hidden="true">
            <Check />
          </span>
          <p>
            {t("versions.same", { head: label(head), base: label(base) })}
          </p>
        </div>
      ) : (
        <>
          <div className="vr-bar">
            <div className="segmented" role="group" aria-label={t("versions.shownScenes")}>
              <button type="button" className={filter === "changes" ? "seg on" : "seg"} aria-pressed={filter === "changes"} onClick={() => setFilter("changes")}>
                {t("versions.changes")} <span className="vr-seg-n">{changed.length}</span>
              </button>
              {KINDS.filter((k) => count(k) > 0).map((k) => (
                <button key={k} type="button" className={filter === k ? "seg on" : "seg"} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  <span className={`vr-dot ${k}`} aria-hidden="true" />
                  {kindMany(k)} <span className="vr-seg-n">{count(k)}</span>
                </button>
              ))}
              <button type="button" className={filter === "all" ? "seg on" : "seg"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                {t("versions.all")} <span className="vr-seg-n">{cmp.scenes.length}</span>
              </button>
            </div>
            <span className="vr-bar-end">
              <input type="search" className="vr-search" placeholder={t("versions.search")} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("versions.searchLabel")} />
              <button
                type="button"
                className="btn ghost small"
                disabled={shown.length === 0}
                onClick={() => setClosed(allClosed ? new Set() : new Set(shown.map((s) => s.key)))}
              >
                {allClosed ? <ChevronsUpDown aria-hidden="true" /> : <ChevronsDownUp aria-hidden="true" />}
                {allClosed ? t("sceneList.unfold") : t("versions.foldAll")}
              </button>
            </span>
          </div>

          <div className="vr-files">
            {shown.length === 0 && <p className="vr-blank">{t("versions.noMatch", { query: search.trim() })}</p>}
            {shown.map((s) => (
              <SceneFile key={s.key} scene={s} heading={heading(s)} open={!closed.has(s.key)} onToggle={() => toggle(s.key)} baseLabel={label(base)} headLabel={label(head)} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** A count in the compared version, how far it moved, and what it was. */
function Figure({ label, before, after, baseLabel }: { label: string; before: number; after: number; baseLabel: string }) {
  const delta = after - before;
  return (
    <div className="vr-figure">
      <dt>{label}</dt>
      <dd className="vr-figure-value">
        {after}
        {delta !== 0 && <span className="vr-delta">{signed(delta)}</span>}
      </dd>
      <dd className="vr-figure-was">{delta === 0 ? t("versions.asIn", { name: baseLabel }) : t("versions.wasIn", { n: before, name: baseLabel })}</dd>
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

function SceneFile({
  scene,
  heading,
  open,
  onToggle,
  baseLabel,
  headLabel,
}: {
  scene: ComparedScene;
  heading: string;
  open: boolean;
  onToggle: () => void;
  baseLabel: string;
  headLabel: string;
}) {
  const [unfolded, setUnfolded] = useState<Set<number>>(new Set());
  const hunks = useMemo(() => foldLines(scene.lines), [scene.lines]);
  const kind = scene.diff.kind;

  return (
    <section className={`vr-file ${kind}`} aria-label={heading}>
      <header className="vr-file-head">
        <button type="button" className="vr-file-toggle" aria-expanded={open} onClick={onToggle}>
          <ChevronDown aria-hidden="true" />
          <span className="vr-file-num">{t("versions.sceneShort", { n: scene.number })}</span>
          <span className="vr-slug">{heading}</span>
        </button>
        <span className={`vr-kind ${kind}`}>{kindOne(kind)}</span>
        <span className="vr-file-end">{(scene.added > 0 || scene.removed > 0) && <LineStat added={scene.added} removed={scene.removed} />}</span>
      </header>
      {open && (
        <div className="vr-split" role="table" aria-label={t("versions.sides", { base: baseLabel, head: headLabel })}>
          <div className="vr-row vr-sides" role="row">
            <span className="vr-side-name" role="columnheader">
              {baseLabel}
            </span>
            <span className="vr-side-name" role="columnheader">
              {headLabel}
            </span>
          </div>
          {kind === "moved" && <div className="vr-split-note">{t("versions.moved")}</div>}
          {hunks.map((h, i) =>
            h.kind === "fold" && !unfolded.has(i) ? (
              <button key={i} type="button" className="vr-fold" onClick={() => setUnfolded(new Set(unfolded).add(i))}>
                <UnfoldVertical aria-hidden="true" />
                {plural("versions.showSame", h.lines.length)}
              </button>
            ) : (
              <Fragment key={i}>
                {h.lines.map((l, k) => (
                  <div key={k} className={`vr-row ${l.kind}`} role="row">
                    <Side side={l.left} kind={l.kind} which="left" />
                    <Side side={l.right} kind={l.kind} which="right" />
                  </div>
                ))}
              </Fragment>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function Side({ side, kind, which }: { side: LineSide | null; kind: DiffLine["kind"]; which: "left" | "right" }) {
  if (!side)
    return (
      <>
        <span className="vr-ln blank" role="cell" />
        <span className="vr-code blank" role="cell" />
      </>
    );
  const tone = kind === "same" ? "" : which === "left" ? " del" : " ins";
  return (
    <>
      <span className={`vr-ln${tone}`} role="cell">
        {side.n}
      </span>
      <span className={`vr-code${tone}`} role="cell">
        <span className="vr-sign" aria-hidden="true">
          {kind === "same" ? " " : which === "left" ? "−" : "+"}
        </span>
        {side.parts.every((p) => !p.text) ? (
          " "
        ) : kind === "changed" ? (
          side.parts.map((p, i) => (p.kind === "same" ? <span key={i}>{p.text}</span> : <mark key={i}>{p.text}</mark>))
        ) : (
          side.parts.map((p) => p.text).join("")
        )}
      </span>
    </>
  );
}
