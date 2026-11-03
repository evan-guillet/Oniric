import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson, useLive } from "../../../core/db/live";
import type { CandidateStatus, CastKind, ContractStatus, TableName } from "../../../core/db/schema";
import { readAppSetting, writeAppSetting } from "../../../core/appSettings";
import { uuidv7 } from "../../../core/ids";
import { rankBetween } from "../../../core/ordering";
import { readSetting, writeSetting } from "../../script/screenplay/application/settings";
import type { CatalogChanges } from "../domain/catalog";
import { contactData, type Card, type ContactData } from "../domain/contacts";

export const TEAM_TABLES: TableName[] = ["contact", "crew_member", "cast_role", "casting_candidate", "unavailability"];

export interface Contact {
  id: string;
  name: string;
  data: ContactData;
  bookId: string | null;
  updatedAt: string;
}

export interface CrewMember {
  id: string;
  contactId: string;
  department: string;
  role: string;
  head: boolean;
  rank: string;
  startDate: string | null;
  endDate: string | null;
  rate: string;
  contract: ContractStatus;
}

export interface CastRole {
  id: string;
  character: string;
  kind: CastKind;
  number: number | null;
  contactId: string | null;
  notes: string;
}

export interface Candidate {
  id: string;
  roleId: string;
  contactId: string;
  status: CandidateStatus;
  auditionAt: string | null;
  video: string | null;
  notes: string;
}

export interface Unavailable {
  id: string;
  contactId: string;
  start: string;
  end: string;
  note: string;
}

export interface Team {
  contacts: Contact[];
  crew: CrewMember[];
  cast: CastRole[];
  candidates: Candidate[];
  away: Unavailable[];
}

export async function loadTeam(): Promise<Team> {
  const [contacts, crew, cast, candidates, away] = await Promise.all([
    query(db.selectFrom("contact").selectAll().orderBy("name")),
    query(db.selectFrom("crew_member").selectAll().orderBy("rank")),
    query(db.selectFrom("cast_role").selectAll().orderBy("character")),
    query(db.selectFrom("casting_candidate").selectAll().orderBy("created_at")),
    query(db.selectFrom("unavailability").selectAll().orderBy("start_date")),
  ]);
  return {
    contacts: contacts.map((r) => ({ id: r.id, name: r.name, data: contactData(parseJson(r.data, {})), bookId: r.book_id, updatedAt: r.updated_at })),
    crew: crew.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      department: r.department,
      role: r.role,
      head: r.head === 1,
      rank: r.rank,
      startDate: r.start_date,
      endDate: r.end_date,
      rate: r.rate,
      contract: r.contract,
    })),
    cast: cast.map((r) => ({ id: r.id, character: r.character, kind: r.kind, number: r.number, contactId: r.contact_id, notes: r.notes })),
    candidates: candidates.map((r) => ({
      id: r.id,
      roleId: r.role_id,
      contactId: r.contact_id,
      status: r.status,
      auditionAt: r.audition_at,
      video: r.video,
      notes: r.notes,
    })),
    away: away.map((r) => ({ id: r.id, contactId: r.contact_id, start: r.start_date, end: r.end_date, note: r.note })),
  };
}

export function useTeam(): Team | undefined {
  return useLive(loadTeam, TEAM_TABLES);
}

export async function addContact(name: string, data: Partial<ContactData> = {}, bookId: string | null = null): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Nouveau contact", ["contact"], [
    db.insertInto("contact").values({ id, name: name.trim(), data: JSON.stringify(contactData(data)), book_id: bookId, created_at: now, updated_at: now }),
  ]);
  return id;
}

/** Several contacts at once, as an import brings them: one step to undo. */
export async function addContacts(cards: Card[]): Promise<number> {
  const now = nowIso();
  return write(
    "Contacts importés",
    ["contact"],
    cards.map((c) => db.insertInto("contact").values({ id: uuidv7(), name: c.name, data: JSON.stringify(c.data), book_id: null, created_at: now, updated_at: now })),
  );
}

export async function updateContact(id: string, patch: { name?: string; data?: ContactData; bookId?: string | null }): Promise<void> {
  await write("Contact", ["contact"], [
    db
      .updateTable("contact")
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.data !== undefined && { data: JSON.stringify(patch.data) }),
        ...(patch.bookId !== undefined && { book_id: patch.bookId }),
        updated_at: nowIso(),
      })
      .where("id", "=", id),
  ]);
}

/** Erases a person from the project, with their posts, candidacies, absences and calls [RGP-02]. */
export async function deleteContact(id: string): Promise<void> {
  await write("Contact supprimé", [...TEAM_TABLES, "call_recipient"], [db.deleteFrom("contact").where("id", "=", id)]);
}

