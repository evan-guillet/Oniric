import { open } from "@tauri-apps/plugin-dialog";
import {
  BookUser,
  Briefcase,
  Camera,
  Check,
  ChevronRight,
  Clapperboard,
  Contact as ContactIcon,
  Copy,
  Crown,
  Download,
  Drama,
  Eye,
  EyeOff,
  FileText,
  Film,
  ImagePlus,
  Lightbulb,
  Megaphone,
  MessageCircle,
  Mic,
  Music,
  Palette,
  PenLine,
  Pencil,
  Plus,
  Shirt,
  Sparkles,
  Star,
  Trash2,
  Truck,
  Upload,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import type { CandidateStatus, CastKind, ContractStatus } from "../../../core/db/schema";
import { describeError } from "../../../core/errors";
import { plural, t } from "../../../core/i18n";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { MoreMenu, type MoreItem } from "../../../ui-kit/MoreMenu";
import { SearchBox } from "../../../ui-kit/SearchBox";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useLive } from "../../../core/db/live";
import { loadEntries } from "../../script/bible/application/bible";
import { PAGE_KEY, useProject } from "../../project/ui/projectContext";
import { fold } from "../../script/bible/domain/types";
import { useScenes } from "../../script/screenplay/application/scriptSession";
import { pickImage } from "../../shared/media";
import {
  addAway,
  addCandidate,
  addContact,
  addCrew,
  castNumbers,
  chooseCandidate,
  deleteCast,
  deleteContact,
  ensureRole,
  refreshFromBook,
  removeAway,
  removeCandidate,
  removeCrew,
  saveToBook,
  setCast,
  updateCandidate,
  updateContact,
  updateCrew,
  useCatalog,
  useTeam,
  writeCatalog,
  type Candidate,
  type Contact,
  type CrewMember,
  type Team,
} from "../application/team";
import { addRole, CANDIDATE_STATUSES, CAST_KINDS, CONTRACTS, DEPARTMENTS, departmentName, REGIMES, rolesOf } from "../domain/catalog";
import type { ContactData } from "../domain/contacts";
import { Avatar, dateRange, Field, Section } from "./parts";

type Tab = "crew" | "cast" | "casting" | "contacts";

/**
 * The team of the film: the crew by department, the cast, the casting and the contacts [EQU-01 to EQU-08].
 * `home` changes each time the team is chosen in the side bar, which brings the casting and the contacts back to their categories.
 */
export function TeamView({ home }: { home: number }) {
  const [tab, setTab] = useStoredState<Tab>(PAGE_KEY.team, "crew");
  const team = useTeam();
  // The contact opened in the contacts, from wherever it was asked for.
  const [opened, setOpened] = useState<string | null>(null);
  const [lastHome, setLastHome] = useState(home);
  if (home !== lastHome) {
    setLastHome(home);
    setOpened(null);
  }
  const openContact = (id: string) => {
    setOpened(id);
    setTab("contacts");
  };
  if (!team) return null;
  if (tab === "crew") return <CrewTab team={team} onContact={openContact} />;
  if (tab === "cast") return <CastTab team={team} onContact={openContact} />;
  if (tab === "casting") return <CastingTab key={home} team={team} onContact={openContact} />;
  return <ContactsTab key={home} team={team} opened={opened} onOpen={setOpened} />;
}

const contractTone: Record<ContractStatus, string> = { none: "", sent: "warn", signed: "ok" };

/** One category of the casting or of the contacts: what its card shows. */
type TeamCategory = { id: string; title: string; icon: LucideIcon; count: string; countHint?: string };

/**
 * The levels of a tab, as in the Bible: the categories, the cards of one, the page of one card. The header says where
 * one is; the page's name or Escape goes back up, and the focus goes back to the card one left.
 */
