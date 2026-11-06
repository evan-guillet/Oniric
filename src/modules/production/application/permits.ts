import { db, nowIso, query, write } from "../../../core/db/client";
import { parseJson, useLive } from "../../../core/db/live";
import type { PermitStatus, ReleaseStatus, TableName } from "../../../core/db/schema";
import { uuidv7 } from "../../../core/ids";
import { permitData, type PermitData, type PermitRef } from "../domain/permits";

export const PERMIT_TABLES: TableName[] = ["permit", "image_release", "insurance", "legal_document"];

export interface Permit extends PermitRef {
  kind: string;
  authority: string;
  data: PermitData;
}

export interface Release {
  id: string;
  contactId: string | null;
  name: string;
  status: ReleaseStatus;
  signedOn: string | null;
  document: string | null;
  notes: string;
}

export interface Insurance {
  id: string;
  locationId: string | null;
  activity: string;
  insurer: string;
  policy: string;
  start: string | null;
  end: string | null;
  document: string | null;
  notes: string;
}

export interface LegalDocument {
  id: string;
  model: string;
  title: string;
  body: string;
  locationId: string | null;
  permitId: string | null;
  updatedAt: string;
}

export interface Permits {
  permits: Permit[];
  releases: Release[];
  insurances: Insurance[];
  documents: LegalDocument[];
}

export async function loadPermits(): Promise<Permits> {
  const [permits, releases, insurances, documents] = await Promise.all([
    query(db.selectFrom("permit").selectAll().orderBy("created_at")),
    query(db.selectFrom("image_release").selectAll().orderBy("created_at")),
    query(db.selectFrom("insurance").selectAll().orderBy("created_at")),
    query(db.selectFrom("legal_document").selectAll().orderBy("created_at", "desc")),
  ]);
  return {
    permits: permits.map((r) => ({ id: r.id, locationId: r.location_id, kind: r.kind, status: r.status, authority: r.authority, start: r.start_date, end: r.end_date, deadline: r.deadline, data: permitData(parseJson(r.data, {})) })),
    releases: releases.map((r) => ({ id: r.id, contactId: r.contact_id, name: r.name, status: r.status, signedOn: r.signed_on, document: r.document, notes: r.notes })),
    insurances: insurances.map((r) => ({ id: r.id, locationId: r.location_id, activity: r.activity, insurer: r.insurer, policy: r.policy, start: r.start_date, end: r.end_date, document: r.document, notes: r.notes })),
    documents: documents.map((r) => ({ id: r.id, model: r.model, title: r.title, body: r.body, locationId: r.location_id, permitId: r.permit_id, updatedAt: r.updated_at })),
  };
}

export function usePermits(): Permits | undefined {
  return useLive(loadPermits, PERMIT_TABLES);
}

export async function addPermit(init: { locationId?: string | null; start?: string | null; end?: string | null } = {}): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Demande d'autorisation", ["permit"], [db.insertInto("permit").values({ id, location_id: init.locationId ?? null, start_date: init.start ?? null, end_date: init.end ?? null, deadline: null, created_at: now, updated_at: now })]);
  return id;
}

export async function updatePermit(id: string, patch: Partial<{ locationId: string | null; kind: string; status: PermitStatus; authority: string; start: string | null; end: string | null; deadline: string | null; data: PermitData }>): Promise<void> {
  const set = {
    ...(patch.locationId !== undefined && { location_id: patch.locationId }),
    ...(patch.kind !== undefined && { kind: patch.kind }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.authority !== undefined && { authority: patch.authority }),
    ...(patch.start !== undefined && { start_date: patch.start }),
    ...(patch.end !== undefined && { end_date: patch.end }),
    ...(patch.deadline !== undefined && { deadline: patch.deadline }),
    ...(patch.data && { data: JSON.stringify(patch.data) }),
    updated_at: nowIso(),
  };
  await write("Demande d'autorisation", ["permit"], [db.updateTable("permit").set(set).where("id", "=", id)]);
}

export async function deletePermit(id: string): Promise<void> {
  await write("Demande supprimée", ["permit", "legal_document"], [db.deleteFrom("permit").where("id", "=", id)]);
}

export async function addRelease(name = "", contactId: string | null = null): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Droit à l'image", ["image_release"], [db.insertInto("image_release").values({ id, name, contact_id: contactId, signed_on: null, document: null, created_at: now, updated_at: now })]);
  return id;
}

export async function updateRelease(id: string, patch: Partial<Omit<Release, "id">>): Promise<void> {
  const set = {
    ...(patch.contactId !== undefined && { contact_id: patch.contactId }),
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.signedOn !== undefined && { signed_on: patch.signedOn }),
    ...(patch.document !== undefined && { document: patch.document }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    updated_at: nowIso(),
  };
  await write("Droit à l'image", ["image_release"], [db.updateTable("image_release").set(set).where("id", "=", id)]);
}

export async function deleteRelease(id: string): Promise<void> {
  await write("Droit à l'image supprimé", ["image_release"], [db.deleteFrom("image_release").where("id", "=", id)]);
}

export async function addInsurance(): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Assurance", ["insurance"], [db.insertInto("insurance").values({ id, location_id: null, start_date: null, end_date: null, document: null, created_at: now, updated_at: now })]);
  return id;
}

export async function updateInsurance(id: string, patch: Partial<Omit<Insurance, "id">>): Promise<void> {
  const set = {
    ...(patch.locationId !== undefined && { location_id: patch.locationId }),
    ...(patch.activity !== undefined && { activity: patch.activity }),
    ...(patch.insurer !== undefined && { insurer: patch.insurer }),
    ...(patch.policy !== undefined && { policy: patch.policy }),
    ...(patch.start !== undefined && { start_date: patch.start }),
    ...(patch.end !== undefined && { end_date: patch.end }),
    ...(patch.document !== undefined && { document: patch.document }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    updated_at: nowIso(),
  };
  await write("Assurance", ["insurance"], [db.updateTable("insurance").set(set).where("id", "=", id)]);
}

export async function deleteInsurance(id: string): Promise<void> {
  await write("Assurance supprimée", ["insurance"], [db.deleteFrom("insurance").where("id", "=", id)]);
}

export async function addDocument(init: { model: string; title: string; body: string; locationId: string | null; permitId: string | null }): Promise<string> {
  const id = uuidv7();
  const now = nowIso();
  await write("Document", ["legal_document"], [
    db.insertInto("legal_document").values({ id, model: init.model, title: init.title, body: init.body, location_id: init.locationId, permit_id: init.permitId, created_at: now, updated_at: now }),
  ]);
  return id;
}

export async function updateDocument(id: string, patch: { title?: string; body?: string }): Promise<void> {
  await write("Document", ["legal_document"], [db.updateTable("legal_document").set({ ...patch, updated_at: nowIso() }).where("id", "=", id)]);
}

export async function deleteDocument(id: string): Promise<void> {
  await write("Document supprimé", ["legal_document"], [db.deleteFrom("legal_document").where("id", "=", id)]);
}