export type CrewPatch = Partial<Omit<CrewMember, "id">>;

function crewColumns(p: CrewPatch) {
  return {
    ...(p.contactId !== undefined && { contact_id: p.contactId }),
    ...(p.department !== undefined && { department: p.department }),
    ...(p.role !== undefined && { role: p.role }),
    ...(p.head !== undefined && { head: p.head ? 1 : 0 }),
    ...(p.rank !== undefined && { rank: p.rank }),
    ...(p.startDate !== undefined && { start_date: p.startDate }),
    ...(p.endDate !== undefined && { end_date: p.endDate }),
    ...(p.rate !== undefined && { rate: p.rate }),
    ...(p.contract !== undefined && { contract: p.contract }),
  };
}

export async function addCrew(crew: CrewMember[], member: Omit<CrewMember, "id" | "rank">): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  const last = crew.reduce<string | null>((m, c) => (m === null || c.rank > m ? c.rank : m), null);
  await write("Poste ajouté", ["crew_member"], [
    db.insertInto("crew_member").values({
      id,
      contact_id: member.contactId,
      department: member.department,
      role: member.role,
      head: member.head ? 1 : 0,
      rank: rankBetween(last, null),
      start_date: member.startDate,
      end_date: member.endDate,
      rate: member.rate,
      contract: member.contract,
      created_at: now,
      updated_at: now,
    }),
  ]);
  return id;
}

export async function updateCrew(id: string, patch: CrewPatch): Promise<void> {
  await write("Poste", ["crew_member"], [db.updateTable("crew_member").set({ ...crewColumns(patch), updated_at: nowIso() }).where("id", "=", id)]);
}

export async function removeCrew(id: string): Promise<void> {
  await write("Poste retiré", ["crew_member"], [db.deleteFrom("crew_member").where("id", "=", id)]);
}

export type CastPatch = Partial<Omit<CastRole, "id" | "character">>;

