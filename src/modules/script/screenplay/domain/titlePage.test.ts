import { describe, expect, it } from "vitest";
import { emptyTitlePage, formatTitleDate, normalizeTitlePage, resolveTitlePage } from "./titlePage";

const auto = { version: "V3", date: "23 octobre 2026" };

describe("title page", () => {
  it("takes the version and the date from the project, and drops empty author lines", () => {
    const p = { ...emptyTitlePage("Les Heures Bleues"), version: "Brouillon", date: "hier", authors: "Lise Ferrand\n \nMarc Aubry\n" };
    expect(resolveTitlePage(p, auto)).toMatchObject({ version: "V3", date: "23 octobre 2026", authors: "Lise Ferrand\nMarc Aubry" });
  });

  it("writes the chosen mention out, and keeps a custom one as typed", () => {
    const p = { ...emptyTitlePage("X"), authors: "Lise Ferrand\nMarc Aubry", notes: "Ma mention" };
    expect(resolveTitlePage({ ...p, mention: "copyright" }, auto, null, 2026).notes).toBe("© 2026 Lise Ferrand, Marc Aubry. Tous droits réservés.");
    expect(resolveTitlePage({ ...p, mention: "sacd" }, auto).notes).toBe("Œuvre déposée à la SACD");
    expect(resolveTitlePage({ ...p, mention: "custom" }, auto).notes).toBe("Ma mention");
    expect(resolveTitlePage({ ...p, mention: "none" }, auto).notes).toBe("");
  });

  it("keeps what an older title page had typed", () => {
    const old = { title: "X", authors: "A", basedOn: "", version: "V2", date: "", contact: "", notes: "Dépôt SACD", include: true };
    expect(normalizeTitlePage(old)).toMatchObject({ subtitle: "", mention: "custom" });
  });

  it("takes each contact field from the profile unless the script sets its own, then adds the lines typed under it", () => {
    const profile = { name: "Lise Ferrand", address: "", phone: "06 12 34 56 78", email: "lise@exemple.fr", agent: "Agence Lumière" };
    const p = { ...emptyTitlePage("X"), contactFields: { phone: "", email: "contact@film.fr" }, contact: "Production Aube" };
    expect(resolveTitlePage(p, auto, profile).contact).toBe("Lise Ferrand\ncontact@film.fr\nAgence Lumière\nProduction Aube");
    expect(resolveTitlePage(emptyTitlePage("X"), auto, null).contact).toBe("");
  });

  it("prints the contact of an older title page as it was, without the profile", () => {
    const old = normalizeTitlePage({ title: "X", contact: "Marc Aubry\nmarc@exemple.fr" });
    expect(resolveTitlePage(old, auto, { name: "Lise Ferrand", email: "lise@exemple.fr" }).contact).toBe("Marc Aubry\nmarc@exemple.fr");
    expect(normalizeTitlePage({ title: "X" }).contactFields).toEqual({});
  });

  it("writes the date in the screenplay's language", () => {
    const d = new Date(2026, 9, 23);
    expect(formatTitleDate(d, "fr")).toBe("23 octobre 2026");
    expect(formatTitleDate(d, "en")).toBe("October 23, 2026");
  });
});
