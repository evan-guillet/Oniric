import { Download, Lock, LockOpen, Palette, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { describeError } from "../../../../core/errors";
import { dateFormat, plural, t } from "../../../../core/i18n";
import { confirmRemoval } from "../../../../ui-kit/Dialog";
import { Select } from "../../../../ui-kit/Select";
import { useProject } from "../../../project/ui/projectContext";
import { Field } from "../../../production/ui/parts";
import { useScriptFormat } from "../../screenplay/application/formatSettings";
import { lockScript, startRevision, unlockScript, useLock } from "../../screenplay/application/lock";
import { useScenes } from "../../screenplay/application/scriptSession";
import { readTitlePage } from "../../screenplay/application/titlePageSettings";
import { currentVersion, freezeVersion } from "../../screenplay/application/versions";
import { formatById } from "../../screenplay/domain/formats";
import { REVISION_COLORS, REVISION_TINTS, revisedElements } from "../../screenplay/domain/lock";
import { exportScreenplayPdf } from "../../screenplay/ui/screenplayExport";
import { addItems, deleteItem, itemsOf, updateItem, useItems, type Item } from "../application/items";
import { Help } from "./fields";

interface Request {
  from: string;
  what: string;
  due: string;
  scenes: string[];
  done: boolean;
}

const date = (iso: string) => dateFormat({ dateStyle: "long" }).format(new Date(iso));

/** Step 9: the rewriting asked for, then the passage into preproduction: the locked script and its revisions [DEV-01, DEV-02, REE-07]. */
export function StepDevelopment() {
  const items = useItems();
  return (
    <div className="step-body">
      <Requests list={itemsOf<Request>(items, "request")} />
      <Locking />
    </div>
  );
}

function Requests({ list }: { list: Item<Request>[] }) {
  const { session, ask, notify, openScene } = useProject();
  const scenes = useScenes(session);
  const scene = new Map(scenes.map((s) => [s.id, s]));
  const today = new Date().toISOString().slice(0, 10);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const open = list.filter((r) => !r.data.done);
  return (
    <section className="step-section">
      <h3>{t("development.requests")}</h3>
      <Help>{t("development.requestsHelp")}</Help>
      {list.length > 0 && <p className="muted small">{t("development.requestsCount", { open: open.length, total: list.length })}</p>}
      {list.length > 0 && (
        <ul className="ws-cards">
          {list.map((r) => {
            const set = (p: Partial<Request>) => void updateItem(r, p).catch(fail);
            const late = !r.data.done && r.data.due && r.data.due < today;
            return (
              <li key={r.id} className={["ws-card", r.data.done && "done", late && "late"].filter(Boolean).join(" ")}>
                <div className="ws-card-grid">
                  <Field label={t("development.from")} value={r.data.from} placeholder={t("development.fromPlaceholder")} onCommit={(v) => set({ from: v })} />
                  <Field label={t("development.due")} type="date" value={r.data.due} onCommit={(v) => set({ due: v })} />
                  <Field label={t("development.what")} className="wide" multiline value={r.data.what} onCommit={(v) => set({ what: v })} />
                </div>
                <div className="ws-req-scenes">
                  {r.data.scenes.map((id) => {
                    const s = scene.get(id);
                    return (
                      <span key={id} className="pr-chip">
                        <button type="button" className="pr-link" disabled={!s} onClick={() => s && openScene(id)}>
                          {s ? `${s.number}. ${s.heading || t("workspace.noHeading")}` : t("feedback.sceneGone")}
                        </button>
                        <button type="button" className="btn tiny ghost" aria-label={t("development.unlinkScene")} title={t("development.unlinkScene")} onClick={() => set({ scenes: r.data.scenes.filter((x) => x !== id) })}>
                          <X aria-hidden="true" />
                        </button>
                      </span>
                    );
                  })}
                  <Select
                    value=""
                    aria-label={t("development.linkScene")}
                    onChange={(e) => e.target.value && set({ scenes: [...new Set([...r.data.scenes, e.target.value])] })}
                  >
                    <option value="">{t("development.linkScene")}</option>
                    {scenes
                      .filter((s) => !r.data.scenes.includes(s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.number}. {s.heading || t("workspace.noHeading")}
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="ws-card-foot">
                  <label className="choice">
                    <input type="checkbox" checked={r.data.done} onChange={(e) => set({ done: e.target.checked })} />
                    {t("development.done")}
                  </label>
                  {late && <span className="badge warn">{t("development.late")}</span>}
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn small ghost danger"
                    onClick={async () => {
                      if (await confirmRemoval(ask, { title: t("development.deleteRequest"), text: t("development.deleteRequestText") })) void deleteItem(r).catch(fail);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    {t("common.delete")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn" onClick={() => void addItems("request", list, [{ from: "", what: "", due: "", scenes: [], done: false }]).catch(fail)}>
        <Plus aria-hidden="true" />
        {t("development.addRequest")}
      </button>
    </section>
  );
}

/** Locking the script for preproduction, and the coloured revisions that follow [DEV-02, REE-07]. */
function Locking() {
  const api = useProject();
  const { session, ask, notify, project } = api;
  const lock = useLock();
  const scenes = useScenes(session);
  const format = useScriptFormat();
  const [freeze, setFreeze] = useState(true);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const current = lock?.revisions[lock.revisions.length - 1];
  const changed = useMemo(() => {
    if (!current || !lock || lock.revisions.length < 2) return 0;
    const marks = revisedElements(
      scenes.map((s) => {
        const elements: string[] = [];
        s.node.forEach((b) => elements.push(b.textContent));
        return { id: s.id, elements };
      }),
      current.baseline,
    );
    return [...marks.values()].reduce((n, m) => n + m.filter(Boolean).length, 0);
  }, [scenes, current, lock]);
  const added = lock ? scenes.filter((s) => !/^\d+$/.test(s.number)).length : 0;
  if (lock === undefined) return null;

  const doLock = async () => {
    const answer = await ask({
      title: t("lock.lockTitle"),
      text: <p>{t("lock.lockText")}</p>,
      cancel: t("common.cancel"),
      choices: [{ label: t("lock.lockGo"), value: "y", primary: true }],
    });
    if (answer !== "y") return;
    try {
      if (freeze) await freezeVersion(await currentVersion(session, project.title, format ?? formatById(null), await readTitlePage(), t("lock.versionName")));
      await lockScript(session);
      notify({ text: t("lock.locked") });
    } catch (e) {
      fail(e);
    }
  };
  if (!lock) {
    return (
      <section className="step-section">
        <h3>{t("lock.title")}</h3>
        <Help>{t("lock.help")}</Help>
        <label className="choice">
          <input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} />
          {t("lock.freezeToo")}
        </label>
        <button type="button" className="btn primary" disabled={scenes.length === 0} onClick={() => void doLock()}>
          <Lock aria-hidden="true" />
          {t("lock.lock")}
        </button>
      </section>
    );
  }
  const next = REVISION_COLORS[Math.min(lock.revisions.length, REVISION_COLORS.length - 1)];
  return (
    <section className="step-section">
      <h3>{t("lock.title")}</h3>
      <p className="ws-locked">
        <Lock aria-hidden="true" />
        {t("lock.since", { date: date(lock.lockedAt) })} · {plural("lock.numbered", Object.keys(lock.numbers).length)}
        {added > 0 && ` · ${plural("lock.added", added)}`}
      </p>
      <Help>{t("lock.revisionsHelp")}</Help>
      <ol className="ws-revisions">
        {lock.revisions.map((r, i) => (
          <li key={r.id} className={r === current ? "on" : ""}>
            <span className="ws-swatch" style={{ background: REVISION_TINTS[r.color] }} aria-hidden="true" />
            <strong>{t(`lock.colors.${r.color}`)}</strong>
            <span className="muted">{i === 0 ? t("lock.lockedText", { date: date(r.startedAt) }) : t("lock.startedOn", { date: date(r.startedAt) })}</span>
            {r === current && i > 0 && <span className="badge warn">{plural("lock.changed", changed)}</span>}
          </li>
        ))}
      </ol>
      <div className="ws-rest">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const answer = await ask({
              title: t("lock.newRevisionTitle", { color: t(`lock.colors.${next}`) }),
              text: <p>{t("lock.newRevisionText")}</p>,
              cancel: t("common.cancel"),
              choices: [{ label: t("lock.newRevisionGo"), value: "y", primary: true }],
            });
            if (answer === "y") void startRevision(session, lock).catch(fail);
          }}
        >
          <Palette aria-hidden="true" />
          {t("lock.newRevision", { color: t(`lock.colors.${next}`) })}
        </button>
        <button type="button" className="btn" onClick={() => void exportScreenplayPdf(api).catch(fail)}>
          <Download aria-hidden="true" />
          {t("lock.exportPdf")}
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn ghost danger"
          onClick={async () => {
            if (await confirmRemoval(ask, { title: t("lock.unlockTitle"), text: t("lock.unlockText"), label: t("lock.unlock") })) void unlockScript().catch(fail);
          }}
        >
          <LockOpen aria-hidden="true" />
          {t("lock.unlock")}
        </button>
      </div>
    </section>
  );
}
