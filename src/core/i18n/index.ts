import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { readAppSetting, writeAppSetting } from "../appSettings";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";

/** The languages of the interface, each named in itself so anyone can find their own. */
export const LANGUAGES = [
  { id: "fr", name: "Français", locale: "fr-FR" },
  { id: "en", name: "English", locale: "en-US" },
  { id: "es", name: "Español", locale: "es-ES" },
] as const;
export type Language = (typeof LANGUAGES)[number]["id"];

const SETTING = "language";
/** Copy kept in the webview so the first frame is already in the right language. */
const CACHE = "oniric.language";

function isLanguage(v: unknown): v is Language {
  return LANGUAGES.some((l) => l.id === v);
}

/** Before any choice, the language of Windows when the interface has it, French otherwise (and in the tests). */
function systemLanguage(): Language {
  if (typeof document === "undefined") return "fr";
  const code = navigator.language.slice(0, 2);
  return isLanguage(code) ? code : "fr";
}

function cached(): Language {
  try {
    const c = localStorage.getItem(CACHE);
    if (isLanguage(c)) return c;
  } catch {
    // The cache only avoids a flash at startup.
  }
  return systemLanguage();
}

i18next.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en }, es: { translation: es } },
  lng: cached(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  returnNull: false,
});
// Outside a page (the tests), there is no document to mark.
if (typeof document !== "undefined") document.documentElement.lang = i18next.language;

function apply(l: Language) {
  document.documentElement.lang = l;
  try {
    localStorage.setItem(CACHE, l);
  } catch {
    // Ignored, see above.
  }
  if (i18next.language !== l) void i18next.changeLanguage(l);
}

/** Applies the language saved in the application database, if it differs from the cached one. */
export async function initLanguage(): Promise<void> {
  try {
    const saved = await readAppSetting<unknown>(SETTING, null);
    if (isLanguage(saved)) apply(saved);
  } catch {
    // Keep the cached language.
  }
}

export function getLanguage(): Language {
  return isLanguage(i18next.language) ? i18next.language : "fr";
}

/** The locale for dates and numbers in the interface. */
export function getLocale(): string {
  return LANGUAGES.find((l) => l.id === getLanguage())!.locale;
}

const formats = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();
function cachedFormat<F>(kind: string, options: object, make: (locale: string) => F): F {
  const key = `${kind}|${getLocale()}|${JSON.stringify(options)}`;
  if (!formats.has(key)) formats.set(key, make(getLocale()) as never);
  return formats.get(key) as F;
}

/** Dates in the interface's language; each format is made once per language. */
export const dateFormat = (o: Intl.DateTimeFormatOptions) => cachedFormat("date", o, (l) => new Intl.DateTimeFormat(l, o));
export const numberFormat = (o: Intl.NumberFormatOptions = {}) => cachedFormat("number", o, (l) => new Intl.NumberFormat(l, o));
export const relativeFormat = (o: Intl.RelativeTimeFormatOptions = {}) =>
  cachedFormat("relative", o, (l) => new Intl.RelativeTimeFormat(l, o));

/** A counted text: the key's plural forms (key_one, key_other), the number written with the language's separators as {{n}}. */
export const plural = (key: string, n: number, values: Record<string, unknown> = {}) =>
  i18next.t(key, { ...values, count: n, n: numberFormat().format(n) });

export async function setLanguage(l: Language): Promise<void> {
  apply(l);
  await writeAppSetting(SETTING, l);
}

export const t = i18next.t.bind(i18next);
export default i18next;
