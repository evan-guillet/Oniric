import { open } from "@tauri-apps/plugin-dialog";
import { Paperclip, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { commands } from "../../../../bindings";
import { unwrap } from "../../../../core/db/client";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { t } from "../../../../core/i18n";
import { confirmRemoval } from "../../../../ui-kit/Dialog";
import { MoreMenu } from "../../../../ui-kit/MoreMenu";
import { Select } from "../../../../ui-kit/Select";
import { useProject } from "../../../project/ui/projectContext";
import { Field } from "../../../production/ui/parts";
import { listVersions } from "../../screenplay/application/versions";
import { addItems, deleteItem, itemsOf, updateItem, useItems, type Item } from "../application/items";
import { Help, WText } from "./fields";
import { DocEditor } from "./StepDocuments";

const BODIES = ["sacd", "sgdl", "wga", "inpi", "soleau", "copyright", "other"] as const;

interface Deposit {
  body: (typeof BODIES)[number];
  date: string;
  number: string;
  version: string;
  /** The receipt, in medias/. */
  proof: string | null;
  notes: string;
}

const KINDS = ["producer", "agent", "contest", "fund", "residency", "festival", "other"] as const;
const STATES = ["todo", "sent", "reading", "declined", "accepted"] as const;

interface Submission {
  to: string;
  kind: (typeof KINDS)[number];
  status: (typeof STATES)[number];
  sentAt: string;
  deadline: string;
  followUp: string;
  notes: string;
}

type Doc = "short_synopsis" | "intention" | "direction_note" | "bio";
const DOCS: { id: Doc; goal: [number, number] }[] = [
  { id: "short_synopsis", goal: [0, 1] },
  { id: "intention", goal: [1, 3] },
  { id: "direction_note", goal: [1, 3] },
  { id: "bio", goal: [0, 1] },
];

/** Step 8: the deposits kept track of, the documents that go out, the submissions [DIF-01, DIF-02, DIF-04]. */
export function StepDiffusion() {
  const items = useItems();
  return (
    <div className="step-body">
      <Deposits list={itemsOf<Deposit>(items, "deposit")} />
      <Documents />
      <Submissions list={itemsOf<Submission>(items, "submission")} />
    </div>
  );
}

function Deposits({ list }: { list: Item<Deposit>[] }) {
  const { project, ask, notify } = useProject();
  const versions = useLive(listVersions, ["script_version"]) ?? [];
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const attach = async (d: Item<Deposit>) => {
    const chosen = await open({ title: t("diffusion.chooseProof") });
    if (typeof chosen !== "string") return;
    try {
      await updateItem(d, { proof: unwrap(await commands.mediaImport(chosen, "documents")) });
    } catch (e) {
      fail(e);
    }
  };
  return (
    <section className="step-section">
      <h3>{t("diffusion.deposits")}</h3>
      <Help>{t("diffusion.depositsHelp")}</Help>
      {list.length > 0 && (
        <ul className="ws-cards">
          {list.map((d) => {
            const set = (p: Partial<Deposit>) => void updateItem(d, p).catch(fail);
            return (
              <li key={d.id} className="ws-card">
                <div className="ws-card-grid">
                  <label className="pr-field">
                    <span>{t("diffusion.body")}</span>
                    <Select value={d.data.body} aria-label={t("diffusion.body")} onChange={(e) => set({ body: e.target.value as Deposit["body"] })}>
                      {BODIES.map((b) => (
                        <option key={b} value={b}>
                          {t(`diffusion.bodies.${b}`)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Field label={t("diffusion.date")} type="date" value={d.data.date} onCommit={(v) => set({ date: v })} />
                  <Field label={t("diffusion.number")} value={d.data.number} onCommit={(v) => set({ number: v })} />
                  <label className="pr-field">
                    <span>{t("diffusion.version")}</span>
                    <Select value={d.data.version} aria-label={t("diffusion.version")} onChange={(e) => set({ version: e.target.value })}>
                      <option value="">{t("diffusion.noVersion")}</option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Field label={t("team.notes")} className="wide" value={d.data.notes} onCommit={(v) => set({ notes: v })} />
                </div>
                <div className="ws-card-foot">
                  {d.data.proof ? (
                    <span className="pr-chip">
                      <Paperclip aria-hidden="true" />
                      <button type="button" className="pr-link" onClick={() => void commands.reveal(`${project.dir}/${d.data.proof}`, true)}>
                        {d.data.proof.split("/").pop()}
                      </button>
                      <button type="button" className="btn tiny ghost" aria-label={t("diffusion.removeProof")} title={t("diffusion.removeProof")} onClick={() => set({ proof: null })}>
                        <X aria-hidden="true" />
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn small" onClick={() => void attach(d)}>
                      <Paperclip aria-hidden="true" />
                      {t("diffusion.attachProof")}
                    </button>
                  )}
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn small ghost danger"
                    onClick={async () => {
                      if (await confirmRemoval(ask, { title: t("diffusion.deleteDeposit"), text: t("diffusion.deleteDepositText") })) void deleteItem(d).catch(fail);
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
      <button
        type="button"
        className="btn"
        onClick={() =>
          void addItems("deposit", list, [{ body: "sacd", date: new Date().toISOString().slice(0, 10), number: "", version: versions[0]?.name ?? "", proof: null, notes: "" }]).catch(fail)
        }
      >
        <Plus aria-hidden="true" />
        {t("diffusion.addDeposit")}
      </button>
    </section>
  );
}

/** The texts that go with the screenplay: logline, short synopsis, notes of intention and direction, biography [DIF-02]. */
function Documents() {
  const [tab, setTab] = useState<Doc>("short_synopsis");
  const doc = DOCS.find((d) => d.id === tab)!;
  return (
    <section className="step-section">
      <h3>{t("diffusion.documents")}</h3>
      <Help>{t("diffusion.documentsHelp")}</Help>
      <WText k="diffusion.logline" label={t("diffusion.logline")} placeholder={t("diffusion.loglinePlaceholder")} rows={2} counter={(v) => t("diffusion.words", { count: v.trim() ? v.trim().split(/\s+/).length : 0 })} />
      <div className="tabs" role="tablist">
        {DOCS.map((d) => (
          <button key={d.id} type="button" role="tab" aria-selected={tab === d.id} className={tab === d.id ? "tab on" : "tab"} onClick={() => setTab(d.id)}>
            {t(`diffusion.docs.${d.id}`)}
          </button>
        ))}
      </div>
      <DocEditor key={tab} kind={tab} title={t(`diffusion.docs.${tab}`)} goal={doc.goal} help={t(`diffusion.docsHelp.${tab}`)} />
    </section>
  );
}

/** Where the screenplay was sent, where it stands, the deadlines and when to follow up [DIF-04]. */
function Submissions({ list }: { list: Item<Submission>[] }) {
  const { ask, notify } = useProject();
  const today = new Date().toISOString().slice(0, 10);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const late = (s: Submission) => (s.followUp && s.followUp <= today && (s.status === "sent" || s.status === "reading")) || (s.deadline && s.deadline <= today && s.status === "todo");
  return (
    <section className="step-section">
      <h3>{t("diffusion.submissions")}</h3>
      <Help>{t("diffusion.submissionsHelp")}</Help>
      {list.length > 0 && (
        <div className="ws-subs-wrap">
        <table className="pr-table ws-subs">
          <thead>
            <tr>
              <th>{t("diffusion.to")}</th>
              <th>{t("diffusion.kind")}</th>
              <th>{t("diffusion.status")}</th>
              <th>{t("diffusion.sentAt")}</th>
              <th>{t("diffusion.deadline")}</th>
              <th>{t("diffusion.followUp")}</th>
              <th aria-label={t("team.more")} />
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const set = (p: Partial<Submission>) => void updateItem(s, p).catch(fail);
              return (
                <tr key={s.id} className={late(s.data) ? "ws-late" : ""}>
                  <td>
                    <Field label={t("diffusion.to")} hideLabel value={s.data.to} placeholder={t("diffusion.toPlaceholder")} onCommit={(v) => set({ to: v })} />
                  </td>
                  <td>
                    <Select value={s.data.kind} aria-label={t("diffusion.kind")} onChange={(e) => set({ kind: e.target.value as Submission["kind"] })}>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`diffusion.kinds.${k}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <Select value={s.data.status} aria-label={t("diffusion.status")} onChange={(e) => set({ status: e.target.value as Submission["status"] })}>
                      {STATES.map((k) => (
                        <option key={k} value={k}>
                          {t(`diffusion.states.${k}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <Field label={t("diffusion.sentAt")} hideLabel type="date" value={s.data.sentAt} onCommit={(v) => set({ sentAt: v })} />
                  </td>
                  <td>
                    <Field label={t("diffusion.deadline")} hideLabel type="date" value={s.data.deadline} onCommit={(v) => set({ deadline: v })} />
                  </td>
                  <td>
                    <Field label={t("diffusion.followUp")} hideLabel type="date" value={s.data.followUp} onCommit={(v) => set({ followUp: v })} />
                  </td>
                  <td>
                    <MoreMenu
                      label={t("diffusion.submissionMenu", { name: s.data.to })}
                      items={[
                        {
                          label: t("diffusion.deleteSubmission"),
                          icon: Trash2,
                          danger: true,
                          onClick: async () => {
                            if (await confirmRemoval(ask, { title: t("diffusion.deleteSubmissionTitle", { name: s.data.to || "–" }), text: t("diffusion.deleteSubmissionText") }))
                              void deleteItem(s).catch(fail);
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {list.some((s) => late(s.data)) && <p className="ws-due-line">{t("diffusion.lateHelp")}</p>}
      <button
        type="button"
        className="btn"
        onClick={() => void addItems("submission", list, [{ to: "", kind: "producer", status: "todo", sentAt: "", deadline: "", followUp: "", notes: "" }]).catch(fail)}
      >
        <Plus aria-hidden="true" />
        {t("diffusion.addSubmission")}
      </button>
    </section>
  );
}
