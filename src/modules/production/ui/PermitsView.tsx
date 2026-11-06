import { AlertTriangle, ChevronRight, FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PermitStatus, ReleaseStatus } from "../../../core/db/schema";
import { describeError } from "../../../core/errors";
import { dateFormat, plural, t } from "../../../core/i18n";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { MoreMenu } from "../../../ui-kit/MoreMenu";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { PAGE_KEY, useProject } from "../../project/ui/projectContext";
import { useTeam, type Team } from "../application/team";
import {
  addDocument,
  addInsurance,
  addPermit,
  addRelease,
  deleteDocument,
  deleteInsurance,
  deletePermit,
  deleteRelease,
  updateDocument,
  updateInsurance,
  updatePermit,
  updateRelease,
  usePermits,
  type LegalDocument,
  type Permit,
  type Permits,
} from "../application/permits";
import { useScouting, type RealLocation, type Scouting } from "../application/scouting";
import { AUTHORITIES, DOCUMENT_MODELS, dueSoon, fillModel, PERMIT_KINDS, PERMIT_STATUSES, permitTone, RELEASE_STATUSES, type DocumentModel, type PermitAlert } from "../domain/permits";
import { Attachment } from "./BudgetView";
import { Field, shortDate } from "./parts";
import { usePermitAlerts } from "./preparation";

type Tab = "requests" | "releases" | "insurance" | "documents";

function useFail() {
  const { notify } = useProject();
  return (e: unknown) => notify({ text: describeError(e), tone: "error" });
}

/** The shooting permits, the image releases, the insurances, the letters [AUT-01 to AUT-06]. */
export function PermitsView() {
  const [tab] = useStoredState<Tab>(PAGE_KEY.permits, "requests");
  const p = usePermits();
  const s = useScouting();
  const team = useTeam();
  const alerts = usePermitAlerts();
  if (!p || !s || !team) return null;
  if (tab === "releases") return <Releases p={p} team={team} />;
  if (tab === "insurance") return <Insurances p={p} scouting={s} />;
  if (tab === "documents") return <Documents p={p} scouting={s} />;
  return <Requests p={p} scouting={s} alerts={alerts ?? []} />;
}

const Tone = ({ status }: { status: PermitStatus }) => <span className={`badge ${permitTone[status]} sc-status`}>{t(`permits.statuses.${status}`)}</span>;

