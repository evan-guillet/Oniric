import { ChevronRight, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { plural, t } from "../../../../core/i18n";
import { confirmRemoval } from "../../../../ui-kit/Dialog";
import { MoreMenu } from "../../../../ui-kit/MoreMenu";
import { Segmented } from "../../../../ui-kit/Segmented";
import { Select } from "../../../../ui-kit/Select";
import { useProject } from "../../../project/ui/projectContext";
import { Field } from "../../../production/ui/parts";
import { useScenes } from "../../screenplay/application/scriptSession";
import { listVersions } from "../../screenplay/application/versions";
import { addItems, deleteItem, itemsOf, updateItem, useItems, type Item } from "../application/items";
import { formIssues, type Issue } from "../domain/review";
import { Help } from "./fields";
import type { Reader } from "./readerCopy";
import { reviewScenes } from "./StepRewrite";

type RemarkStatus = "todo" | "apply" | "discuss" | "rejected" | "done";
const STATUSES: RemarkStatus[] = ["todo", "apply", "discuss", "rejected", "done"];

interface Remark {
  sceneId: string;
  quote: string;
  text: string;
  status: RemarkStatus;
}

/** Step 7: the readers, their copies, their sheets and remarks, sorted, and the checks of form [RET-01 to RET-05]. */
export function StepFeedback() {
  const items = useItems();
  const readers = itemsOf<Reader>(items, "reader");
  const remarks = itemsOf<Remark>(items, "remark");
  return (
    <div className="step-body">
      <Readers readers={readers} remarks={remarks} />
      {remarks.length > 0 && <Triage readers={readers} remarks={remarks} />}
      <Checks />
    </div>
  );
}

function Readers({ readers, remarks }: { readers: Item<Reader>[]; remarks: Item<Remark>[] }) {
  const { prompt, notify } = useProject();
  const [open, setOpen] = useState<string | null>(null);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const add = async () => {
    const name = (await prompt(t("feedback.newReader"), t("team.name")))?.trim();
    if (!name) return;
    const copy = readers.reduce((n, r) => Math.max(n, r.data.copy ?? 0), 0) + 1;
    try {
      const [id] = await addItems("reader", readers, [{ name, version: "", copy, sentAt: "", strengths: "", weaknesses: "", understanding: "", rating: 0 }]);
      setOpen(id);
    } catch (e) {
      fail(e);
    }
  };
  return (
    <section className="step-section">
      <h3>{t("feedback.readers")}</h3>
      <Help>{t("feedback.readersHelp")}</Help>
      {readers.length > 0 && (
        <ul className="ws-readers">
          {readers.map((r) => (
            <ReaderRow key={r.id} reader={r} remarks={remarks.filter((m) => m.parentId === r.id)} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
          ))}
        </ul>
      )}
      <button type="button" className="btn" onClick={() => void add()}>
        <Plus aria-hidden="true" />
        {t("feedback.addReader")}
      </button>
    </section>
  );
}

function ReaderRow({ reader, remarks, open, onToggle }: { reader: Item<Reader>; remarks: Item<Remark>[]; open: boolean; onToggle: () => void }) {
  const { ask, notify, session } = useProject();
  const versions = useLive(listVersions, ["script_version"]) ?? [];
  const scenes = useScenes(session);
  const r = reader.data;
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const set = (p: Partial<Reader>) => void updateItem(reader, p).catch(fail);
  const version = versions.find((v) => v.id === r.version);
  const [draft, setDraft] = useState<Remark>({ sceneId: "", quote: "", text: "", status: "todo" });
  const addRemark = () => {
    if (!draft.text.trim() && !draft.quote.trim()) return;
    void addItems("remark", remarks, [{ ...draft, sceneId: draft.sceneId || scenes[0]?.id || "" }], reader.id).catch(fail);
    setDraft({ ...draft, quote: "", text: "" });
  };
  return (
    <li className={open ? "open" : ""}>
      <div className="ws-pass-head">
        <button type="button" className="ws-fold" aria-expanded={open} onClick={onToggle}>
          <ChevronRight aria-hidden="true" />
          <span className="ws-pass-title">{r.name}</span>
        </button>
        <span className="muted small">
          {[t("feedback.copyN", { n: r.copy }), version ? version.name : t("feedback.current"), r.sentAt && t("feedback.sentOn", { date: r.sentAt })].filter(Boolean).join(" · ")}
        </span>
        {r.rating > 0 && <span className="ws-stars small">{"★".repeat(r.rating)}</span>}
        <span className="ws-count">{plural("feedback.remarks", remarks.length)}</span>
        <MoreMenu
          label={t("feedback.readerMenu", { name: r.name })}
          items={[
            {
              label: t("feedback.deleteReader"),
              icon: Trash2,
              danger: true,
              onClick: async () => {
                if (await confirmRemoval(ask, { title: t("feedback.deleteReaderTitle", { name: r.name }), text: t("feedback.deleteReaderText") })) void deleteItem(reader).catch(fail);
              },
            },
          ]}
        />
      </div>
      {open && (
        <div className="ws-reader">
          <div className="ws-reader-copy">
            <label className="field">
              <span>{t("feedback.version")}</span>
              <Select value={r.version} aria-label={t("feedback.version")} onChange={(e) => set({ version: e.target.value })}>
                <option value="">{t("feedback.current")}</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </label>
            <Field label={t("feedback.sentAt")} type="date" value={r.sentAt} onCommit={(v) => set({ sentAt: v })} />
          </div>
          <h4>{t("feedback.sheet")}</h4>
          <div className="pr-grid">
            <Field label={t("feedback.strengths")} multiline value={r.strengths} onCommit={(v) => set({ strengths: v })} />
            <Field label={t("feedback.weaknesses")} multiline value={r.weaknesses} onCommit={(v) => set({ weaknesses: v })} />
            <Field label={t("feedback.understanding")} multiline value={r.understanding} onCommit={(v) => set({ understanding: v })} />
            <div className="pr-field">
              <span>{t("feedback.rating")}</span>
              <div className="ws-rating" role="radiogroup" aria-label={t("feedback.rating")}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={r.rating === n}
                    aria-label={plural("feedback.stars", n)}
                    className={n <= r.rating ? "on" : ""}
                    onClick={() => set({ rating: r.rating === n ? 0 : n })}
                  >
                    <Star aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <h4>{t("feedback.remarksTitle")}</h4>
          {remarks.length > 0 && (
            <ul className="ws-remarks">
              {remarks.map((m) => (
                <RemarkRow key={m.id} remark={m} />
              ))}
            </ul>
          )}
          <div className="ws-remark-add">
            <Select value={draft.sceneId || scenes[0]?.id || ""} aria-label={t("feedback.scene")} onChange={(e) => setDraft({ ...draft, sceneId: e.target.value })}>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number}. {s.heading || t("workspace.noHeading")}
                </option>
              ))}
            </Select>
            <input type="text" value={draft.quote} placeholder={t("feedback.quotePlaceholder")} aria-label={t("feedback.quote")} onChange={(e) => setDraft({ ...draft, quote: e.target.value })} />
            <textarea rows={2} value={draft.text} placeholder={t("feedback.remarkPlaceholder")} aria-label={t("feedback.remark")} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
            <button type="button" className="btn" disabled={!draft.text.trim() && !draft.quote.trim()} onClick={addRemark}>
              <Plus aria-hidden="true" />
              {t("feedback.addRemark")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** A remark anchored to a passage: its scene, the words it is about, and where it stands [RET-02, RET-04]. */
function RemarkRow({ remark, reader }: { remark: Item<Remark>; reader?: string }) {
  const { session, openScene, notify } = useProject();
  const scenes = useScenes(session);
  const m = remark.data;
  const scene = scenes.find((s) => s.id === m.sceneId);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  return (
    <li className={`ws-remark st-${m.status}`}>
      <div className="ws-remark-text">
        <button type="button" className="ws-remark-scene" disabled={!scene} onClick={() => scene && openScene(scene.id)}>
          {scene ? `${scene.number}. ${scene.heading || t("workspace.noHeading")}` : t("feedback.sceneGone")}
        </button>
        {reader && <span className="muted small"> · {reader}</span>}
        {m.quote && <blockquote>{m.quote}</blockquote>}
        {m.text && <p>{m.text}</p>}
      </div>
      <Select value={m.status} aria-label={t("feedback.status")} onChange={(e) => void updateItem(remark, { status: e.target.value as RemarkStatus }).catch(fail)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`feedback.statuses.${s}`)}
          </option>
        ))}
      </Select>
      <button type="button" className="btn tiny ghost" aria-label={t("feedback.deleteRemark")} title={t("feedback.deleteRemark")} onClick={() => void deleteItem(remark).catch(fail)}>
        <Trash2 aria-hidden="true" />
      </button>
    </li>
  );
}