/** Sets what is known of a part, creating it the first time. */
export async function setCast(character: string, patch: CastPatch, label = "Distribution"): Promise<void> {
  const now = nowIso();
  const set = {
    ...(patch.kind !== undefined && { kind: patch.kind }),
    ...(patch.number !== undefined && { number: patch.number }),
    ...(patch.contactId !== undefined && { contact_id: patch.contactId }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
  };
  await write(label, ["cast_role"], [
    db
      .insertInto("cast_role")
      .values({ id: uuidv7(), character, ...set, created_at: now, updated_at: now })
      .onConflict((oc) => oc.column("character").doUpdateSet({ ...set, updated_at: now })),
  ]);
}

/** The part of a character, created if it has none yet; returns its id. */
export async function ensureRole(cast: CastRole[], character: string): Promise<string> {
  const known = cast.find((c) => c.character === character);
  if (known) return known.id;
  await setCast(character, {}, "Rôle à pourvoir");
  const rows = await query(db.selectFrom("cast_role").select("id").where("character", "=", character));
  return rows[0].id;
}

export async function deleteCast(id: string): Promise<void> {
  await write("Rôle retiré", ["cast_role", "casting_candidate"], [db.deleteFrom("cast_role").where("id", "=", id)]);
}

export async function addCandidate(roleId: string, contactId: string): Promise<void> {
  const now = nowIso();
  await write("Candidat ajouté", ["casting_candidate"], [
    db
      .insertInto("casting_candidate")
      .values({ id: uuidv7(), role_id: roleId, contact_id: contactId, created_at: now, updated_at: now })
      .onConflict((oc) => oc.columns(["role_id", "contact_id"]).doNothing()),
  ]);
}

export async function updateCandidate(id: string, patch: Partial<Pick<Candidate, "status" | "auditionAt" | "video" | "notes">>): Promise<void> {
  await write("Casting", ["casting_candidate"], [
    db
      .updateTable("casting_candidate")
      .set({
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.auditionAt !== undefined && { audition_at: patch.auditionAt }),
        ...(patch.video !== undefined && { video: patch.video }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        updated_at: nowIso(),
      })
      .where("id", "=", id),
  ]);
}

export async function removeCandidate(id: string): Promise<void> {
  await write("Candidat retiré", ["casting_candidate"], [db.deleteFrom("casting_candidate").where("id", "=", id)]);
}

/** The final choice of a part [EQU-06]: the candidate gets it, the one chosen before goes back to the shortlist. */
export async function chooseCandidate(c: Candidate, all: Candidate[]): Promise<void> {
  const now = nowIso();
  await write("Rôle attribué", ["casting_candidate", "cast_role"], [
    ...all
      .filter((x) => x.roleId === c.roleId && x.id !== c.id && x.status === "chosen")
      .map((x) => db.updateTable("casting_candidate").set({ status: "shortlist", updated_at: now }).where("id", "=", x.id)),
    db.updateTable("casting_candidate").set({ status: "chosen", updated_at: now }).where("id", "=", c.id),
    db.updateTable("cast_role").set({ contact_id: c.contactId, updated_at: now }).where("id", "=", c.roleId),
  ]);
}

export async function addAway(contactId: string, start: string, end: string, note = ""): Promise<void> {
  const now = nowIso();
  const [from, to] = start <= end ? [start, end] : [end, start];
  await write("Indisponibilité", ["unavailability"], [
    db.insertInto("unavailability").values({ id: uuidv7(), contact_id: contactId, start_date: from, end_date: to, note, created_at: now, updated_at: now }),
  ]);
}

export async function removeAway(id: string): Promise<void> {
  await write("Indisponibilité retirée", ["unavailability"], [db.deleteFrom("unavailability").where("id", "=", id)]);
}

/**
 * The numbers of the parts on the strips [PDT-01]: those set by hand, then the others by their number of scenes,
 * the leads first; extras have none.
 */
export function castNumbers(characters: { name: string; scenes: number }[], cast: CastRole[]): Map<string, number> {
  const roleOf = new Map(cast.map((c) => [c.character, c]));
  const out = new Map<string, number>();
  const taken = new Set<number>();
  for (const c of cast) {
    if (c.number !== null && c.kind !== "extra") {
      out.set(c.character, c.number);
      taken.add(c.number);
    }
  }
  const order = { lead: 0, supporting: 1, bit: 2, double: 3, stunt: 4, extra: 5 };
  const rest = characters
    .filter((c) => !out.has(c.name) && roleOf.get(c.name)?.kind !== "extra")
    .sort((a, b) => order[roleOf.get(a.name)?.kind ?? "supporting"] - order[roleOf.get(b.name)?.kind ?? "supporting"] || b.scenes - a.scenes || a.name.localeCompare(b.name));
  let n = 1;
  for (const c of rest) {
    while (taken.has(n)) n++;
    out.set(c.name, n);
    taken.add(n);
  }
  return out;
}

const CATALOG = "crew_catalog";

async function readCatalog(): Promise<CatalogChanges> {
  return parseJson<CatalogChanges>(await readSetting(CATALOG), {});
}

export function useCatalog(): CatalogChanges {
  return useLive(readCatalog, ["project_setting"]) ?? {};
}

export function writeCatalog(c: CatalogChanges): Promise<number> {
  return writeSetting(CATALOG, JSON.stringify(c));
}

/** The address book of this computer, shared by every project [EQU-01]. */
export interface BookCard extends Card {
  id: string;
  updatedAt: string;
}

const BOOK = "contact_book";

export async function readBook(): Promise<BookCard[]> {
  const raw = await readAppSetting<unknown[]>(BOOK, []);
  return (Array.isArray(raw) ? raw : [])
    .filter((c): c is BookCard => !!c && typeof (c as BookCard).id === "string" && typeof (c as BookCard).name === "string")
    .map((c) => ({ ...c, data: contactData(c.data) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Writes a contact of the project into the address book, or updates the card it came from; returns the card's id. */
export async function saveToBook(c: Contact): Promise<string> {
  const book = await readBook();
  const id = c.bookId && book.some((b) => b.id === c.bookId) ? c.bookId : uuidv7();
  // Sensitive numbers stay in the project.
  const card: BookCard = { id, name: c.name, data: { ...c.data, ssn: "", iban: "" }, updatedAt: nowIso() };
  await writeAppSetting(BOOK, [...book.filter((b) => b.id !== id), card]);
  if (c.bookId !== id) await updateContact(c.id, { bookId: id });
  return id;
}

export async function removeFromBook(id: string): Promise<void> {
  await writeAppSetting(BOOK, (await readBook()).filter((b) => b.id !== id));
}

/** Copies cards of the address book into the project (specification, RG-04). */
export async function takeFromBook(cards: BookCard[]): Promise<number> {
  const now = nowIso();
  return write(
    "Contacts du carnet",
    ["contact"],
    cards.map((c) => db.insertInto("contact").values({ id: uuidv7(), name: c.name, data: JSON.stringify(c.data), book_id: c.id, created_at: now, updated_at: now })),
  );
}

/** Takes again what the address book holds for a contact, its sensitive numbers kept. */
export async function refreshFromBook(c: Contact): Promise<boolean> {
  const card = (await readBook()).find((b) => b.id === c.bookId);
  if (!card) return false;
  await updateContact(c.id, { name: card.name, data: { ...card.data, ssn: c.data.ssn, iban: c.data.iban } });
  return true;
}
