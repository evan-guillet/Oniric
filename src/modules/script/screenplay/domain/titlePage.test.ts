import { describe, expect, it } from "vitest";
import { emptyTitlePage, formatTitleDate, normalizeTitlePage, resolveTitlePage } from "./titlePage";

const auto = { version: "V3", date: "23 octobre 2026" };

describe("title page", () => {
  it("fills the version and the date from the project until they are typed over", () => {
    const p = { ...emptyTitlePage("Les Heures Bleues"), version: "Brouillon", date: "hier" };
    expect(resolveTitlePage(p, auto)).toMatchObject({ version: "V3", date: "23 octobre 2026" });
    expect(resolveTitlePage({ ...p, autoVersion: false, autoDate: false }, auto)).toMatchObject({ version: "Brouillon", date: "hier" });
  });

  it("writes the chosen mention out, and keeps a custom one as typed", () => {
    const p = { ...emptyTitlePage("X"), authors: "Lise Ferrand\nMarc Aubry", notes: "Ma mention" };
    expect(resolveTitlePage({ ...p, mention: "copyright" }, auto, 2026).notes).toBe("© 2026 Lise Ferrand, Marc Aubry. Tous droits réservés.");
    expect(resolveTitlePage({ ...p, mention: "sacd" }, auto).notes).toBe("Œuvre déposée à la SACD");
    expect(resolveTitlePage({ ...p, mention: "custom" }, auto).notes).toBe("Ma mention");
    expect(resolveTitlePage({ ...p, mention: "none" }, auto).notes).toBe("");
  });

  it("keeps what an older title page had typed", () => {
    const old = { title: "X", authors: "A", basedOn: "", version: "V2", date: "", contact: "", notes: "Dépôt SACD", include: true };
    expect(normalizeTitlePage(old)).toMatchObject({ subtitle: "", autoVersion: false, autoDate: true, mention: "custom" });
  });

  it("writes the date in the screenplay's language", () => {
    const d = new Date(2026, 9, 23);
    expect(formatTitleDate(d, "fr")).toBe("23 octobre 2026");
    expect(formatTitleDate(d, "en")).toBe("October 23, 2026");
  });
});
