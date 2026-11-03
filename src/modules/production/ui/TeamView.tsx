import { open } from "@tauri-apps/plugin-dialog";
import {
  BookUser,
  Check,
  Clapperboard,
  Contact as ContactIcon,
  Crown,
  Download,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  Network,
  Pencil,
  Plus,
  Rows3,
  Star,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import type { CandidateStatus, CastKind, ContractStatus } from "../../../core/db/schema";
import { describeError } from "../../../core/errors";
import { plural, t } from "../../../core/i18n";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { MoreMenu, type MoreItem } from "../../../ui-kit/MoreMenu";
import { SearchBox } from "../../../ui-kit/SearchBox";
import { Segmented } from "../../../ui-kit/Segmented";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useLive } from "../../../core/db/live";
import { loadEntries } from "../../script/bible/application/bible";
import { useProject } from "../../project/ui/projectContext";
import { fold } from "../../script/bible/domain/types";
import { useScenes } from "../../script/screenplay/application/scriptSession";
import { pickImage } from "../../shared/media";
import {
  addAway,
  addCandidate,
  addContact,
  addContacts,
  addCrew,
  castNumbers,
  chooseCandidate,
  deleteCast,
  deleteContact,
  ensureRole,
  readBook,
  refreshFromBook,
  removeAway,
  removeCandidate,
  removeCrew,
  removeFromBook,
  saveToBook,
  setCast,
  takeFromBook,
  updateCandidate,
  updateContact,
  updateCrew,
  useCatalog,
  useTeam,
  writeCatalog,
  type BookCard,
  type Candidate,
  type Contact,
  type CrewMember,
  type Team,
} from "../application/team";
import { addRole, CANDIDATE_STATUSES, CAST_KINDS, CONTRACTS, DEPARTMENTS, departmentName, REGIMES, removeRole, rolesOf } from "../domain/catalog";
import { cardsFromCsv, cardsFromVCard, samePerson, toVCard, type Card, type ContactData } from "../domain/contacts";
import { Avatar, dateRange, Field, HeaderTabs, Section, useFilePick } from "./parts";

type Tab = "crew" | "cast" | "casting" | "contacts";

/** The team of the film: the crew by department, the cast, the casting and the contacts [EQU-01 to EQU-08]. */
export function TeamView() {
  const [tab, setTab] = useStoredState<Tab>("oniric.team.tab", "crew");
  const team = useTeam();
  // The contact opened in the contacts, from wherever it was asked for.
  const [opened, setOpened] = useState<string | null>(null);
  const openContact = (id: string) => {
    setOpened(id);
    setTab("contacts");
  };
  return (
    <>
      <HeaderTabs
        label={t("team.display")}
        value={tab}
        onChange={setTab}
        options={[
          { id: "crew", label: t("team.tabs.crew"), icon: Users },
          { id: "cast", label: t("team.tabs.cast"), icon: Clapperboard },
          { id: "casting", label: t("team.tabs.casting"), icon: Star },
          { id: "contacts", label: t("team.tabs.contacts"), icon: BookUser },
        ]}
      />
      {team &&
        (tab === "crew" ? (
          <CrewTab team={team} onContact={openContact} />
        ) : tab === "cast" ? (
          <CastTab team={team} onContact={openContact} />
        ) : tab === "casting" ? (
          <CastingTab team={team} onContact={openContact} />
        ) : (
          <ContactsTab team={team} opened={opened} onOpen={setOpened} />
        ))}
    </>
  );
}

const contractTone: Record<ContractStatus, string> = { none: "", sent: "warn", signed: "ok" };

/** Asks a name and makes a contact of it; its id, or null. */
function useNewContact() {
  const { prompt, notify } = useProject();
  return async (initial = ""): Promise<string | null> => {
    const name = (await prompt(t("team.newContact"), t("team.name"), initial))?.trim();
    if (!name) return null;
    try {
      return await addContact(name);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
      return null;
    }
  };
}