function Requests({ p, scouting: s, alerts }: { p: Permits; scouting: Scouting; alerts: PermitAlert[] }) {
  const { ask, project } = useProject();
  const fail = useFail();
  const [open, setOpen] = useStoredState<string>(`oniric.permits.open.${project.id}`, "");
  const [making, setMaking] = useState<{ model: DocumentModel; permit: Permit } | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const due = useMemo(() => dueSoon(p.permits, today), [p.permits, today]);
  const sets = s.locations.filter((l) => l.kind === "set" && l.status !== "refused");
  const nameOf = (id: string | null) => s.locations.find((l) => l.id === id)?.name ?? t("permits.noSet");
  const add = async (init?: Parameters<typeof addPermit>[0]) => {
    try {
      setOpen(await addPermit(init));
    } catch (e) {
      fail(e);
    }
  };
  // One request for a set, whichever days are short of it: the first and the last of them.
  const bySet = useMemo(() => {
    const map = new Map<string, PermitAlert[]>();
    for (const a of alerts) map.set(a.locationId, [...(map.get(a.locationId) ?? []), a]);
    return [...map.values()];
  }, [alerts]);
  const remove = async (x: Permit) => {
    if (await confirmRemoval(ask, { title: t("permits.deleteTitle", { name: nameOf(x.locationId) }), text: t("permits.deleteText") })) await deletePermit(x.id).catch(fail);
  };
  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div className="bible-toolbar">
          <button type="button" className="btn primary bu-push" onClick={() => void add()}>
            <Plus aria-hidden="true" />
            {t("permits.newRequest")}
          </button>
        </div>
        {bySet.length > 0 && (
          <section className="bu-alert" aria-label={t("permits.alertsTitle")}>
            <AlertTriangle aria-hidden="true" />
            <div>
              <p>
                <b>{plural("permits.alerts", alerts.length)}</b>
              </p>
              <ul>
                {bySet.map((list) => {
                  const a = list[0];
                  const dates = list.map((x) => x.date).filter(Boolean) as string[];
                  return (
                    <li key={a.locationId} className="pm-alert-row">
                      <span>
                        <b>{a.name}</b> · {list.map((x) => t("schedule.dayShort", { n: x.number })).join(", ")}
                        {a.waiting && <span className="muted"> · {t(`permits.statuses.${a.waiting}`)}</span>}
                      </span>
                      {!a.waiting && (
                        <button type="button" className="btn small" onClick={() => void add({ locationId: a.locationId, start: dates[0] ?? null, end: dates[dates.length - 1] ?? null })}>
                          {t("permits.requestFor")}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}
        {due.length > 0 && (
          <p className="pm-due" role="status">
            {plural("permits.due", due.length, { first: shortDate(due[0].deadline) })}
          </p>
        )}
        {p.permits.length === 0 ? (
          <EmptyState title={t("permits.emptyTitle")}>
            <p className="muted">{t("permits.emptyText")}</p>
          </EmptyState>
        ) : (
          <div className="pr-bd-list">
            {p.permits.map((x) => {
              const unfolded = open === x.id;
              const period = [x.start ? shortDate(x.start) : "", x.end && x.end !== x.start ? shortDate(x.end) : ""].filter(Boolean).join(" – ");
              return (
                <section key={x.id} className="pr-bd-scene" aria-label={nameOf(x.locationId)}>
                  <h2>
                    <button type="button" className="pr-bd-row pm-row" aria-expanded={unfolded} onClick={() => setOpen(unfolded ? "" : x.id)}>
                      <ChevronRight className="pr-bd-caret" aria-hidden="true" />
                      <span className="pm-row-name">{nameOf(x.locationId)}</span>
                      <span className="muted pm-row-kind">{t(`permits.kinds.${x.kind}`)}</span>
                      <span className="muted pm-row-dates">{period}</span>
                      {x.status === "todo" && x.deadline && <span className={x.deadline <= today ? "badge warn" : "muted"}>{t("permits.before", { date: shortDate(x.deadline) })}</span>}
                      <Tone status={x.status} />
                    </button>
                  </h2>
                  {unfolded && (
                    <div className="pm-detail">
                      <div className="pr-form sc-form">
                        <label className="pr-field">
                          <span>{t("permits.set")}</span>
                          <Select value={x.locationId ?? ""} onChange={(e) => void updatePermit(x.id, { locationId: e.target.value || null }).catch(fail)}>
                            <option value="">{t("permits.noSet")}</option>
                            {sets.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name || t("scouting.unnamed")}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="pr-field">
                          <span>{t("permits.kind")}</span>
                          <Select value={x.kind} onChange={(e) => void updatePermit(x.id, { kind: e.target.value }).catch(fail)}>
                            {PERMIT_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {t(`permits.kinds.${k}`)}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="pr-field">
                          <span>{t("permits.status")}</span>
                          <Select value={x.status} onChange={(e) => void updatePermit(x.id, { status: e.target.value as PermitStatus }).catch(fail)}>
                            {PERMIT_STATUSES.map((k) => (
                              <option key={k} value={k}>
                                {t(`permits.statuses.${k}`)}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="pr-field">
                          <span>{t("permits.authority")}</span>
                          <Select value={AUTHORITIES.includes(x.authority) ? x.authority : "other"} onChange={(e) => void updatePermit(x.id, { authority: e.target.value }).catch(fail)}>
                            {AUTHORITIES.map((k) => (
                              <option key={k} value={k}>
                                {t(`permits.authorities.${k}`)}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <Field label={t("permits.start")} type="date" value={x.start ?? ""} onCommit={(v) => void updatePermit(x.id, { start: v || null }).catch(fail)} />
                        <Field label={t("permits.end")} type="date" value={x.end ?? ""} onCommit={(v) => void updatePermit(x.id, { end: v || null }).catch(fail)} />
                        <Field label={t("permits.deadline")} type="date" value={x.deadline ?? ""} onCommit={(v) => void updatePermit(x.id, { deadline: v || null }).catch(fail)} />
                        <Field label={t("permits.hours")} value={x.data.hours} placeholder="–" onCommit={(v) => void updatePermit(x.id, { data: { ...x.data, hours: v } }).catch(fail)} />
                        <Field label={t("permits.contact")} multiline value={x.data.contact} placeholder="–" onCommit={(v) => void updatePermit(x.id, { data: { ...x.data, contact: v } }).catch(fail)} />
                        <Field label={t("permits.notes")} multiline value={x.data.notes} placeholder="–" onCommit={(v) => void updatePermit(x.id, { data: { ...x.data, notes: v } }).catch(fail)} />
                      </div>
                      <h3>{t("permits.documents")}</h3>
                      <ul className="pm-files">
                        {x.data.documents.map((d) => (
                          <li key={d}>
                            <Attachment path={d} kind="autorisations" label={t("permits.attach")} onChange={() => void updatePermit(x.id, { data: { ...x.data, documents: x.data.documents.filter((y) => y !== d) } }).catch(fail)} />
                          </li>
                        ))}
                        <li>
                          <Attachment path={null} kind="autorisations" label={t("permits.attach")} onChange={(path) => path && void updatePermit(x.id, { data: { ...x.data, documents: [...x.data.documents, path] } }).catch(fail)} />
                        </li>
                      </ul>
                      <div className="pm-actions">
                        <button type="button" className="btn" onClick={() => setMaking({ model: x.kind === "private" ? "owner" : "request", permit: x })}>
                          <FileText aria-hidden="true" />
                          {t("permits.writeLetter")}
                        </button>
                        <button type="button" className="btn ghost destructive" onClick={() => void remove(x)}>
                          <Trash2 aria-hidden="true" />
                          {t("permits.delete")}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
        {making && <NewDocument scouting={s} permits={p} preset={making} onClose={() => setMaking(null)} />}
      </main>
    </div>
  );
}

/** Who agreed to be filmed; the signed copy stays with the project [AUT-05]. */
function Releases({ p, team }: { p: Permits; team: Team }) {
  const { ask } = useProject();
  const fail = useFail();
  const signed = p.releases.filter((r) => r.status === "signed").length;
  const remove = async (id: string, name: string) => {
    if (!name || (await confirmRemoval(ask, { title: t("permits.deleteRelease", { name }), text: t("permits.deleteReleaseText") }))) await deleteRelease(id).catch(fail);
  };
  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div className="bible-toolbar">
          {p.releases.length > 0 && <span className="muted">{t("permits.signedCount", { signed, total: p.releases.length })}</span>}
          <button type="button" className="btn primary bu-push" onClick={() => void addRelease().catch(fail)}>
            <Plus aria-hidden="true" />
            {t("permits.newRelease")}
          </button>
        </div>
        {p.releases.length === 0 ? (
          <EmptyState title={t("permits.noReleaseTitle")}>
            <p className="muted">{t("permits.noReleaseText")}</p>
          </EmptyState>
        ) : (
          <table className="pr-table pr-quiet bu-table">
            <thead>
              <tr>
                <th>{t("permits.person")}</th>
                <th>{t("permits.fromContacts")}</th>
                <th>{t("permits.status")}</th>
                <th>{t("permits.signedOn")}</th>
                <th>{t("permits.signedCopy")}</th>
                <th>{t("permits.notes")}</th>
                <th aria-label={t("budget.columns.actions")} />
              </tr>
            </thead>
            <tbody>
              {p.releases.map((r) => {
                const contact = team.contacts.find((c) => c.id === r.contactId);
                return (
                  <tr key={r.id}>
                    <td>
                      <Field label={t("permits.person")} hideLabel value={r.name} placeholder={t("permits.personPlaceholder")} onCommit={(v) => void updateRelease(r.id, { name: v }).catch(fail)} />
                    </td>
                    <td>
                      <Select value={r.contactId ?? ""} aria-label={t("permits.fromContacts")} onChange={(e) => {
                        const c = team.contacts.find((x) => x.id === e.target.value);
                        void updateRelease(r.id, { contactId: c?.id ?? null, ...(c && !r.name ? { name: c.name } : {}) }).catch(fail);
                      }}>
                        <option value="">{t("permits.noContact")}</option>
                        {team.contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Select value={r.status} aria-label={t("permits.status")} onChange={(e) => void updateRelease(r.id, { status: e.target.value as ReleaseStatus }).catch(fail)}>
                        {RELEASE_STATUSES.map((k) => (
                          <option key={k} value={k}>
                            {t(`permits.releaseStatuses.${k}`)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="bu-date">
                      <Field label={t("permits.signedOn")} hideLabel type="date" value={r.signedOn ?? ""} onCommit={(v) => void updateRelease(r.id, { signedOn: v || null }).catch(fail)} />
                    </td>
                    <td>
                      <Attachment path={r.document} kind="autorisations" label={t("permits.attach")} onChange={(path) => void updateRelease(r.id, { document: path }).catch(fail)} />
                    </td>
                    <td>
                      <Field label={t("permits.notes")} hideLabel value={r.notes} placeholder="–" onCommit={(v) => void updateRelease(r.id, { notes: v }).catch(fail)} />
                    </td>
                    <td>
                      <button type="button" className="icon-btn" aria-label={t("permits.deleteReleaseShort", { name: r.name || contact?.name || "" })} onClick={() => void remove(r.id, r.name)}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

/** Insurance and certificates, by set or by risky activity [AUT-06]. */
function Insurances({ p, scouting: s }: { p: Permits; scouting: Scouting }) {
  const { ask } = useProject();
  const fail = useFail();
  const today = new Date().toISOString().slice(0, 10);
  const remove = async (id: string, name: string) => {
    if (!name || (await confirmRemoval(ask, { title: t("permits.deleteInsurance", { name }), text: t("permits.deleteInsuranceText") }))) await deleteInsurance(id).catch(fail);
  };
  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div className="bible-toolbar">
          <button type="button" className="btn primary bu-push" onClick={() => void addInsurance().catch(fail)}>
            <Plus aria-hidden="true" />
            {t("permits.newInsurance")}
          </button>
        </div>
        {p.insurances.length === 0 ? (
          <EmptyState title={t("permits.noInsuranceTitle")}>
            <p className="muted">{t("permits.noInsuranceText")}</p>
          </EmptyState>
        ) : (
          <table className="pr-table pr-quiet bu-table">
            <thead>
              <tr>
                <th>{t("permits.activity")}</th>
                <th>{t("permits.set")}</th>
                <th>{t("permits.insurer")}</th>
                <th>{t("permits.policy")}</th>
                <th>{t("permits.start")}</th>
                <th>{t("permits.end")}</th>
                <th>{t("permits.certificate")}</th>
                <th aria-label={t("budget.columns.actions")} />
              </tr>
            </thead>
            <tbody>
              {p.insurances.map((i) => (
                <tr key={i.id} className={i.end && i.end < today ? "pm-expired" : ""}>
                  <td>
                    <Field label={t("permits.activity")} hideLabel value={i.activity} placeholder={t("permits.activityPlaceholder")} onCommit={(v) => void updateInsurance(i.id, { activity: v }).catch(fail)} />
                  </td>
                  <td>
                    <Select value={i.locationId ?? ""} aria-label={t("permits.set")} onChange={(e) => void updateInsurance(i.id, { locationId: e.target.value || null }).catch(fail)}>
                      <option value="">{t("permits.wholeShoot")}</option>
                      {s.locations
                        .filter((l) => l.kind === "set")
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name || t("scouting.unnamed")}
                          </option>
                        ))}
                    </Select>
                  </td>
                  <td>
                    <Field label={t("permits.insurer")} hideLabel value={i.insurer} placeholder="–" onCommit={(v) => void updateInsurance(i.id, { insurer: v }).catch(fail)} />
                  </td>
                  <td>
                    <Field label={t("permits.policy")} hideLabel value={i.policy} placeholder="–" onCommit={(v) => void updateInsurance(i.id, { policy: v }).catch(fail)} />
                  </td>
                  <td className="bu-date">
                    <Field label={t("permits.start")} hideLabel type="date" value={i.start ?? ""} onCommit={(v) => void updateInsurance(i.id, { start: v || null }).catch(fail)} />
                  </td>
                  <td className="bu-date">
                    <Field label={t("permits.end")} hideLabel type="date" value={i.end ?? ""} onCommit={(v) => void updateInsurance(i.id, { end: v || null }).catch(fail)} />
                  </td>
                  <td>
                    <Attachment path={i.document} kind="autorisations" label={t("permits.attach")} onChange={(path) => void updateInsurance(i.id, { document: path }).catch(fail)} />
                  </td>
                  <td>
                    <button type="button" className="icon-btn" aria-label={t("permits.deleteInsuranceShort")} onClick={() => void remove(i.id, i.activity)}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

/** What a model of letter can be filled with: the project, the set, the request. */
export function modelValues(projectTitle: string, production: string, location: RealLocation | undefined, permit: Permit | undefined): Record<string, string> {
  const d = (iso: string | null | undefined) => (iso ? dateFormat({ day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`)) : "");
  return {
    film: projectTitle,
    production,
    today: dateFormat({ day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    place: location?.name ?? "",
    address: location?.address ?? "",
    owner: location?.data.ownerName ?? "",
    ownerContact: location?.data.ownerContact ?? "",
    rental: location?.data.rental ? String(location.data.rental) : "",
    start: d(permit?.start),
    end: d(permit?.end ?? permit?.start),
    hours: permit?.data.hours ?? "",
    kind: permit ? t(`permits.kinds.${permit.kind}`) : "",
    // « Other » says nothing to the person who receives the letter: it stays to be filled in.
    authority: permit && AUTHORITIES.includes(permit.authority) && permit.authority !== "other" ? t(`permits.authorities.${permit.authority}`) : "",
  };
}

function NewDocument({ scouting: s, permits: p, preset, onClose }: { scouting: Scouting; permits: Permits; preset?: { model: DocumentModel; permit: Permit }; onClose: () => void }) {
  const { project, go } = useProject();
  const fail = useFail();
  const team = useTeam();
  const [, setTab] = useStoredState<Tab>(PAGE_KEY.permits, "requests");
  const [, setPicked] = useStoredState<string>(`oniric.permits.document.${project.id}`, "");
  const [model, setModel] = useState<DocumentModel>(preset?.model ?? "request");
  const [permitId, setPermitId] = useState(preset?.permit.id ?? "");
  const permit = p.permits.find((x) => x.id === permitId);
  const [locationId, setLocationId] = useState(preset?.permit.locationId ?? "");
  const location = s.locations.find((l) => l.id === (permit?.locationId ?? locationId));
  const production = useMemo(() => {
    const head = team?.crew.find((m) => m.department === "production" && m.head);
    return team?.contacts.find((c) => c.id === head?.contactId)?.name ?? "";
  }, [team]);
  const make = async () => {
    try {
      const title = `${t(`permits.models.${model}.name`)}${location ? ` – ${location.name}` : ""}`;
      const body = fillModel(t(`permits.models.${model}.body`), modelValues(project.title, production, location, permit));
      const id = await addDocument({ model, title, body, locationId: location?.id ?? null, permitId: permit?.id ?? null });
      setPicked(id);
      setTab("documents");
      onClose();
      go("permits");
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Dialog title={t("permits.newDocument")} onCancel={onClose} actions={[{ label: t("common.cancel"), onClick: onClose }, { label: t("permits.makeDocument"), primary: true, onClick: () => void make() }]}>
      <div className="pr-form">
        <label className="pr-field">
          <span>{t("permits.model")}</span>
          <Select value={model} onChange={(e) => setModel(e.target.value as DocumentModel)}>
            {DOCUMENT_MODELS.map((m) => (
              <option key={m} value={m}>
                {t(`permits.models.${m}.name`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="pr-field">
          <span>{t("permits.linkedRequest")}</span>
          <Select value={permitId} onChange={(e) => setPermitId(e.target.value)}>
            <option value="">{t("permits.noRequest")}</option>
            {p.permits.map((x) => (
              <option key={x.id} value={x.id}>
                {`${s.locations.find((l) => l.id === x.locationId)?.name ?? t("permits.noSet")} · ${t(`permits.kinds.${x.kind}`)}`}
              </option>
            ))}
          </Select>
        </label>
        {!permit && (
          <label className="pr-field">
            <span>{t("permits.set")}</span>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">{t("permits.noSet")}</option>
              {s.locations
                .filter((l) => l.kind === "set")
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name || t("scouting.unnamed")}
                  </option>
                ))}
            </Select>
          </label>
        )}
      </div>
    </Dialog>
  );
}

/** The letters and contracts made from a model, on a page, free to edit [AUT-03]. */
function Documents({ p, scouting: s }: { p: Permits; scouting: Scouting }) {
  const { project, ask, transfer } = useProject();
  const fail = useFail();
  const [picked, setPicked] = useStoredState<string>(`oniric.permits.document.${project.id}`, "");
  const [making, setMaking] = useState(false);
  const doc: LegalDocument | undefined = p.documents.find((d) => d.id === picked) ?? p.documents[0];
  const remove = async (d: LegalDocument) => {
    if (await confirmRemoval(ask, { title: t("permits.deleteDocument", { name: d.title }), text: t("permits.deleteDocumentText") })) await deleteDocument(d.id).catch(fail);
  };
  if (p.documents.length === 0)
    return (
      <div className="view view-pad">
        <EmptyState title={t("permits.noDocumentTitle")}>
          <p className="muted">{t("permits.noDocumentText")}</p>
          <button type="button" className="btn primary" onClick={() => setMaking(true)}>
            <Plus aria-hidden="true" />
            {t("permits.newDocument")}
          </button>
        </EmptyState>
        {making && <NewDocument scouting={s} permits={p} onClose={() => setMaking(false)} />}
      </div>
    );
  return (
    <div className="view split pr-split">
      <main className="view-main pr-sheet-main on-paper">
        {doc && <DocumentPage key={doc.id} doc={doc} onDelete={() => void remove(doc)} onExport={() => transfer("export", "production")} />}
      </main>
      <nav className="view-side pr-side" aria-label={t("permits.documents")}>
        <div className="pm-side-head">
          <button type="button" className="btn small" onClick={() => setMaking(true)}>
            <Plus aria-hidden="true" />
            {t("permits.newDocument")}
          </button>
        </div>
        <ul className="pr-side-list">
          {p.documents.map((d) => (
            <li key={d.id}>
              <button type="button" className={d.id === doc?.id ? "on" : ""} aria-current={d.id === doc?.id} onClick={() => setPicked(d.id)}>
                <span className="pr-row-title">{d.title}</span>
                <span className="pr-side-sub">{t(`permits.models.${d.model}.name`)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {making && <NewDocument scouting={s} permits={p} onClose={() => setMaking(false)} />}
    </div>
  );
}

function DocumentPage({ doc, onDelete, onExport }: { doc: LegalDocument; onDelete: () => void; onExport: () => void }) {
  const fail = useFail();
  const [body, setBody] = useState(doc.body);
  useEffect(() => setBody(doc.body), [doc.body]);
  return (
    <div className="pm-page">
      <div className="pm-page-tools">
        <MoreMenu
          label={t("permits.documentMenu")}
          items={[
            { label: t("permits.exportHere"), icon: FileText, onClick: onExport },
            { label: t("permits.deleteDocumentShort"), icon: Trash2, danger: true, onClick: onDelete },
          ]}
        />
      </div>
      <Field label={t("permits.documentTitle")} hideLabel className="pm-page-title" value={doc.title} onCommit={(v) => void updateDocument(doc.id, { title: v }).catch(fail)} />
      <textarea className="pm-page-body" aria-label={t("permits.documentBody")} value={body} spellCheck onChange={(e) => setBody(e.target.value)} onBlur={() => body !== doc.body && void updateDocument(doc.id, { body }).catch(fail)} />
    </div>
  );
}
