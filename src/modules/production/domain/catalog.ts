/** The catalog of posts, by department (specification, 16.1), preloaded in every project and adapted by it [EQU-03]. */

import { t } from "../../../core/i18n";

export const DEPARTMENTS = [
  "production",
  "writing",
  "direction",
  "camera",
  "grip",
  "sound",
  "art",
  "wardrobe",
  "cast",
  "effects",
  "post",
  "music",
  "logistics",
  "release",
  "finance",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const departmentName = (d: string) => t(`team.departments.${d}`, { defaultValue: d });

/** The posts the catalog gives a department, in the language of the interface. */
export function catalogRoles(d: string): string[] {
  const roles = t(`team.roles.${d}`, { returnObjects: true, defaultValue: [] }) as unknown;
  return Array.isArray(roles) ? (roles as string[]) : [];
}

/** What a project changed in the catalog: posts added and posts taken away, by department. */
export type CatalogChanges = Record<string, { added?: string[]; removed?: string[] }>;

export function rolesOf(d: string, changes: CatalogChanges): string[] {
  const c = changes[d] ?? {};
  const removed = new Set(c.removed ?? []);
  return [...catalogRoles(d).filter((r) => !removed.has(r)), ...(c.added ?? [])];
}

export function addRole(changes: CatalogChanges, d: string, role: string): CatalogChanges {
  const c = changes[d] ?? {};
  const name = role.trim();
  if (!name) return changes;
  if (catalogRoles(d).includes(name)) return { ...changes, [d]: { ...c, removed: (c.removed ?? []).filter((r) => r !== name) } };
  if ((c.added ?? []).includes(name)) return changes;
  return { ...changes, [d]: { ...c, added: [...(c.added ?? []), name] } };
}

export function removeRole(changes: CatalogChanges, d: string, role: string): CatalogChanges {
  const c = changes[d] ?? {};
  if (catalogRoles(d).includes(role)) return { ...changes, [d]: { ...c, removed: [...new Set([...(c.removed ?? []), role])] } };
  return { ...changes, [d]: { ...c, added: (c.added ?? []).filter((r) => r !== role) } };
}

/** The parts of the cast, from the leads to the stunts [EQU-05]. */
export const CAST_KINDS = ["lead", "supporting", "bit", "extra", "double", "stunt"] as const;

export const CANDIDATE_STATUSES = ["candidate", "audition", "shortlist", "chosen", "declined"] as const;

export const CONTRACTS = ["none", "sent", "signed"] as const;

/** How a person is engaged [EQU-01]. */
export const REGIMES = ["", "intermittent", "employee", "contractor", "volunteer"] as const;
export type Regime = (typeof REGIMES)[number];
