import { useSyncExternalStore } from "react";
import { readAppSetting, writeAppSetting } from "../../../core/appSettings";

/** The user, as printed on title pages and documents [9.1, Profil]. Kept on this PC only. */
export interface Profile {
  name: string;
  email: string;
  phone: string;
  address: string;
  agent: string;
}

export const EMPTY_PROFILE: Profile = { name: "", email: "", phone: "", address: "", agent: "" };

// The profile once read, shared by the settings and the title pages that follow it.
let current: Profile | null = null;
const listeners = new Set<() => void>();

export async function readProfile(): Promise<Profile> {
  return { ...EMPTY_PROFILE, ...(await readAppSetting<Partial<Profile>>("profile", {})) };
}

export async function writeProfile(p: Profile): Promise<void> {
  current = p;
  listeners.forEach((l) => l());
  await writeAppSetting("profile", p);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (!current)
    void readProfile()
      .then((p) => {
        current ??= p;
        listeners.forEach((f) => f());
      })
      .catch(() => {
        // Empty until the next change.
      });
  return () => listeners.delete(l);
}

/** The profile, live: null while it is read. */
export function useProfile(): Profile | null {
  return useSyncExternalStore(subscribe, () => current);
}