/** A list of contacts to choose from, with « New contact… » at its end. */
function ContactSelect({ team, value, onChange, label, none }: { team: Team; value: string | null; onChange: (id: string | null) => void; label: string; none?: string }) {
  const create = useNewContact();
  return (
    <Select
      value={value ?? ""}
      aria-label={label}
      onChange={(e) => {
        if (e.target.value === "\u0000new") void create().then((id) => id && onChange(id));
        else onChange(e.target.value || null);
      }}
    >
      {none !== undefined && <option value="">{none}</option>}
      {team.contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={"\u0000new"}>{t("team.newContactOption")}</option>
    </Select>
  );
}

function CrewTab({ team, onContact }: { team: Team; onContact: (id: string) => void }) {
  const { ask, notify } = useProject();
  const [shape, setShape] = useStoredState<"list" | "chart">("oniric.team.shape", "list");
  const [editing, setEditing] = useState<CrewMember | "new" | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const contact = useMemo(() => new Map(team.contacts.map((c) => [c.id, c])), [team.contacts]);
  const needle = fold(query.trim());
  const shown = team.crew.filter((m) => !needle || fold(`${contact.get(m.contactId)?.name ?? ""} ${m.role} ${departmentName(m.department)}`).includes(needle));
  const departments = [...DEPARTMENTS, ...new Set(team.crew.map((m) => m.department).filter((d) => !(DEPARTMENTS as readonly string[]).includes(d)))];
  const groups = departments
    .map((d) => ({ id: d, members: shown.filter((m) => m.department === d).sort((a, b) => Number(b.head) - Number(a.head) || (a.rank < b.rank ? -1 : 1)) }))
    .filter((g) => g.members.length > 0);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });

  const menu = (m: CrewMember): MoreItem[] => [
    { label: t("team.editPost"), icon: Pencil, onClick: () => setEditing(m) },
    { label: t("team.openContact"), icon: ContactIcon, onClick: () => onContact(m.contactId) },
    { label: m.head ? t("team.unsetHead") : t("team.setHead"), icon: Crown, onClick: () => void updateCrew(m.id, { head: !m.head }).catch(fail) },
    {
      label: t("team.removePost"),
      icon: Trash2,
      danger: true,
      onClick: async () => {
        const name = contact.get(m.contactId)?.name ?? "";
        if (await confirmRemoval(ask, { title: t("team.removePostTitle", { name, role: m.role }), text: t("team.removePostText"), label: t("common.removeAction") }))
          void removeCrew(m.id).catch(fail);
      },
    },
  ];

  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div className="pr-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder={t("team.searchCrew")} label={t("team.searchCrewLabel")} />
          <span className="spacer" />
          <Segmented
            label={t("team.shape")}
            value={shape}
            onChange={setShape}
            options={[
              { id: "list", label: t("team.list"), icon: Rows3 },
              { id: "chart", label: t("team.chart"), icon: Network },
            ]}
          />
          <button type="button" className="btn" onClick={() => setCatalogOpen(true)}>
            {t("team.catalog")}
          </button>
          <button type="button" className="btn primary" onClick={() => setEditing("new")}>
            <UserPlus aria-hidden="true" />
            {t("team.addToCrew")}
          </button>
        </div>
        {team.crew.length === 0 ? (
          <EmptyState title={t("team.crewEmptyTitle")}>
            <p className="muted">{t("team.crewEmptyText")}</p>
          </EmptyState>
        ) : groups.length === 0 ? (
          <p className="muted pr-none">{t("team.nothingFound")}</p>
        ) : shape === "list" ? (
          groups.map((g) => (
            <section key={g.id} className="pr-group" aria-label={departmentName(g.id)}>
              <h2 className="pr-group-head">
                {departmentName(g.id)}
                <span className="pr-count">{g.members.length}</span>
              </h2>
              <ul className="pr-rows">
                {g.members.map((m) => {
                  const c = contact.get(m.contactId);
                  return (
                    <li key={m.id} className="pr-row">
                      <button type="button" className="pr-row-main" onClick={() => setEditing(m)}>
                        <Avatar name={c?.name ?? "?"} photo={c?.data.photo} />
                        <span className="pr-row-text">
                          <span className="pr-row-title">
                            {c?.name}
                            {m.head && (
                              <span className="badge pr-head" title={t("team.head")}>
                                <Crown aria-hidden="true" />
                                {t("team.head")}
                              </span>
                            )}
                          </span>
                          <span className="pr-row-sub">{m.role}</span>
                        </span>
                        <span className="pr-row-meta">{dateRange(m.startDate, m.endDate)}</span>
                        <span className="pr-row-meta num">{m.rate}</span>
                        <span className={`badge ${contractTone[m.contract]}`}>{t(`team.contracts.${m.contract}`)}</span>
                      </button>
                      <MoreMenu label={t("team.postMenu", { name: c?.name ?? "" })} items={menu(m)} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : (
          <OrgChart groups={groups} contact={contact} onOpen={setEditing} />
        )}
      </main>
      {editing && <CrewDialog team={team} member={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {catalogOpen && <CatalogDialog onClose={() => setCatalogOpen(false)} />}
    </div>
  );
}

const LEAD = ["production", "direction"];

/** The organisation chart, one card per department, the heads of department at its top [EQU-04]. */
function OrgChart({
  groups,
  contact,
  onOpen,
}: {
  groups: { id: string; members: CrewMember[] }[];
  contact: Map<string, Contact>;
  onOpen: (m: CrewMember) => void;
}) {
  const person = (m: CrewMember) => {
    const c = contact.get(m.contactId);
    return (
      <button type="button" key={m.id} className={m.head ? "pr-org-person head" : "pr-org-person"} onClick={() => onOpen(m)}>
        <Avatar name={c?.name ?? "?"} photo={c?.data.photo} size={m.head ? 32 : 24} />
        <span className="pr-row-text">
          <span className="pr-row-title">{c?.name}</span>
          <span className="pr-row-sub">{m.role}</span>
        </span>
      </button>
    );
  };
  const dept = (g: { id: string; members: CrewMember[] }) => {
    const heads = g.members.filter((m) => m.head);
    const rest = g.members.filter((m) => !m.head);
    return (
      <section key={g.id} className="pr-org-dept" aria-label={departmentName(g.id)}>
        <h2>{departmentName(g.id)}</h2>
        {heads.length > 0 && <div className="pr-org-heads">{heads.map(person)}</div>}
        {rest.length > 0 && <div className={heads.length ? "pr-org-team under" : "pr-org-team"}>{rest.map(person)}</div>}
      </section>
    );
  };
  // Production and direction lead the film: on top, the departments hanging from them below.
  const top = groups.filter((g) => LEAD.includes(g.id));
  const below = groups.filter((g) => !LEAD.includes(g.id));
  return (
    <div className={top.length && below.length ? "pr-org tiered" : "pr-org"}>
      {top.length > 0 && <div className="pr-org-top">{top.map(dept)}</div>}
      {below.length > 0 && <div className="pr-org-rest">{below.map(dept)}</div>}
    </div>
  );
}

const OTHER = "\u0000other";

function CrewDialog({ team, member, onClose }: { team: Team; member: CrewMember | null; onClose: () => void }) {
  const { prompt, notify } = useProject();
  const catalog = useCatalog();
  const [draft, setDraft] = useState<Omit<CrewMember, "id" | "rank">>(
    member ?? { contactId: team.contacts[0]?.id ?? "", department: "direction", role: "", head: false, startDate: null, endDate: null, rate: "", contract: "none" },
  );
  const roles = rolesOf(draft.department, catalog);
  const role = draft.role || roles[0] || "";
  const set = (p: Partial<typeof draft>) => setDraft({ ...draft, ...p });
  const save = async () => {
    try {
      if (member) await updateCrew(member.id, { ...draft, role });
      else await addCrew(team.crew, { ...draft, role });
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={member ? t("team.editPost") : t("team.addToCrew")}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: member ? t("common.save") : t("common.add"), primary: true, disabled: !draft.contactId || !role, onClick: () => void save() },
      ]}
    >
      <div className="form">
        <label className="field">
          <span>{t("team.person")}</span>
          <ContactSelect team={team} value={draft.contactId || null} onChange={(id) => set({ contactId: id ?? "" })} label={t("team.person")} />
        </label>
        <div className="input-row">
          <label className="field">
            <span>{t("team.department")}</span>
            <Select value={draft.department} aria-label={t("team.department")} onChange={(e) => set({ department: e.target.value, role: "" })}>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {departmentName(d)}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>{t("team.post")}</span>
            <Select
              value={role}
              aria-label={t("team.post")}
              onChange={async (e) => {
                if (e.target.value !== OTHER) return set({ role: e.target.value });
                const name = (await prompt(t("team.otherPostTitle"), t("team.post")))?.trim();
                if (!name) return;
                await writeCatalog(addRole(catalog, draft.department, name));
                set({ role: name });
              }}
            >
              {[...new Set([...roles, ...(role && !roles.includes(role) ? [role] : [])])].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value={OTHER}>{t("team.otherPost")}</option>
            </Select>
          </label>
        </div>
        <label className="choice">
          <input type="checkbox" className="switch" checked={draft.head} onChange={(e) => set({ head: e.target.checked })} />
          {t("team.headLong")}
        </label>
        <div className="input-row">
          <label className="field">
            <span>{t("team.start")}</span>
            <input type="date" value={draft.startDate ?? ""} onChange={(e) => set({ startDate: e.target.value || null })} />
          </label>
          <label className="field">
            <span>{t("team.end")}</span>
            <input type="date" value={draft.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value || null })} />
          </label>
        </div>
        <div className="input-row">
          <label className="field">
            <span>{t("team.rate")}</span>
            <input type="text" value={draft.rate} placeholder={t("team.ratePlaceholder")} onChange={(e) => set({ rate: e.target.value })} />
          </label>
          <label className="field">
            <span>{t("team.contract")}</span>
            <Select value={draft.contract} aria-label={t("team.contract")} onChange={(e) => set({ contract: e.target.value as ContractStatus })}>
              {CONTRACTS.map((c) => (
                <option key={c} value={c}>
                  {t(`team.contracts.${c}`)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
    </Dialog>
  );
}

/** The posts of each department, the project's own added and those it does not use taken away [EQU-03]. */
function CatalogDialog({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog();
  const [dept, setDept] = useState<string>(DEPARTMENTS[0]);
  const [name, setName] = useState("");
  const roles = rolesOf(dept, catalog);
  const add = () => {
    if (!name.trim()) return;
    void writeCatalog(addRole(catalog, dept, name));
    setName("");
  };
  return (
    <Dialog title={t("team.catalog")} onCancel={onClose} wide actions={[{ label: t("common.close"), primary: true, onClick: onClose }]}>
      <p className="muted">{t("team.catalogHelp")}</p>
      <div className="pr-catalog">
        <ul className="pr-catalog-depts" role="listbox" aria-label={t("team.department")}>
          {DEPARTMENTS.map((d) => (
            <li key={d}>
              <button type="button" role="option" aria-selected={d === dept} className={d === dept ? "on" : ""} onClick={() => setDept(d)}>
                {departmentName(d)}
                <span className="pr-count">{rolesOf(d, catalog).length}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="pr-catalog-roles">
          <ul>
            {roles.map((r) => (
              <li key={r}>
                <span>{r}</span>
                <button type="button" className="btn tiny ghost" title={t("team.removeRole", { role: r })} aria-label={t("team.removeRole", { role: r })} onClick={() => void writeCatalog(removeRole(catalog, dept, r))}>
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="input-row">
            <input
              type="text"
              value={name}
              placeholder={t("team.newRole")}
              aria-label={t("team.newRole")}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button type="button" className="btn" disabled={!name.trim()} onClick={add}>
              <Plus aria-hidden="true" />
              {t("common.add")}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** The characters of the screenplay with how many scenes each is in, and the parts written down without a scene. */
function useCharacters(team: Team) {
  const { session } = useProject();
  const scenes = useScenes(session);
  return useMemo(() => {
    const count = new Map<string, number>();
    for (const s of scenes) for (const c of s.characters) count.set(c, (count.get(c) ?? 0) + 1);
    for (const r of team.cast) if (!count.has(r.character)) count.set(r.character, 0);
    const list = [...count.entries()].map(([name, n]) => ({ name, scenes: n }));
    const numbers = castNumbers(list, team.cast);
    return list.sort((a, b) => (numbers.get(a.name) ?? 999) - (numbers.get(b.name) ?? 999) || a.name.localeCompare(b.name)).map((c) => ({ ...c, number: numbers.get(c.name) ?? null }));
  }, [scenes, team.cast]);
}

/** Who plays whom [EQU-05]: every character of the screenplay, its number on the strips, its kind of part and its actor. */
function CastTab({ team, onContact }: { team: Team; onContact: (id: string) => void }) {
  const { prompt, ask, notify } = useProject();
  const characters = useCharacters(team);
  const roleOf = new Map(team.cast.map((r) => [r.character, r]));
  const entries = useLive(loadEntries, ["bible_entry"]);
  // The name the Bible gives a character when its cue is shorter: « LEIA » is « Princesse Leia Organa » there.
  const bibleName = (cue: string) => {
    const e = entries?.find((x) => x.type === "character" && [x.name, ...x.aliases].some((n) => fold(n) === fold(cue)));
    return e && fold(e.name) !== fold(cue) ? e.name : null;
  };
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const addPart = async () => {
    const name = (await prompt(t("team.addPart"), t("team.character")))?.trim().toLocaleUpperCase("fr");
    if (name) void setCast(name, { kind: "extra" }, "Rôle ajouté").catch(fail);
  };
  if (characters.length === 0) {
    return (
      <div className="view view-pad">
        <EmptyState title={t("team.castEmptyTitle")}>
          <p className="muted">{t("team.castEmptyText")}</p>
          <button type="button" className="btn" onClick={() => void addPart()}>
            <Plus aria-hidden="true" />
            {t("team.addPart")}
          </button>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="view pr-view">
      <main className="view-main wide">
        <div className="pr-toolbar">
          <p className="muted">{t("team.castHelp")}</p>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => void addPart()}>
            <Plus aria-hidden="true" />
            {t("team.addPart")}
          </button>
        </div>
        <table className="pr-table pr-quiet">
          <thead>
            <tr>
              <th className="num">{t("team.number")}</th>
              <th>{t("team.character")}</th>
              <th>{t("team.kind")}</th>
              <th>{t("team.actor")}</th>
              <th className="num">{t("team.scenes")}</th>
              <th aria-label={t("team.more")} />
            </tr>
          </thead>
          <tbody>
            {characters.map((c) => {
              const role = roleOf.get(c.name);
              const actor = role?.contactId ? team.contacts.find((x) => x.id === role.contactId) : null;
              return (
                <tr key={c.name}>
                  <td className="num">
                    <Field
                      label={t("team.numberOf", { name: c.name })}
                      hideLabel
                      type="number"
                      className="pr-num-field"
                      value={role?.number !== null && role?.number !== undefined ? String(role.number) : ""}
                      placeholder={c.number !== null ? String(c.number) : "–"}
                      onCommit={(v) => void setCast(c.name, { number: v ? Math.max(1, Math.round(Number(v))) : null }, "Numéro du rôle").catch(fail)}
                    />
                  </td>
                  <td>
                    <span className="pr-slug">{c.name}</span>
                    {bibleName(c.name) && <span className="pr-cast-full muted">{t("team.bibleName", { name: bibleName(c.name) })}</span>}
                  </td>
                  <td>
                    <Select value={role?.kind ?? "supporting"} aria-label={t("team.kindOf", { name: c.name })} onChange={(e) => void setCast(c.name, { kind: e.target.value as CastKind }).catch(fail)}>
                      {CAST_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`team.kinds.${k}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <div className="pr-actor">
                      <ContactSelect team={team} value={role?.contactId ?? null} none={t("team.toCast")} label={t("team.actorOf", { name: c.name })} onChange={(id) => void setCast(c.name, { contactId: id }).catch(fail)} />
                      {actor && (
                        <button type="button" className="btn tiny ghost" title={t("team.openContact")} aria-label={t("team.openContact")} onClick={() => onContact(actor.id)}>
                          <ContactIcon aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="num muted">{c.scenes || "–"}</td>
                  <td>
                    {role && c.scenes === 0 && (
                      <MoreMenu
                        label={t("team.partMenu", { name: c.name })}
                        items={[
                          {
                            label: t("team.removePart"),
                            icon: Trash2,
                            danger: true,
                            onClick: async () => {
                              if (await confirmRemoval(ask, { title: t("team.removePartTitle", { name: c.name }), text: t("team.removePartText") })) void deleteCast(role.id).catch(fail);
                            },
                          },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>
    </div>
  );
}

const statusTone: Record<CandidateStatus, string> = { candidate: "", audition: "warn", shortlist: "warn", chosen: "ok", declined: "danger" };

/** The parts to cast, the people seen for each, their auditions, and the final choice [EQU-06]. */
function CastingTab({ team, onContact }: { team: Team; onContact: (id: string) => void }) {
  const { project, ask, notify } = useProject();
  const characters = useCharacters(team).filter((c) => (team.cast.find((r) => r.character === c.name)?.kind ?? "supporting") !== "extra");
  const [picked, setPicked] = useState<string | null>(null);
  const current = characters.find((c) => c.name === picked) ?? characters[0] ?? null;
  const role = current ? team.cast.find((r) => r.character === current.name) : undefined;
  const candidates = role ? team.candidates.filter((c) => c.roleId === role.id) : [];
  const contact = new Map(team.contacts.map((c) => [c.id, c]));
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const create = useNewContact();

  const add = async (contactId: string | null) => {
    if (!current || !contactId) return;
    try {
      const roleId = await ensureRole(team.cast, current.name);
      await addCandidate(roleId, contactId);
    } catch (e) {
      fail(e);
    }
  };
  const importVideo = async (c: Candidate) => {
    const chosen = await open({ title: t("team.chooseVideo"), filters: [{ name: t("team.videos"), extensions: ["mp4", "mov", "m4v", "webm", "avi", "mkv"] }] });
    if (typeof chosen !== "string") return;
    try {
      await updateCandidate(c.id, { video: unwrap(await commands.mediaImport(chosen, "auditions")) });
    } catch (e) {
      fail(e);
    }
  };

  if (characters.length === 0) {
    return (
      <div className="view view-pad">
        <EmptyState title={t("team.castEmptyTitle")}>
          <p className="muted">{t("team.castingEmptyText")}</p>
        </EmptyState>
      </div>
    );
  }
  const actorOf = (name: string) => {
    const r = team.cast.find((x) => x.character === name);
    return r?.contactId ? contact.get(r.contactId) : undefined;
  };
  return (
    <div className="view split pr-split">
      <nav className="view-side pr-side" aria-label={t("team.parts")}>
        <ul className="pr-side-list">
          {characters.map((c) => {
            const r = team.cast.find((x) => x.character === c.name);
            const n = r ? team.candidates.filter((x) => x.roleId === r.id && x.status !== "declined").length : 0;
            const actor = actorOf(c.name);
            return (
              <li key={c.name}>
                <button type="button" className={c.name === current?.name ? "on" : ""} aria-current={c.name === current?.name} onClick={() => setPicked(c.name)}>
                  <span className="pr-slug">{c.name}</span>
                  <span className={actor ? "pr-side-sub ok" : "pr-side-sub"}>
                    {actor ? (
                      <>
                        <Check aria-hidden="true" />
                        {actor.name}
                      </>
                    ) : n ? (
                      plural("team.candidates", n)
                    ) : (
                      t("team.toCast")
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <main className="view-main">
        {current && (
          <>
            <header className="pr-casting-head">
              <h2 className="pr-slug large">{current.name}</h2>
              <span className="muted">{plural("team.inScenes", current.scenes)}</span>
              <span className="spacer" />
              <ContactSelect
                team={team}
                value={null}
                none={t("team.addCandidate")}
                label={t("team.addCandidate")}
                onChange={(id) => void add(id)}
              />
            </header>
            {candidates.length === 0 ? (
              <div className="pr-empty-box">
                <p className="muted">{t("team.noCandidate")}</p>
                <button type="button" className="btn" onClick={() => void create().then((id) => add(id))}>
                  <UserPlus aria-hidden="true" />
                  {t("team.newCandidate")}
                </button>
              </div>
            ) : (
              <ul className="pr-cards">
                {candidates.map((c) => {
                  const p = contact.get(c.contactId);
                  return (
                    <li key={c.id} className={`pr-card${c.status === "chosen" ? " chosen" : ""}`}>
                      <header className="pr-card-head">
                        <Avatar name={p?.name ?? "?"} photo={p?.data.photo} size={36} />
                        <span className="pr-row-text">
                          <button type="button" className="pr-link" onClick={() => onContact(c.contactId)}>
                            {p?.name}
                          </button>
                          <span className="pr-row-sub">{p?.data.agent ? t("team.agentIs", { agent: p.data.agent }) : p?.data.phone}</span>
                        </span>
                        <span className={`badge ${statusTone[c.status]}`}>{t(`team.statuses.${c.status}`)}</span>
                        <MoreMenu
                          label={t("team.candidateMenu", { name: p?.name ?? "" })}
                          items={[
                            {
                              label: t("team.removeCandidate"),
                              icon: Trash2,
                              danger: true,
                              onClick: async () => {
                                if (await confirmRemoval(ask, { title: t("team.removeCandidateTitle", { name: p?.name ?? "" }), text: t("team.removeCandidateText"), label: t("common.removeAction") }))
                                  void removeCandidate(c.id).catch(fail);
                              },
                            },
                          ]}
                        />
                      </header>
                      <div className="pr-card-fields">
                        <label className="pr-field">
                          <span>{t("team.status")}</span>
                          <Select value={c.status} aria-label={t("team.status")} onChange={(e) => void updateCandidate(c.id, { status: e.target.value as CandidateStatus }).catch(fail)}>
                            {CANDIDATE_STATUSES.filter((s) => s !== "chosen").map((s) => (
                              <option key={s} value={s}>
                                {t(`team.statuses.${s}`)}
                              </option>
                            ))}
                            {c.status === "chosen" && <option value="chosen">{t("team.statuses.chosen")}</option>}
                          </Select>
                        </label>
                        <Field label={t("team.audition")} type="datetime-local" value={c.auditionAt ?? ""} onCommit={(v) => void updateCandidate(c.id, { auditionAt: v || null }).catch(fail)} />
                        <div className="pr-field">
                          <span>{t("team.video")}</span>
                          {c.video ? (
                            <div className="pr-file">
                              <button type="button" className="pr-link" onClick={() => void commands.reveal(`${project.dir}/${c.video}`, true)}>
                                {c.video.split("/").pop()}
                              </button>
                              <button type="button" className="btn tiny ghost" aria-label={t("team.removeVideo")} title={t("team.removeVideo")} onClick={() => void updateCandidate(c.id, { video: null }).catch(fail)}>
                                <X aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="btn small" onClick={() => void importVideo(c)}>
                              <Upload aria-hidden="true" />
                              {t("team.importVideo")}
                            </button>
                          )}
                        </div>
                        <Field label={t("team.notes")} multiline className="wide" value={c.notes} onCommit={(v) => void updateCandidate(c.id, { notes: v }).catch(fail)} />
                      </div>
                      {c.status !== "chosen" && (
                        <footer className="pr-card-foot">
                          <button type="button" className="btn small" onClick={() => void chooseCandidate(c, team.candidates).catch(fail)}>
                            <Check aria-hidden="true" />
                            {t("team.choose")}
                          </button>
                        </footer>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** The people of the project, their cards, and the address book of the computer [EQU-01, EQU-07, EQU-08]. */
function ContactsTab({ team, opened, onOpen }: { team: Team; opened: string | null; onOpen: (id: string | null) => void }) {
  const { notify, transfer } = useProject();
  const [query, setQuery] = useState("");
  const [book, setBook] = useState<BookCard[] | null>(null);
  const create = useNewContact();
  const needle = fold(query.trim());
  const shown = team.contacts.filter((c) => !needle || fold(`${c.name} ${c.data.trades.join(" ")} ${c.data.email}`).includes(needle));
  const current = team.contacts.find((c) => c.id === opened) ?? shown[0] ?? null;
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const [fileInput, pickFile] = useFilePick(".csv,.vcf,.vcard,text/csv,text/vcard", (text, name) => {
    const cards = /\.vcf$|\.vcard$/i.test(name) || /BEGIN:VCARD/i.test(text) ? cardsFromVCard(text) : cardsFromCsv(text, csvLabels());
    const fresh = cards.filter((c) => !team.contacts.some((k) => samePerson(k, c)));
    if (cards.length === 0) return notify({ text: t("team.importNone"), tone: "error" });
    void addContacts(fresh)
      .then(() => notify({ text: t("team.imported", { count: fresh.length, skipped: cards.length - fresh.length }) }))
      .catch(fail);
  });
  return (
    <div className="view split pr-split contacts">
      {fileInput}
      <nav className="view-side pr-side" aria-label={t("team.tabs.contacts")}>
        <div className="pr-side-tools">
          <SearchBox value={query} onChange={setQuery} placeholder={t("team.searchContacts")} label={t("team.searchContactsLabel")} />
          <button type="button" className="btn primary" onClick={() => void create(query).then((id) => id && (onOpen(id), setQuery("")))}>
            <Plus aria-hidden="true" />
            {t("team.newContactShort")}
          </button>
          <MoreMenu
            label={t("team.contactsMenu")}
            items={[
              { label: t("team.fromBook"), icon: BookUser, onClick: () => void readBook().then(setBook).catch(fail) },
              { label: t("team.importFile"), icon: Upload, hint: t("team.importFileHint"), onClick: pickFile },
              { label: t("team.exportFiles"), icon: Download, onClick: () => transfer("export", "production") },
            ]}
          />
        </div>
        {team.contacts.length === 0 ? (
          <p className="muted pr-none">{t("team.contactsEmpty")}</p>
        ) : (
          <ul className="pr-side-list people">
            {shown.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === current?.id ? "on" : ""} aria-current={c.id === current?.id} onClick={() => onOpen(c.id)}>
                  <Avatar name={c.name} photo={c.data.photo} />
                  <span className="pr-row-text">
                    <span className="pr-row-title">{c.name}</span>
                    <span className="pr-row-sub">{rolesLine(team, c) || c.data.trades.join(", ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <main className="view-main">
        {current ? (
          <ContactPane key={current.id} team={team} contact={current} onGone={() => onOpen(null)} />
        ) : (
          <EmptyState title={t("team.contactsEmptyTitle")}>
            <p className="muted">{t("team.contactsEmptyText")}</p>
          </EmptyState>
        )}
      </main>
      {book && <BookDialog book={book} team={team} onClose={() => setBook(null)} />}
    </div>
  );
}

const csvLabels = () => Object.fromEntries((["name", "phone", "email", "address", "language", "trades", "agent", "regime", "diet", "allergies", "emergency", "notes"] as const).map((f) => [f, t(`team.fields.${f}`)]));

/** « Cadreur · Joue MARIE »: what a person is in the project. */
function rolesLine(team: Team, c: Contact): string {
  return [...team.crew.filter((m) => m.contactId === c.id).map((m) => m.role), ...team.cast.filter((r) => r.contactId === c.id).map((r) => t("team.plays", { name: r.character }))].join(" · ");
}

function ContactPane({ team, contact, onGone }: { team: Team; contact: Contact; onGone: () => void }) {
  const { project, ask, notify } = useProject();
  const [secret, setSecret] = useState(false);
  const [away, setAway] = useState({ start: "", end: "", note: "" });
  const d = contact.data;
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const save = (patch: Partial<ContactData>) => void updateContact(contact.id, { data: { ...d, ...patch } }).catch(fail);
  const absences = team.away.filter((a) => a.contactId === contact.id);
  const posts = team.crew.filter((m) => m.contactId === contact.id);
  const parts = team.cast.filter((r) => r.contactId === contact.id);

  const addDocument = async () => {
    const chosen = await open({ title: t("team.chooseDocument"), multiple: true });
    const files = chosen === null ? [] : Array.isArray(chosen) ? chosen : [chosen];
    try {
      const added = [];
      for (const f of files) added.push({ name: f.split(/[\\/]/).pop() ?? f, path: unwrap(await commands.mediaImport(f, "documents")) });
      if (added.length) save({ documents: [...d.documents, ...added] });
    } catch (e) {
      fail(e);
    }
  };
  const menu: MoreItem[] = [
    {
      label: contact.bookId ? t("team.updateBook") : t("team.saveToBook"),
      icon: BookUser,
      hint: t("team.saveToBookHint"),
      onClick: () => void saveToBook(contact).then(() => notify({ text: t("team.savedToBook", { name: contact.name }) })).catch(fail),
    },
    ...(contact.bookId
      ? [
          {
            label: t("team.refreshFromBook"),
            icon: Download,
            onClick: () =>
              void refreshFromBook(contact)
                .then((ok) => notify({ text: ok ? t("team.refreshed") : t("team.notInBook"), tone: ok ? undefined : ("error" as const) }))
                .catch(fail),
          },
        ]
      : []),
    {
      label: t("team.exportCard"),
      icon: FileText,
      hint: t("team.exportCardHint"),
      onClick: async () => {
        try {
          const path = unwrap(await commands.exportText(`${contact.name}.vcf`, toVCard([contact])));
          notify({ text: t("workspace.exported", { file: path.split(/[\\/]/).slice(-2).join("\\") }), actions: [{ label: t("workspace.showInFolder"), onClick: () => void commands.reveal(path, false) }] });
        } catch (e) {
          fail(e);
        }
      },
    },
    {
      label: t("team.deleteContact"),
      icon: Trash2,
      danger: true,
      hint: t("team.deleteContactHint"),
      onClick: async () => {
        const used = posts.length + parts.length;
        if (
          await confirmRemoval(ask, {
            title: t("team.deleteContactTitle", { name: contact.name }),
            text: used ? t("team.deleteContactUsed", { what: rolesLine(team, contact) }) : t("team.deleteContactText"),
          })
        ) {
          await deleteContact(contact.id).catch(fail);
          onGone();
        }
      },
    },
  ];

  return (
    <div className="pr-contact">
      <header className="pr-contact-head">
        <button
          type="button"
          className="pr-photo"
          title={d.photo ? t("team.changePhoto") : t("team.addPhoto")}
          aria-label={d.photo ? t("team.changePhoto") : t("team.addPhoto")}
          onClick={() => void pickImage().then(([p]) => p && save({ photo: p })).catch(fail)}
        >
          {d.photo ? <Avatar name={contact.name} photo={d.photo} size={72} /> : <ImagePlus aria-hidden="true" />}
        </button>
        <div className="pr-contact-name">
          <h2 className="visually-hidden">{contact.name}</h2>
          <Field label={t("team.name")} hideLabel className="pr-name-field" value={contact.name} onCommit={(v) => v.trim() && void updateContact(contact.id, { name: v.trim() }).catch(fail)} />
          <p className="muted">
            {rolesLine(team, contact) || t("team.notInCrew")}
            {contact.bookId && (
              <span className="badge pr-book" title={t("team.inBookHint")}>
                <BookUser aria-hidden="true" />
                {t("team.inBook")}
              </span>
            )}
          </p>
        </div>
        <MoreMenu label={t("team.contactMenu", { name: contact.name })} items={menu} />
      </header>

      <Section title={t("team.reach")}>
        <div className="pr-grid">
          <Field label={t("team.fields.phone")} type="tel" value={d.phone} onCommit={(v) => save({ phone: v })} />
          <Field label={t("team.fields.email")} type="email" value={d.email} onCommit={(v) => save({ email: v })} />
          <Field label={t("team.fields.address")} className="wide" multiline value={d.address} onCommit={(v) => save({ address: v })} />
          <Field label={t("team.fields.language")} value={d.language} onCommit={(v) => save({ language: v })} />
          <Field label={t("team.fields.trades")} value={d.trades.join(", ")} placeholder={t("team.tradesPlaceholder")} onCommit={(v) => save({ trades: v.split(/\s*,\s*/).filter(Boolean) })} />
        </div>
      </Section>

      <Section title={t("team.engagement")}>
        <div className="pr-grid">
          <Field label={t("team.fields.agent")} value={d.agent} onCommit={(v) => save({ agent: v })} />
          <label className="pr-field">
            <span>{t("team.fields.regime")}</span>
            <Select value={d.regime} aria-label={t("team.fields.regime")} onChange={(e) => save({ regime: e.target.value as ContactData["regime"] })}>
              {REGIMES.map((r) => (
                <option key={r} value={r}>
                  {t(`team.regimes.${r || "none"}`)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Section>

      <Section title={t("team.care")}>
        <div className="pr-grid">
          <Field label={t("team.fields.diet")} value={d.diet} placeholder={t("team.dietPlaceholder")} onCommit={(v) => save({ diet: v })} />
          <Field label={t("team.fields.allergies")} value={d.allergies} onCommit={(v) => save({ allergies: v })} />
          <Field label={t("team.fields.emergency")} className="wide" value={d.emergency} placeholder={t("team.emergencyPlaceholder")} onCommit={(v) => save({ emergency: v })} />
        </div>
      </Section>

      <Section title={t("team.availability")}>
        <p className="muted small">{t("team.availabilityHelp")}</p>
        {absences.length > 0 && (
          <ul className="pr-chips-list">
            {absences.map((a) => (
              <li key={a.id} className="pr-chip">
                <span>{dateRange(a.start, a.end)}</span>
                {a.note && <span className="muted">{a.note}</span>}
                <button type="button" className="btn tiny ghost" aria-label={t("team.removeAway")} title={t("team.removeAway")} onClick={() => void removeAway(a.id).catch(fail)}>
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pr-away">
          <label className="pr-field">
            <span>{t("team.awayFrom")}</span>
            <input type="date" value={away.start} onChange={(e) => setAway({ ...away, start: e.target.value, end: away.end || e.target.value })} />
          </label>
          <label className="pr-field">
            <span>{t("team.awayTo")}</span>
            <input type="date" value={away.end} onChange={(e) => setAway({ ...away, end: e.target.value })} />
          </label>
          <label className="pr-field grow">
            <span>{t("team.awayWhy")}</span>
            <input type="text" value={away.note} onChange={(e) => setAway({ ...away, note: e.target.value })} />
          </label>
          <button
            type="button"
            className="btn"
            disabled={!away.start}
            onClick={() => {
              void addAway(contact.id, away.start, away.end || away.start, away.note.trim()).catch(fail);
              setAway({ start: "", end: "", note: "" });
            }}
          >
            <Plus aria-hidden="true" />
            {t("team.addAway")}
          </button>
        </div>
      </Section>

      <Section
        title={t("team.documents")}
        aside={
          <button type="button" className="btn small" onClick={() => void addDocument()}>
            <Plus aria-hidden="true" />
            {t("team.addDocument")}
          </button>
        }
      >
        {d.documents.length === 0 ? (
          <p className="muted small">{t("team.documentsHelp")}</p>
        ) : (
          <ul className="pr-chips-list">
            {d.documents.map((doc) => (
              <li key={doc.path} className="pr-chip">
                <FileText aria-hidden="true" />
                <button type="button" className="pr-link" onClick={() => void commands.reveal(`${project.dir}/${doc.path}`, true)}>
                  {doc.name}
                </button>
                <button
                  type="button"
                  className="btn tiny ghost"
                  aria-label={t("team.removeDocument", { name: doc.name })}
                  title={t("team.removeDocument", { name: doc.name })}
                  onClick={() => save({ documents: d.documents.filter((x) => x.path !== doc.path) })}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t("team.sensitive")}
        aside={
          <button type="button" className="btn small ghost" aria-pressed={secret} onClick={() => setSecret(!secret)}>
            {secret ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {secret ? t("team.hide") : t("team.show")}
          </button>
        }
      >
        {secret ? (
          <div className="pr-grid">
            <Field label={t("team.fields.ssn")} value={d.ssn} onCommit={(v) => save({ ssn: v })} />
            <Field label={t("team.fields.iban")} value={d.iban} onCommit={(v) => save({ iban: v })} />
          </div>
        ) : (
          <p className="muted small">{d.ssn || d.iban ? t("team.sensitiveHidden") : t("team.sensitiveHelp")}</p>
        )}
      </Section>

      <Section title={t("team.notes")}>
        <Field label={t("team.notes")} hideLabel multiline value={d.notes} onCommit={(v) => save({ notes: v })} />
      </Section>
    </div>
  );
}

/** The cards of the address book of this computer, to copy into the project [EQU-01, RG-04]. */
function BookDialog({ book, team, onClose }: { book: BookCard[]; team: Team; onClose: () => void }) {
  const { notify, ask } = useProject();
  const [cards, setCards] = useState(book);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const here = (c: Card & { id: string }) => team.contacts.some((k) => k.bookId === c.id || samePerson(k, c));
  const take = async () => {
    try {
      const n = await takeFromBook(cards.filter((c) => picked.has(c.id)));
      notify({ text: plural("team.takenFromBook", n) });
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={t("team.bookTitle")}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: picked.size ? t("team.takeN", { count: picked.size }) : t("team.take"), primary: true, disabled: picked.size === 0, onClick: () => void take() },
      ]}
    >
      <p className="muted">{t("team.bookHelp")}</p>
      {cards.length === 0 ? (
        <p className="pr-empty-box muted">{t("team.bookEmpty")}</p>
      ) : (
        <ul className="pr-book-list">
          {cards.map((c) => {
            const already = here(c);
            return (
              <li key={c.id}>
                <label className={already ? "choice muted" : "choice"}>
                  <input
                    type="checkbox"
                    disabled={already}
                    checked={picked.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      setPicked(next);
                    }}
                  />
                  <Avatar name={c.name} size={24} />
                  <span className="pr-row-text">
                    <span className="pr-row-title">{c.name}</span>
                    <span className="pr-row-sub">{already ? t("team.alreadyHere") : c.data.trades.join(", ")}</span>
                  </span>
                </label>
                <button
                  type="button"
                  className="btn tiny ghost"
                  aria-label={t("team.forget", { name: c.name })}
                  title={t("team.forget", { name: c.name })}
                  onClick={async () => {
                    if (!(await confirmRemoval(ask, { title: t("team.forgetTitle", { name: c.name }), text: t("team.forgetText"), label: t("common.removeAction") }))) return;
                    await removeFromBook(c.id);
                    setCards(cards.filter((x) => x.id !== c.id));
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
