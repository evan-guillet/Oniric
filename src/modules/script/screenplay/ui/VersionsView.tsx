import {
  ArrowLeft,
  ArrowLeftRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  FileDiff,
  GitCompareArrows,
  Lock,
  PenLine,
  Scissors,
  Undo2,
  UnfoldVertical,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
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

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const dayFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const CURRENT = "__current__";

type Tab = "history" | "versions" | "cuts" | "changes";

/** One scene of a comparison, with its lines facing each other. */
interface ComparedScene {
  key: string;
  diff: SceneDiff;
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
  const scenes = diffScenes(versionScenes(base), versionScenes(head)).map((d, i) => {
    const lines = diffLines(d.left?.text ?? "", d.right?.text ?? "");
    return { key: `${(d.right ?? d.left)!.id}-${i}`, diff: d, lines, ...lineStats(lines) };
  });
  return { base, head, scenes };
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Frozen versions, their comparison and the cut scenes [REE-01, REE-02, REE-06], laid out like a code review:
 * a reference version and a compared one, a history, the list of versions, and the changes side by side.
 */
export function VersionsView() {
  const { session, project, notify, prompt, ask, headerActions } = useProject();
  const versions = useLive(listVersions, ["script_version"]) ?? [];
  const cuts = useLive(cutScenes, ["scene"]) ?? [];
  const format = useScriptFormat();
  const [base, setBase] = useState("");
  const [head, setHead] = useState(CURRENT);
  const [tab, setTab] = useState<Tab>("history");
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    Promise.all([load(base), load(head)])
      .then(([a, b]) => live && setCmp(compareVersions(a, b)))
      .catch((e) => live && notify({ text: describeError(e), tone: "error" }))
      .finally(() => live && setLoading(false));
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

  const reinstateCut = (c: CutScene) => void reinstate(session, c).catch((e) => notify({ text: describeError(e), tone: "error" }));
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
  const row = (file: string) => versions.find((v) => v.file === file);
  const compareWith = (file: string) => {
    setBase(file);
    setHead(CURRENT);
    setTab("changes");
  };

  const changed = cmp?.scenes.filter((s) => s.diff.kind !== "same") ?? [];
  const totals = changed.reduce((t, s) => ({ added: t.added + s.added, removed: t.removed + s.removed }), { added: 0, removed: 0 });
  const baseRow = row(base);
  const headIsCurrent = head === CURRENT;

  const tabs: { id: Tab; label: string; icon: LucideIcon; count: number }[] = [
    { id: "history", label: "Historique", icon: Bookmark, count: versions.length + cuts.length },
    { id: "versions", label: "Versions", icon: GitCompareArrows, count: versions.length },
    { id: "cuts", label: "Scènes coupées", icon: Scissors, count: cuts.length },
    { id: "changes", label: "Modifications", icon: FileDiff, count: changed.length },
  ];

  return (
    <div className="view pad versions-view">
      {headerActions &&
        createPortal(
          <div className="header-tools" role="group" aria-label="Versions comparées">
            {versions.length > 0 && (
              <div className="vr-compare">
                <select value={base} onChange={(e) => setBase(e.target.value)} aria-label="Version de référence" title="Version de référence">
                  {versions.map((v) => (
                    <option key={v.id} value={v.file}>
                      {v.name}
                    </option>
                  ))}
                  <option value={CURRENT}>Version actuelle</option>
                </select>
                <ArrowLeft aria-hidden="true" className="vr-compare-arrow" />
                <select value={head} onChange={(e) => setHead(e.target.value)} aria-label="Version comparée" title="Version comparée">
                  <option value={CURRENT}>Version actuelle</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.file}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn ghost vr-icon-btn"
                  aria-label="Inverser les deux versions"
                  title="Inverser les deux versions"
                  onClick={() => {
                    setBase(head);
                    setHead(base);
                  }}
                >
                  <ArrowLeftRight aria-hidden="true" />
                </button>
              </div>
            )}
            <button type="button" className="btn primary" onClick={() => void freeze()}>
              <Lock aria-hidden="true" />
              Figer la version actuelle…
            </button>
          </div>,
          headerActions,
        )}

      <header className="vr-title">
        <h1>
          {versions.length === 0 ? (
            "Version actuelle"
          ) : (
            <>
              {label(head)} <span className="vr-title-vs">comparée à</span> {label(base)}
            </>
          )}
        </h1>
        <div className="vr-meta">
          <span className={headIsCurrent ? "vr-state open" : "vr-state frozen"}>
            {headIsCurrent ? <PenLine aria-hidden="true" /> : <Lock aria-hidden="true" />}
            {headIsCurrent ? "En cours" : "Figée"}
          </span>
          {versions.length === 0 ? (
            <span>Aucune version figée pour l'instant : figez-en une avant chaque grande réécriture.</span>
          ) : base === head ? (
            <span>Choisissez deux versions différentes à comparer.</span>
          ) : (
            <span>
              {cmp ? <strong>{plural(changed.length, "scène modifiée", "scènes modifiées")}</strong> : "Comparaison…"} dans <span className="vr-ref">{label(head)}</span> depuis{" "}
              <span className="vr-ref">{label(base)}</span>
              {baseRow && <> · figée le {dateFormat.format(new Date(baseRow.createdAt))}</>}
            </span>
          )}
        </div>
      </header>

      <div className="vr-tabs-row">
        <div className="vr-tabs" role="tablist" aria-label="Sections des versions">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "vr-tab on" : "vr-tab"} onClick={() => setTab(t.id)}>
              <t.icon aria-hidden="true" />
              {t.label}
              <span className="vr-count">{t.count}</span>
            </button>
          ))}
        </div>
        {cmp && changed.length > 0 && (
          <span className="vr-tabs-stat" title={`${totals.added} lignes ajoutées, ${totals.removed} lignes retirées`}>
            <DiffStat added={totals.added} removed={totals.removed} />
          </span>
        )}
      </div>

      <div role="tabpanel" className="vr-panel">
        {tab === "history" && (
          <HistoryTab
            versions={versions}
            cuts={cuts}
            cmp={base !== head ? cmp : null}
            loading={loading}
            changed={changed.length}
            baseLabel={label(base)}
            headLabel={label(head)}
            onCompare={compareWith}
            onShowChanges={() => setTab("changes")}
            onReinstate={reinstateCut}
          />
        )}
        {tab === "versions" && <VersionsTab versions={versions} onCompare={compareWith} onRestore={(v) => void restore(v)} onRemove={(v) => void remove(v)} notify={notify} />}
        {tab === "cuts" && <CutsTab cuts={cuts} onReinstate={reinstateCut} onPurge={(c) => void purgeCut(c)} />}
        {tab === "changes" &&
          (versions.length === 0 ? (
            <p className="vr-blank">Figez une première version : ses modifications apparaîtront ici, scène par scène.</p>
          ) : base === head ? (
            <p className="vr-blank">Choisissez deux versions différentes en haut de la fenêtre.</p>
          ) : !cmp ? (
            <p className="vr-blank">Comparaison en cours…</p>
          ) : (
            <ChangesTab key={`${base}|${head}`} cmp={cmp} baseLabel={label(base)} headLabel={label(head)} />
          ))}
      </div>
    </div>
  );
}

