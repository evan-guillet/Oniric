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
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const shortFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");

const KIND_LABEL: Record<Kind, [string, string]> = {
  same: ["identique", "identiques"],
  changed: ["modifiée", "modifiées"],
  added: ["ajoutée", "ajoutées"],
  removed: ["supprimée", "supprimées"],
  moved: ["déplacée", "déplacées"],
};
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
    const name = await prompt("Figer la version actuelle", "Nom de la version", `V${versions.length + 1}`);
    if (!name) return;
    try {
      await session.flush();
      const v = await freezeVersion(await currentVersion(session, project.title, format ?? formatById(null), await readTitlePage(), name));
      notify({ text: `Version « ${v.name} » figée dans le dossier versions du projet.` });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const restore = async (v: VersionRow) => {
    const c = await ask({
      title: `Revenir à « ${v.name} » ?`,
      text: <p>Le scénario actuel est remplacé par cette version. Ctrl+Z dans le scénario permet de revenir en arrière ; pensez à figer la version actuelle avant si vous voulez la garder.</p>,
      cancel: "Annuler",
      choices: [{ label: "Revenir à cette version", value: "y", primary: true }],
    });
    if (c !== "y") return;
    try {
      const file = await readVersion(v.file);
      session.editor?.restoreScenes(file.scenes.map((s) => ({ id: s.id, content: s.content })));
      await session.flush();
      notify({ text: `Scénario revenu à « ${v.name} ».` });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const remove = async (v: VersionRow) => {
    const c = await ask({
      title: `Retirer « ${v.name} » de la liste ?`,
      text: <p>Le fichier reste dans le dossier « versions » du projet.</p>,
      cancel: "Annuler",
      choices: [{ label: "Retirer", value: "y", danger: true }],
    });
    if (c === "y") await deleteVersionRow(v.id);
  };

  const reinstateCut = (c: CutScene) =>
    void reinstate(session, c)
      .then(() => notify({ text: `Scène « ${c.heading || "sans en-tête"} » réintégrée dans le scénario.` }))
      .catch((e) => notify({ text: describeError(e), tone: "error" }));
  const purgeCut = async (c: CutScene) => {
    const x = await ask({
      title: "Supprimer définitivement ?",
      text: <p>La scène « {c.heading || "sans en-tête"} » sera effacée du projet. Les versions figées qui la contiennent la gardent.</p>,
      cancel: "Annuler",
      choices: [{ label: "Supprimer définitivement", value: "y", danger: true }],
    });
    if (x === "y") await purgeScene(c.id);
  };

  const label = (file: string) => (file === CURRENT ? "Version actuelle" : (versions.find((v) => v.file === file)?.name ?? file));
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
              Figer la version actuelle
            </button>
          </div>,
          headerActions,
        )}

      <aside className="vr-rail" aria-label="Fil des versions">
        <h2 className="vr-rail-title">
          Versions
          {versions.length > 0 && <span className="count">{versions.length}</span>}
        </h2>
        <ol className="vr-thread">
          <li className={`vr-stop current${head === CURRENT ? " head" : ""}${base === CURRENT ? " base" : ""}`}>
            <span className="vr-node" aria-hidden="true">
              <PenLine />
            </span>
            <button type="button" className="vr-stop-main" aria-pressed={head === CURRENT} onClick={() => pick(CURRENT)}>
              <span className="vr-stop-title">
                <span className="vr-stop-name">Version actuelle</span>
                <RoleTag file={CURRENT} base={base} head={head} />
              </span>
              <span className="vr-stop-meta">
                <span className="vr-live">En cours</span>
                {current ? ` · ${plural(current.pages, "page", "pages")} · ${plural(current.scenes.length, "scène", "scènes")}` : " · s'enregistre à chaque frappe"}
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
                <button type="button" className="vr-stop-main" aria-pressed={v.file === base} onClick={() => pick(v.file)} title={`Voir ce qui a changé depuis ${v.name}`}>
                  <span className="vr-stop-title">
                    <span className="vr-stop-name">{v.name}</span>
                    <RoleTag file={v.file} base={base} head={head} />
                  </span>
                  <span className="vr-stop-meta">{dateFormat.format(new Date(v.createdAt))}</span>
                  <span className="vr-stop-meta">
                    {plural(v.pages, "page", "pages")} · {plural(v.scenes, "scène", "scènes")}
                    {older && v.scenes !== older.scenes && <span className="vr-gain"> ({signed(v.scenes - older.scenes)})</span>}
                  </span>
                </button>
                <MoreMenu
                  label={`Actions pour ${v.name}`}
                  className="vr-stop-more"
                  items={[
                    { label: "Revenir à cette version", icon: Undo2, onClick: () => void restore(v) },
                    {
                      label: "Copier l'empreinte",
                      icon: Copy,
                      onClick: () => void navigator.clipboard.writeText(v.sha256).then(() => notify({ text: "Empreinte copiée : elle prouve que le fichier n'a pas changé." })),
                    },
                    { label: "Retirer de la liste", icon: X, danger: true, onClick: () => void remove(v) },
                  ]}
                />
              </li>
            );
          })}
        </ol>

        <section className="vr-cuts" aria-labelledby="vr-cuts-title">
          <h2 id="vr-cuts-title" className="vr-rail-title">
            Scènes coupées
            {cuts.length > 0 && <span className="count">{cuts.length}</span>}
          </h2>
          {cuts.length === 0 && <p className="vr-cuts-note">Une scène supprimée du scénario attend ici avant d'être effacée.</p>}
          {cuts.length > 0 && (
            <ul className="vr-cut-list">
              {cuts.map((c) => (
                <li key={c.id} className="vr-cut">
                  <span className="vr-slug">{c.heading || "(sans en-tête)"}</span>
                  <span className="vr-stop-meta" title={`Coupée le ${dateFormat.format(new Date(c.deletedAt))}`}>
                    {shortDate(c.deletedAt)}
                  </span>
                  <button type="button" className="btn ghost small vr-cut-back" onClick={() => reinstateCut(c)}>
                    <Undo2 aria-hidden="true" />
                    Réintégrer
                  </button>
                  <MoreMenu label={`Actions pour la scène coupée ${c.heading}`} items={[{ label: "Supprimer définitivement", icon: Trash2, danger: true, onClick: () => void purgeCut(c) }]} />
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
  if (file === base) return <span className="vr-role">Référence</span>;
  if (file === head) return <span className="vr-role head">Comparée</span>;
  return null;
}

/** Before the first frozen version: what freezing does, with a glimpse of a comparison. */
function FirstVersion() {
  return (
    <div className="vr-first">
      <h2>Gardez une trace de chaque étape du scénario</h2>
      <p>
        Figer une version range une copie datée du scénario dans le dossier « versions » du projet. Rien ne la modifie ensuite : vous verrez ce qui a changé depuis, scène par
        scène, et vous pourrez toujours y revenir.
      </p>
      <p className="vr-first-when">Les bons moments : avant une grande réécriture, avant d'envoyer le scénario à quelqu'un, à la fin d'un jet.</p>
      <figure className="vr-first-sample" aria-label="Exemple de comparaison">
        <div className="vr-file-head">
          <span className="vr-file-num">Scè. 12</span>
          <span className="vr-slug">INT. HANGAR — NUIT</span>
          <span className="vr-kind changed">modifiée</span>
        </div>
        <div className="vr-split" aria-hidden="true">
          <span className="vr-ln">1</span>
          <span className="vr-code">
            <span className="vr-sign"> </span>Lia pousse la porte du hangar.
          </span>
          <span className="vr-ln">1</span>
          <span className="vr-code">
            <span className="vr-sign"> </span>Lia pousse la porte du hangar.
          </span>
          <span className="vr-ln del">2</span>
          <span className="vr-code del">
            <span className="vr-sign">−</span>Le vaisseau <mark>dort</mark> sous une bâche.
          </span>
          <span className="vr-ln ins">2</span>
          <span className="vr-code ins">
            <span className="vr-sign">+</span>Le vaisseau <mark>l'attend</mark> sous une bâche.
          </span>
        </div>
        <figcaption>La version figée à gauche, la version actuelle à droite.</figcaption>
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
      <option value={CURRENT}>Version actuelle</option>
      {versions.map((v) => (
        <option key={v.id} value={v.file}>
          {v.name}
        </option>
      ))}
    </>
  );
  const pair = (
    <div className="vr-pair" role="group" aria-label="Versions comparées">
      <label className="vr-pick">
        <span className="vr-pick-role">Référence</span>
        <Select value={base} onChange={(e) => onBase(e.target.value)}>
          {options}
        </Select>
      </label>
      <ArrowRight aria-hidden="true" className="vr-pair-arrow" />
      <label className="vr-pick">
        <span className="vr-pick-role">Comparée</span>
        <Select value={head} onChange={(e) => onHead(e.target.value)}>
          {options}
        </Select>
      </label>
      <button type="button" className="btn ghost vr-swap" aria-label="Inverser les deux versions" title="Inverser les deux versions" onClick={onSwap}>
        <ArrowLeftRight aria-hidden="true" />
      </button>
    </div>
  );

  if (base === head)
    return (
      <header className="vr-head">
        <div className="vr-head-top">
          {pair}
          <h2>Choisissez deux versions différentes</h2>
        </div>
      </header>
    );
  if (!cmp)
    return (
      <>
        <header className="vr-head">
          <div className="vr-head-top">
            {pair}
            <h2>Comparaison en cours…</h2>
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
  const heading = (s: ComparedScene) => (s.diff.right ?? s.diff.left)?.heading || "(sans en-tête)";
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
              ? `Rien n'a changé depuis ${label(base)}`
              : `${plural(changed.length, "scène touchée", "scènes touchées")} depuis ${label(base)}`}
          </h2>
        </div>
        <dl className="vr-figures">
          <Figure label="Scènes" before={cmp.base.scenes.length} after={cmp.head.scenes.length} baseLabel={label(base)} />
          <Figure label="Pages" before={cmp.base.pages} after={cmp.head.pages} baseLabel={label(base)} />
          {changed.length > 0 && (
            <div className="vr-figure">
              <dt>Lignes</dt>
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
            {label(head)} et {label(base)} ont exactement le même texte, scène pour scène.
          </p>
        </div>
      ) : (
        <>
          <div className="vr-bar">
            <div className="segmented" role="group" aria-label="Scènes affichées">
              <button type="button" className={filter === "changes" ? "seg on" : "seg"} aria-pressed={filter === "changes"} onClick={() => setFilter("changes")}>
                Modifications <span className="vr-seg-n">{changed.length}</span>
              </button>
              {KINDS.filter((k) => count(k) > 0).map((k) => (
                <button key={k} type="button" className={filter === k ? "seg on" : "seg"} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  <span className={`vr-dot ${k}`} aria-hidden="true" />
                  {KIND_LABEL[k][1].replace(/^./, (c) => c.toUpperCase())} <span className="vr-seg-n">{count(k)}</span>
                </button>
              ))}
              <button type="button" className={filter === "all" ? "seg on" : "seg"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                Tout le scénario <span className="vr-seg-n">{cmp.scenes.length}</span>
              </button>
            </div>
            <span className="vr-bar-end">
              <input type="search" className="vr-search" placeholder="Chercher une scène…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Chercher une scène" />
              <button
                type="button"
                className="btn ghost small"
                disabled={shown.length === 0}
                onClick={() => setClosed(allClosed ? new Set() : new Set(shown.map((s) => s.key)))}
              >
                {allClosed ? <ChevronsUpDown aria-hidden="true" /> : <ChevronsDownUp aria-hidden="true" />}
                {allClosed ? "Tout déplier" : "Tout replier"}
              </button>
            </span>
          </div>

          <div className="vr-files">
            {shown.length === 0 && <p className="vr-blank">Aucune scène ne correspond à « {search.trim()} ».</p>}
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
      <dd className="vr-figure-was">{delta === 0 ? `Comme dans ${baseLabel}` : `${before} dans ${baseLabel}`}</dd>
    </div>
  );
}

function LineStat({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="vr-linestat" title={`${plural(added, "ligne ajoutée", "lignes ajoutées")}, ${plural(removed, "ligne retirée", "lignes retirées")}`}>
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
          <span className="vr-file-num">Scè. {scene.number}</span>
          <span className="vr-slug">{heading}</span>
        </button>
        <span className={`vr-kind ${kind}`}>{KIND_LABEL[kind][0]}</span>
        <span className="vr-file-end">{(scene.added > 0 || scene.removed > 0) && <LineStat added={scene.added} removed={scene.removed} />}</span>
      </header>
      {open && (
        <div className="vr-split" role="table" aria-label={`${baseLabel} à gauche, ${headLabel} à droite`}>
          <div className="vr-row vr-sides" role="row">
            <span className="vr-side-name" role="columnheader">
              {baseLabel}
            </span>
            <span className="vr-side-name" role="columnheader">
              {headLabel}
            </span>
          </div>
          {kind === "moved" && <div className="vr-split-note">La scène a changé de place ; son texte est identique.</div>}
          {hunks.map((h, i) =>
            h.kind === "fold" && !unfolded.has(i) ? (
              <button key={i} type="button" className="vr-fold" onClick={() => setUnfolded(new Set(unfolded).add(i))}>
                <UnfoldVertical aria-hidden="true" />
                Afficher {plural(h.lines.length, "ligne identique", "lignes identiques")}
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
