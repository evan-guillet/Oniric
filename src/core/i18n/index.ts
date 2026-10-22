import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./fr.json";

i18next.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const t = i18next.t.bind(i18next);
export default i18next;