function useLevels({ home, group, count, page, onHome, onClosePage }: { home: string; group: { id: string; title: string } | null; count: number; page: { id: string; name: string } | null; onHome: () => void; onClosePage: () => void }) {
  const { setTrail } = useProject();
  const trailKey = JSON.stringify([group?.title, count, page?.name]);
  useEffect(() => {
    if (!group && !page) return setTrail(null);
    setTrail([
      {
        label: home,
        onClick: () => {
          onClosePage();
          onHome();
        },
      },
      ...(group ? [page ? { label: group.title, onClick: onClosePage } : { label: group.title, count }] : []),
      ...(page ? [{ label: page.name }] : []),
    ]);
  }, [trailKey, setTrail]);
  useEffect(() => () => setTrail(null), [setTrail]);
  useEffect(() => {
    if (!group && !page) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, dialog, [role=dialog], [role=menu]")) return;
      if (page) onClosePage();
      else onHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [!!group, !!page]);

  const groupId = group?.id ?? null;
  const lastGroup = useRef(groupId);
  useEffect(() => {
    const was = lastGroup.current;
    lastGroup.current = groupId;
    if (was === groupId) return;
    requestAnimationFrame(() => {
      if (!groupId && was) document.querySelector<HTMLElement>(`.type-card[data-type="${CSS.escape(was)}"]`)?.focus();
      if (groupId) document.querySelector<HTMLElement>(".entry-card-open")?.focus();
    });
  }, [groupId]);
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    if (page) {
      lastPage.current = page.id;
      return;
    }
    const id = lastPage.current;
    if (!id) return;
    lastPage.current = null;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.entry-card-open[data-entry="${CSS.escape(id)}"]`)?.focus());
  }, [page?.id]);
}

/** The categories of a tab: an icon, a name and how many it holds; the whole card opens it. */
function CategoryCards({ categories, onOpen }: { categories: TeamCategory[]; onOpen: (id: string) => void }) {
  return (
    <ul className="type-cards pr-categories">
      {categories.map((c) => (
        <li key={c.id}>
          <button type="button" className="type-card" data-type={c.id} onClick={() => onOpen(c.id)}>
            <span className="type-card-icon">
              <c.icon aria-hidden="true" />
            </span>
            <span className="type-card-name">{c.title}</span>
            <span className="type-card-count" title={c.countHint}>
              {c.count}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** People or parts under the category they belong to, whose name leads into it when it has a page of its own. */
function FoundSections({ sections, onCategory }: { sections: { category: TeamCategory; cards: ReactNode; n: ReactNode }[]; onCategory?: (id: string) => void }) {
  return (
    <div className="entry-sections">
      {sections.map(({ category: c, cards, n }) => (
        <section key={c.id} className="entry-section" aria-labelledby={`team-section-${c.id}`}>
          <header className="entry-section-head">
            <h2 id={`team-section-${c.id}`}>
              <c.icon aria-hidden="true" />
              {onCategory ? (
                <button type="button" className="entry-section-link" onClick={() => onCategory(c.id)}>
                  {c.title}
                </button>
              ) : (
                c.title
              )}
              <span className="entry-section-count" title={c.countHint}>
                {n}
              </span>
            </h2>
          </header>
          {cards}
        </section>
      ))}
    </div>
  );
}

/** A person or a part among the cards: the button holds the name, and its ::after spreads over the whole card. */
function TeamCard({ id, name, face, sub, meta, heading: Heading, onOpen }: { id: string; name: ReactNode; face: ReactNode; sub?: ReactNode; meta?: ReactNode; heading: "h2" | "h3"; onOpen: () => void }) {
  const describe = useId();
  return (
    <li className="entry-card">
      <Heading className="entry-card-head">
        {face}
        <button type="button" className="entry-card-open entry-name" data-entry={id} aria-describedby={sub || meta ? describe : undefined} onClick={onOpen}>
          {name}
        </button>
      </Heading>
      {(sub || meta) && (
        <span id={describe} className="pr-card-text">
          {sub && <span className="entry-card-summary">{sub}</span>}
          {meta && <span className="entry-card-meta">{meta}</span>}
        </span>
      )}
    </li>
  );
}

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
  const [editing, setEditing] = useState<CrewMember | "new" | null>(null);
  // The departments unfolded in the list; a search unfolds what it finds.
  const [unfolded, setUnfolded] = useStoredState<string[]>("oniric.team.unfolded", []);
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
        <div className="bible-toolbar">
          {team.crew.length > 0 && <SearchBox value={query} onChange={setQuery} placeholder={t("team.searchCrew")} label={t("team.searchCrewLabel")} />}
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
        ) : (
          <div className="pr-depts">
            {groups.map((g) => {
              const open = !!needle || unfolded.includes(g.id);
              const heads = team.crew.filter((m) => m.department === g.id && m.head);
              const unsent = g.members.filter((m) => m.contract === "none").length;
              const sent = g.members.filter((m) => m.contract === "sent").length;
              return (
                <section key={g.id} className="pr-dept" aria-label={departmentName(g.id)}>
                  <h2>
                    <button
                      type="button"
                      className="pr-dept-head"
                      aria-expanded={open}
                      disabled={!!needle}
                      onClick={() => setUnfolded(open ? unfolded.filter((d) => d !== g.id) : [...unfolded, g.id])}
                    >
                      <ChevronRight className="pr-dept-caret" aria-hidden="true" />
                      <span className="pr-dept-name">
                        <span>{departmentName(g.id)}</span>
                        <span className="pr-count">{g.members.length}</span>
                      </span>
                      <span className="pr-dept-lead">
                        {heads.length > 0 ? (
                          <>
                            <Avatar name={contact.get(heads[0].contactId)?.name ?? "?"} photo={contact.get(heads[0].contactId)?.data.photo} size={22} />
                            <span className="pr-dept-lead-name">{heads.map((m) => contact.get(m.contactId)?.name).join(", ")}</span>
                            <Crown className="pr-dept-crown" aria-label={t("team.head")} />
                          </>
                        ) : (
                          <span className="muted">{t("team.noHead")}</span>
                        )}
                      </span>
                      <span className="pr-dept-state">
                        {unsent > 0 && <span className="badge">{plural("team.deptUnsent", unsent)}</span>}
                        {sent > 0 && <span className="badge warn">{plural("team.deptSent", sent)}</span>}
                      </span>
                    </button>
                  </h2>
                  {open && (
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
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
      {editing && (
        <CrewDialog
          team={team}
          member={editing === "new" ? null : editing}
          onSaved={(department) => !unfolded.includes(department) && setUnfolded([...unfolded, department])}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const OTHER = "\u0000other";

/** A post of the crew, new or to change; `contactId` chooses the person of a new one. */
function CrewDialog({ team, member, contactId, onSaved, onClose }: { team: Team; member: CrewMember | null; contactId?: string; onSaved?: (department: string) => void; onClose: () => void }) {
  const { prompt, notify, openSettings } = useProject();
  const catalog = useCatalog();
  const [draft, setDraft] = useState<Omit<CrewMember, "id" | "rank">>(
    member ?? { contactId: contactId ?? team.contacts[0]?.id ?? "", department: "direction", role: "", head: false, startDate: null, endDate: null, rate: "", contract: "none" },
  );
  const roles = rolesOf(draft.department, catalog);
  const role = draft.role || roles[0] || "";
  const set = (p: Partial<typeof draft>) => setDraft({ ...draft, ...p });
  const save = async () => {
    try {
      if (member) await updateCrew(member.id, { ...draft, role });
      else await addCrew(team.crew, { ...draft, role });
      onSaved?.(draft.department);
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
                if (!roles.includes(name)) {
                  await writeCatalog(addRole(catalog, draft.department, name));
                  notify({
                    text: t("team.roleAdded", { role: name, department: departmentName(draft.department) }),
                    actions: [{ label: t("team.managePosts"), onClick: () => openSettings("posts") }],
                  });
                }
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
      <main className="view-main pr-frame-main">
        <div className="pr-frame">
          <div className="pr-frame-scroll">
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
          </div>
          <button type="button" className="pr-frame-add" onClick={() => void addPart()}>
            <Plus aria-hidden="true" />
            {t("team.addPart")}
          </button>
        </div>
      </main>
    </div>
  );
}

const statusTone: Record<CandidateStatus, string> = { candidate: "", audition: "warn", shortlist: "warn", chosen: "ok", declined: "danger" };

const kindIcons: Record<CastKind, LucideIcon> = { lead: Star, supporting: UserRound, bit: MessageCircle, extra: Users, double: Copy, stunt: Zap };

/** The parts to cast, the people seen for each, their auditions, and the final choice [EQU-06]. */
function CastingTab({ team, onContact }: { team: Team; onContact: (id: string) => void }) {
  const { project, ask, notify } = useProject();
  const characters = useCharacters(team).filter((c) => (team.cast.find((r) => r.character === c.name)?.kind ?? "supporting") !== "extra");
  const [picked, setPicked] = useState<string | null>(null);
  const kindOf = (name: string) => team.cast.find((r) => r.character === name)?.kind ?? "supporting";
  const current = characters.find((c) => c.name === picked) ?? null;
  const role = current ? team.cast.find((r) => r.character === current.name) : undefined;
  const candidates = role ? team.candidates.filter((c) => c.roleId === role.id) : [];
  const contact = new Map(team.contacts.map((c) => [c.id, c]));
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const create = useNewContact();
  const actorOf = (name: string) => {
    const r = team.cast.find((x) => x.character === name);
    return r?.contactId ? contact.get(r.contactId) : undefined;
  };
  const kinds = CAST_KINDS.map((k) => {
    const parts = characters.filter((c) => kindOf(c.name) === k);
    const category: TeamCategory = { id: k, title: t(`team.kindGroups.${k}`), icon: kindIcons[k], count: `${parts.filter((c) => actorOf(c.name)).length}/${parts.length}`, countHint: t("team.partsFilled") };
    return { category, parts };
  }).filter((g) => g.parts.length > 0);
  useLevels({
    home: t("team.tabs.casting"),
    group: null,
    count: 0,
    page: current ? { id: current.name, name: current.name } : null,
    onHome: () => {},
    onClosePage: () => setPicked(null),
  });

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
  const partCards = (parts: typeof characters, heading: "h2" | "h3") => (
    <ul className="entry-cards">
      {parts.map((c) => {
        const r = team.cast.find((x) => x.character === c.name);
        const n = r ? team.candidates.filter((x) => x.roleId === r.id && x.status !== "declined").length : 0;
        const actor = actorOf(c.name);
        return (
          <TeamCard
            key={c.name}
            id={c.name}
            heading={heading}
            name={c.name}
            face={actor ? <Avatar name={actor.name} photo={actor.data.photo} size={32} /> : <span className="pr-seat" aria-hidden="true" />}
            sub={actor ? actor.name : n ? <span className="pr-card-warn">{plural("team.candidates", n)}</span> : <span className="muted">{t("team.toCast")}</span>}
            meta={<span className={c.scenes ? "entry-card-where" : "entry-card-where none"}>{plural("team.inScenes", c.scenes)}</span>}
            onOpen={() => setPicked(c.name)}
          />
        );
      })}
    </ul>
  );
  return (
    <div className="view pr-view">
      <main key={current?.name ?? ""} className="view-main wide">
        {!current && <FoundSections sections={kinds.map((g) => ({ category: g.category, n: g.category.count, cards: partCards(g.parts, "h3") }))} />}
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

const departmentIcons: Record<string, LucideIcon> = {
  production: Briefcase,
  writing: PenLine,
  direction: Clapperboard,
  camera: Camera,
  grip: Lightbulb,
  sound: Mic,
  art: Palette,
  wardrobe: Shirt,
  cast: Drama,
  effects: Sparkles,
  post: Film,
  music: Music,
  logistics: Truck,
  release: Megaphone,
  finance: Wallet,
};

const NO_POST = "\u0000others";

/** The contacts by what they are on the film: their department, the actors with who plays or auditions, then the others. Someone with two posts is in both. */
function contactGroups(team: Team): { id: string; title: string; icon: LucideIcon; people: Contact[] }[] {
  const crew = team.crew.map((m) => m.department);
  const acting = new Set([...team.cast.map((r) => r.contactId), ...team.candidates.map((c) => c.contactId)]);
  const isIn = (c: Contact, d: string) => team.crew.some((m) => m.contactId === c.id && m.department === d) || (d === "cast" && acting.has(c.id));
  return [
    ...[...new Set<string>([...DEPARTMENTS, ...crew])].map((d) => ({ id: d, title: departmentName(d), icon: departmentIcons[d] ?? Users, people: team.contacts.filter((c) => isIn(c, d)) })),
    { id: NO_POST, title: t("team.otherContacts"), icon: ContactIcon, people: team.contacts.filter((c) => !acting.has(c.id) && !team.crew.some((m) => m.contactId === c.id)) },
  ].filter((g) => g.people.length > 0);
}

/** The people of the project, their cards, and the address book of the computer [EQU-01, EQU-07, EQU-08]. */
function ContactsTab({ team, opened, onOpen }: { team: Team; opened: string | null; onOpen: (id: string | null) => void }) {
  const [query, setQuery] = useState("");
  const create = useNewContact();
  const groups = contactGroups(team);
  // A contact opened from elsewhere lands in its category, which its page then leads back to.
  const [group, setGroup] = useState<string | null>(() => groups.find((g) => g.people.some((c) => c.id === opened))?.id ?? null);
  const needle = fold(query.trim());
  const matches = (c: Contact) => !needle || fold(`${c.name} ${c.data.trades.join(" ")} ${c.data.email} ${rolesLine(team, c)}`).includes(needle);
  const inGroup = groups.find((g) => g.id === group);
  const shown = inGroup?.people.filter(matches) ?? [];
  const current = team.contacts.find((c) => c.id === opened) ?? null;
  const go = (next: string | null) => {
    setGroup(next);
    setQuery("");
  };
  useLevels({
    home: t("team.tabs.contacts"),
    group: inGroup ?? null,
    count: shown.length,
    page: current,
    onHome: () => go(null),
    onClosePage: () => onOpen(null),
  });
  const addContact = () =>
    void create(query).then((id) => {
      if (!id) return;
      // Without a post yet: that is where it waits when its page closes.
      go(NO_POST);
      onOpen(id);
    });
  const personCards = (people: Contact[], heading: "h2" | "h3") => (
    <ul className="entry-cards">
      {people.map((c) => (
        <TeamCard key={c.id} id={c.id} heading={heading} name={c.name} face={<Avatar name={c.name} photo={c.data.photo} size={32} />} sub={rolesLine(team, c) || c.data.trades.join(", ")} onOpen={() => onOpen(c.id)} />
      ))}
    </ul>
  );
  const found = groups.map((g) => ({ g, people: g.people.filter(matches) })).filter((x) => x.people.length > 0);
  const noMatch = !!needle && (inGroup ? shown.length === 0 : found.length === 0);
  return (
    <div className="view pr-view">
      <main key={current?.id ?? group ?? ""} className={current ? "view-main" : "view-main wide"}>
        {current ? (
          <ContactPane key={current.id} team={team} contact={current} onGone={() => onOpen(null)} />
        ) : team.contacts.length === 0 ? (
          <EmptyState title={t("team.contactsEmptyTitle")}>
            <p className="muted">{t("team.contactsEmptyText")}</p>
            <p className="empty-actions">
              <button type="button" className="btn primary" onClick={addContact}>
                <Plus aria-hidden="true" />
                {t("team.newContact")}
              </button>
            </p>
          </EmptyState>
        ) : (
          <>
            <div className="bible-toolbar">
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder={t("team.searchContacts")}
                label={inGroup ? t("bible.searchInLabel", { title: inGroup.title }) : t("team.searchContactsLabel")}
              />
              <button type="button" className="btn primary" onClick={addContact}>
                <Plus aria-hidden="true" />
                {t("team.newContact")}
              </button>
            </div>
            {inGroup ? (
              personCards(shown, "h2")
            ) : needle ? (
              <FoundSections
                sections={found.map(({ g, people }) => ({ category: { ...g, count: String(g.people.length) }, n: people.length, cards: personCards(people, "h3") }))}
                onCategory={go}
              />
            ) : (
              <CategoryCards categories={groups.map((g) => ({ ...g, count: String(g.people.length) }))} onOpen={go} />
            )}
            <p className="entry-cards-none muted" role="status">
              {noMatch ? t("team.nothingFound") : ""}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

/** « Cadreur · Joue MARIE »: what a person is in the project. */
function rolesLine(team: Team, c: Contact): string {
  return [...team.crew.filter((m) => m.contactId === c.id).map((m) => m.role), ...team.cast.filter((r) => r.contactId === c.id).map((r) => t("team.plays", { name: r.character }))].join(" · ");
}

function ContactPane({ team, contact, onGone }: { team: Team; contact: Contact; onGone: () => void }) {
  const { project, ask, notify } = useProject();
  const [secret, setSecret] = useState(false);
  const [post, setPost] = useState<CrewMember | "new" | null>(null);
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

      <Section
        title={t("team.onFilm")}
        aside={
          <button type="button" className="btn small" onClick={() => setPost("new")}>
            <UserPlus aria-hidden="true" />
            {t("team.addToCrew")}
          </button>
        }
      >
        {posts.length === 0 ? (
          <p className="muted small">{t("team.onFilmHelp")}</p>
        ) : (
          <ul className="pr-chips-list">
            {posts.map((m) => (
              <li key={m.id} className="pr-chip">
                {m.head && <Crown aria-hidden="true" />}
                <button type="button" className="pr-link" title={t("team.editPost")} onClick={() => setPost(m)}>
                  {m.role}
                </button>
                <span className="muted">{departmentName(m.department)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

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
      {post && <CrewDialog team={team} member={post === "new" ? null : post} contactId={contact.id} onClose={() => setPost(null)} />}
    </div>
  );
}
