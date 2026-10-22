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

export async function readProfile(): Promise<Profile> {
  return { ...EMPTY_PROFILE, ...(await readAppSetting<Partial<Profile>>("profile", {})) };
}

export function writeProfile(p: Profile): Promise<void> {
  return writeAppSetting("profile", p);
}