/** Proportion of added and removed lines, in five squares. */
function DiffStat({ added, removed }: { added: number; removed: number }) {
  const total = added + removed;
  const filled = Math.min(5, total);
  const green = total ? Math.round((filled * added) / total) : 0;
  return (
    <span className="vr-diffstat">
      <span className="vr-plus">+{added}</span>
      <span className="vr-minus">−{removed}</span>
      <span className="vr-blocks" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} className={i < green ? "add" : i < filled ? "del" : ""} />
        ))}
      </span>
    </span>
  );
}

type HistoryEvent = { at: string; version: VersionRow } | { at: string; cut: CutScene };

function HistoryTab({
  versions,
  cuts,
  cmp,
  loading,
  changed,
  baseLabel,
  headLabel,
  onCompare,
  onShowChanges,
  onReinstate,
}: {
  versions: VersionRow[];
  cuts: CutScene[];
  cmp: Comparison | null;
  loading: boolean;
  changed: number;
  baseLabel: string;
  headLabel: string;
  onCompare: (file: string) => void;
  onShowChanges: () => void;
  onReinstate: (c: CutScene) => void;
}) {
  const events: HistoryEvent[] = [...versions.map((v) => ({ at: v.createdAt, version: v })), ...cuts.map((c) => ({ at: c.deletedAt, cut: c }))].sort((a, b) =>
    a.at.localeCompare(b.at),
  );

  return (
    <div className="vr-conv">
      <div className="vr-conv-main">
        {events.length === 0 ? (
          <div className="vr-intro">
            <h2>L'histoire du scénario commence ici</h2>
            <p>
              Une version figée est une copie datée du scénario, rangée dans le dossier « versions » du projet avec son empreinte. Rien ne la modifie ensuite : vous pouvez
              toujours la comparer à la version actuelle ou y revenir.
            </p>
          </div>
        ) : (
          <ol className="vr-timeline">
            {events.map((e) =>
              "version" in e ? (
                <li key={e.version.id} className="vr-event">
                  <span className="vr-node version" aria-hidden="true">
                    <Lock />
                  </span>
                  <div className="vr-event-body">
                    <p>
                      <strong>{e.version.name}</strong> figée <span className="muted">· {dateFormat.format(new Date(e.version.createdAt))}</span>
                    </p>
                    <p className="vr-event-sub">
                      {plural(e.version.pages, "page", "pages")} · {plural(e.version.scenes, "scène", "scènes")}
                      <span className="vr-sha" title={`SHA-256 ${e.version.sha256}`}>
                        {e.version.sha256.slice(0, 7)}
                      </span>
                    </p>
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => onCompare(e.version.file)}>
                    <GitCompareArrows aria-hidden="true" />
                    Comparer
                  </button>
                </li>
              ) : (
                <li key={e.cut.id} className="vr-event minor">
                  <span className="vr-node cut" aria-hidden="true">
                    <Scissors />
                  </span>
                  <div className="vr-event-body">
                    <p>
                      Scène <strong>{e.cut.heading || "(sans en-tête)"}</strong> coupée <span className="muted">· {dateFormat.format(new Date(e.cut.deletedAt))}</span>
                    </p>
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => onReinstate(e.cut)}>
                    <Undo2 aria-hidden="true" />
                    Réintégrer
                  </button>
                </li>
              ),
            )}
          </ol>
        )}

        <section className="vr-status" aria-label="État de la comparaison">
          <div className="vr-status-row">
            <span className={`vr-status-icon ${cmp && changed === 0 ? "ok" : "neutral"}`} aria-hidden="true">
              {cmp && changed === 0 ? <Check /> : <FileDiff />}
            </span>
            <div>
              <h3>
                {versions.length === 0
                  ? "Aucune version figée"
                  : !cmp
                    ? loading
                      ? "Comparaison en cours…"
                      : "Rien à comparer"
                    : changed === 0
                      ? `Rien n'a changé depuis ${baseLabel}`
                      : `${plural(changed, "scène a changé", "scènes ont changé")} depuis ${baseLabel}`}
              </h3>
              <p className="muted">
                {versions.length === 0
                  ? "Figez la version actuelle pour garder une trace de cette étape du scénario."
                  : cmp
                    ? `${headLabel} : ${plural(cmp.head.pages, "page", "pages")}, ${plural(cmp.head.scenes.length, "scène", "scènes")} — ${baseLabel} : ${plural(cmp.base.pages, "page", "pages")}, ${plural(cmp.base.scenes.length, "scène", "scènes")}.`
                    : "Choisissez deux versions différentes en haut de la fenêtre."}
              </p>
            </div>
          </div>
          <div className="vr-status-row">
            <span className="vr-status-icon ok" aria-hidden="true">
              <CircleCheck />
            </span>
            <div>
              <h3>Tout est enregistré</h3>
              <p className="muted">Le scénario s'enregistre tout seul ; figer une version en garde une copie que rien ne modifie.</p>
            </div>
          </div>
          {cmp && changed > 0 && (
            <div className="vr-status-foot">
              <button type="button" className="btn" onClick={onShowChanges}>
                <FileDiff aria-hidden="true" />
                Voir les modifications
              </button>
            </div>
          )}
        </section>
      </div>

      <aside className="vr-side" aria-label="Résumé de la comparaison">
        <dl>
          <div>
            <dt>Référence</dt>
            <dd>{versions.length ? <span className="vr-ref">{baseLabel}</span> : <span className="muted">Aucune</span>}</dd>
          </div>
          <div>
            <dt>Comparée</dt>
            <dd>
              <span className="vr-ref">{headLabel}</span>
            </dd>
          </div>
          {cmp && (
            <>
              <div>
                <dt>Pages</dt>
                <dd className="vr-delta">
                  {cmp.base.pages} <ArrowLeft aria-hidden="true" className="flip" /> {cmp.head.pages}
                </dd>
              </div>
              <div>
                <dt>Scènes</dt>
                <dd className="vr-delta">
                  {cmp.base.scenes.length} <ArrowLeft aria-hidden="true" className="flip" /> {cmp.head.scenes.length}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>Versions figées</dt>
            <dd>{versions.length}</dd>
          </div>
          <div>
            <dt>Scènes coupées</dt>
            <dd>{cuts.length}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

function VersionsTab({
  versions,
  onCompare,
  onRestore,
  onRemove,
  notify,
}: {
  versions: VersionRow[];
  onCompare: (file: string) => void;
  onRestore: (v: VersionRow) => void;
  onRemove: (v: VersionRow) => void;
  notify: (n: { text: string }) => void;
}) {
  if (versions.length === 0) return <p className="vr-blank">Aucune version figée pour l'instant. Figez une version avant chaque grande réécriture (V1, V2, « version producteur »…).</p>;
  const days: { day: string; items: VersionRow[] }[] = [];
  for (const v of versions) {
    const day = dayFormat.format(new Date(v.createdAt));
    if (days[days.length - 1]?.day === day) days[days.length - 1].items.push(v);
    else days.push({ day, items: [v] });
  }
  return (
    <div className="vr-days">
      {days.map((d) => (
        <section key={d.day} className="vr-day">
          <h2 className="vr-day-head">
            <span className="vr-node small" aria-hidden="true" />
            Versions du {d.day}
          </h2>
          <ul className="vr-list">
            {d.items.map((v) => (
              <li key={v.id}>
                <div className="vr-list-main">
                  <strong>{v.name}</strong>
                  <span className="muted small">
                    figée à {new Date(v.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {plural(v.pages, "page", "pages")} ·{" "}
                    {plural(v.scenes, "scène", "scènes")}
                  </span>
                </div>
                <span className="vr-sha-group">
                  <span className="vr-sha" title={`SHA-256 ${v.sha256}`}>
                    {v.sha256.slice(0, 7)}
                  </span>
                  <button
                    type="button"
                    className="btn ghost vr-icon-btn small"
                    aria-label={`Copier l'empreinte de ${v.name}`}
                    title="Copier l'empreinte"
                    onClick={() => void navigator.clipboard.writeText(v.sha256).then(() => notify({ text: "Empreinte copiée." }))}
                  >
                    <Copy aria-hidden="true" />
                  </button>
                </span>
                <span className="row-actions">
                  <button type="button" className="btn small" onClick={() => onCompare(v.file)}>
                    <GitCompareArrows aria-hidden="true" />
                    Comparer
                  </button>
                  <button type="button" className="btn small" onClick={() => onRestore(v)}>
                    <Undo2 aria-hidden="true" />
                    Revenir à cette version
                  </button>
                  <button type="button" className="btn ghost vr-icon-btn small" aria-label={`Retirer ${v.name} de la liste`} title="Retirer de la liste" onClick={() => onRemove(v)}>
                    <X aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CutsTab({ cuts, onReinstate, onPurge }: { cuts: CutScene[]; onReinstate: (c: CutScene) => void; onPurge: (c: CutScene) => void }) {
  return (
    <section className="vr-box">
      <header className="vr-box-head">
        <h2>{cuts.length === 0 ? "Aucune scène coupée" : plural(cuts.length, "scène coupée", "scènes coupées")}</h2>
        <p className="muted small">Une scène retirée du scénario n'est jamais effacée tout de suite : elle attend ici, prête à être réintégrée.</p>
      </header>
      {cuts.length > 0 && (
        <ul className="vr-list flush">
          {cuts.map((c) => (
            <li key={c.id}>
              <span className="vr-node cut" aria-hidden="true">
                <Scissors />
              </span>
              <div className="vr-list-main">
                <strong>{c.heading || "(sans en-tête)"}</strong>
                <span className="muted small">coupée le {dateFormat.format(new Date(c.deletedAt))}</span>
              </div>
              <span className="row-actions">
                <button type="button" className="btn small" onClick={() => onReinstate(c)}>
                  <Undo2 aria-hidden="true" />
                  Réintégrer
                </button>
                <button type="button" className="btn ghost small danger" onClick={() => onPurge(c)}>
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const KIND_LABEL: Record<SceneDiff["kind"], string> = { same: "identique", changed: "modifiée", added: "ajoutée", removed: "supprimée", moved: "déplacée" };

function ChangesTab({ cmp, baseLabel, headLabel }: { cmp: Comparison; baseLabel: string; headLabel: string }) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [search, setSearch] = useState("");
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const shown = cmp.scenes.filter((s) => !onlyChanges || s.diff.kind !== "same");
  const changedCount = cmp.scenes.filter((s) => s.diff.kind !== "same").length;
  const heading = (s: ComparedScene) => (s.diff.right ?? s.diff.left)?.heading || "(sans en-tête)";
  const needle = search.trim().toLocaleLowerCase("fr");
  const listed = needle ? shown.filter((s) => heading(s).toLocaleLowerCase("fr").includes(needle)) : shown;
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const viewedShown = shown.filter((s) => viewed.has(s.key)).length;

  return (
    <div className="vr-files">
      <aside className="vr-tree" aria-label="Scènes comparées">
        <input type="search" placeholder="Filtrer les scènes…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filtrer les scènes" />
        <ul>
          {listed.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                className={viewed.has(s.key) ? "viewed" : ""}
                onClick={() => document.getElementById(`vr-scene-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <span className={`vr-dot ${s.diff.kind}`} aria-hidden="true" />
                <span className="vr-tree-name">{heading(s)}</span>
                {viewed.has(s.key) && <Check aria-label="vue" className="vr-tree-check" />}
              </button>
            </li>
          ))}
          {listed.length === 0 && <li className="muted small vr-tree-none">Aucune scène.</li>}
        </ul>
      </aside>

      <div className="vr-files-main">
        <div className="vr-files-bar">
          <label className="choice small">
            <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Seulement les scènes modifiées
          </label>
          <span className="vr-files-bar-end">
            <span className="vr-progress" title="Scènes marquées comme vues">
              <span className="vr-progress-ring" style={{ ["--p" as string]: shown.length ? viewedShown / shown.length : 0 }} aria-hidden="true" />
              {viewedShown} / {shown.length} vues
            </span>
            <button type="button" className="btn ghost small" onClick={() => setClosed(closed.size ? new Set() : new Set(shown.map((s) => s.key)))}>
              {closed.size ? "Tout déplier" : "Tout replier"}
            </button>
          </span>
        </div>

        {shown.length === 0 && <p className="vr-blank">{changedCount === 0 ? `Aucune différence entre ${baseLabel} et ${headLabel}.` : "Aucune scène."}</p>}
        {shown.map((s) => (
          <SceneFile
            key={s.key}
            scene={s}
            heading={heading(s)}
            open={!closed.has(s.key)}
            viewed={viewed.has(s.key)}
            onToggle={() => setClosed(toggle(closed, s.key))}
            onViewed={() => {
              const was = viewed.has(s.key);
              setViewed(toggle(viewed, s.key));
              // A scene marked as viewed folds away, as in a code review; unmarking it opens it again.
              setClosed((c) => {
                const next = new Set(c);
                if (was) next.delete(s.key);
                else next.add(s.key);
                return next;
              });
            }}
            baseLabel={baseLabel}
            headLabel={headLabel}
          />
        ))}
      </div>
    </div>
  );
}

function SceneFile({
  scene,
  heading,
  open,
  viewed,
  onToggle,
  onViewed,
  baseLabel,
  headLabel,
}: {
  scene: ComparedScene;
  heading: string;
  open: boolean;
  viewed: boolean;
  onToggle: () => void;
  onViewed: () => void;
  baseLabel: string;
  headLabel: string;
}) {
  const [unfolded, setUnfolded] = useState<Set<number>>(new Set());
  const hunks = useMemo(() => foldLines(scene.lines), [scene.lines]);
  const kind = scene.diff.kind;

  return (
    <section id={`vr-scene-${scene.key}`} className={`vr-file ${kind}${viewed ? " viewed" : ""}`} aria-label={heading}>
      <header className="vr-file-head">
        <button type="button" className="vr-file-toggle" aria-expanded={open} aria-label={open ? "Replier la scène" : "Déplier la scène"} onClick={onToggle}>
          <ChevronDown aria-hidden="true" />
        </button>
        <span className="vr-file-name">{heading}</span>
        <span className={`vr-kind ${kind}`}>{KIND_LABEL[kind]}</span>
        <span className="vr-file-end">
          {(scene.added > 0 || scene.removed > 0) && <DiffStat added={scene.added} removed={scene.removed} />}
          <label className={viewed ? "vr-viewed on" : "vr-viewed"}>
            <input type="checkbox" checked={viewed} onChange={onViewed} />
            <span className="vr-viewed-box" aria-hidden="true">
              <Check />
            </span>
            Vue
          </label>
        </span>
      </header>
      {open && (
        <div className="vr-split" role="table" aria-label={`${baseLabel} à gauche, ${headLabel} à droite`}>
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
          " "
        ) : kind === "changed" ? (
          side.parts.map((p, i) => (p.kind === "same" ? <span key={i}>{p.text}</span> : <mark key={i}>{p.text}</mark>))
        ) : (
          side.parts.map((p) => p.text).join("")
        )}
      </span>
    </>
  );
}