/** Every remark of every reader, by where it stands: to sort, to apply, to discuss, turned down, applied [RET-04]. */
function Triage({ readers, remarks }: { readers: Item<Reader>[]; remarks: Item<Remark>[] }) {
  const [status, setStatus] = useState<RemarkStatus>("todo");
  const name = new Map(readers.map((r) => [r.id, r.data.name]));
  const shown = remarks.filter((m) => m.data.status === status);
  return (
    <section className="step-section">
      <h3>{t("feedback.triage")}</h3>
      <Help>{t("feedback.triageHelp")}</Help>
      <Segmented
        label={t("feedback.status")}
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({ id: s, label: `${t(`feedback.statuses.${s}`)} ${remarks.filter((m) => m.data.status === s).length}` }))}
      />
      {shown.length === 0 ? (
        <p className="muted small">{t("feedback.triageNone")}</p>
      ) : (
        <ul className="ws-remarks">
          {shown.map((m) => (
            <RemarkRow key={m.id} remark={m} reader={name.get(m.parentId ?? "")} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The faults of form, each with the scene it is in, and where the spell checker is turned on [RET-05]. */
function Checks() {
  const { session, openScene, openSettings } = useProject();
  const scenes = useScenes(session);
  const issues = useMemo(() => formIssues(reviewScenes(scenes)), [scenes]);
  const scene = new Map(scenes.map((s) => [s.id, s]));
  const text = (i: Issue) =>
    i.kind === "noHeading"
      ? t("feedback.issues.noHeading")
      : i.kind === "badHeading"
        ? t(`feedback.issues.${i.missing === "side" ? "noSide" : "noTime"}`)
        : i.kind === "empty"
          ? t("feedback.issues.empty")
          : t("feedback.issues.spelling", { a: i.names[0], b: i.names[1] });
  return (
    <section className="step-section">
      <h3>{t("feedback.checks")}</h3>
      <Help>{t("feedback.checksHelp")}</Help>
      {issues.length === 0 ? (
        <p className="ws-ok">{t("feedback.allGood")}</p>
      ) : (
        <ul className="ws-scene-list">
          {issues.map((i, k) => {
            const s = scene.get(i.sceneId);
            return (
              <li key={k}>
                <button type="button" onClick={() => openScene(i.sceneId)}>
                  <span className="ws-scene-num">{s?.number}</span>
                  <span className="ws-scene-head">{text(i)}</span>
                  <span className="muted">{s?.heading}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn small" onClick={() => openSettings("writing")}>
        {t("feedback.spellcheck")}
      </button>
    </section>
  );
}
