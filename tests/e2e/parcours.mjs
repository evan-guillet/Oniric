// Usage: npm run e2e -- chemin\vers\Oniric.exe   (Windows)
// Drives the real application through the WebView2 debugging port (architecture, 12.1):
//   P1  create a project, write a scene, export the PDF in both formats, export Fountain, close;
//   P5  crash (taskkill) then recovery, in both choices, and a window close with unsaved typing;
//   the 5 reference screenplays of tests/corpus: import, PDF in both formats, PDF checked line by line;
//   startup time, opening and typing latency on 120 pages;
//   v0.5 « Écrire »: workshop, bible and wiki links, board, frozen versions, FDX round trip, backups.
import { chromium } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const exe = process.argv[2];
if (!exe) {
  console.error("Indiquez le chemin de Oniric.exe.");
  process.exit(2);
}
const root = path.join(os.tmpdir(), "oniric-e2e");
const out = path.resolve("tests", "e2e", "resultats");
const corpus = path.resolve("tests", "corpus");
await rm(root, { recursive: true, force: true });
await rm(out, { recursive: true, force: true });
await mkdir(root, { recursive: true });
await mkdir(out, { recursive: true });

const data = path.join(root, "donnees");
const projects = path.join(root, "Projets");
const title = "Les Heures Bleues";
const projectDir = path.join(projects, title);
const exportsDir = path.join(projectDir, "exports");
const results = { checks: [], pdf: [], timings: {} };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))];
let failed = false;
// On a failure, a picture of the window shows what the step was waiting for.
process.on("uncaughtException", async (e) => {
  console.error(e);
  await page?.screenshot({ path: path.join(out, "echec.png") }).catch(() => {});
  process.exit(1);
});
function check(ok, label) {
  if (!ok) failed = true;
  results.checks.push({ ok, label });
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
}

let port = 9350;
let app;
let browser;
let page;
let exited;
async function launch(env = {}) {
  port++;
  app = spawn(exe, [], {
    env: { ...process.env, ONIRIC_DONNEES: data, ONIRIC_RECOPIE_S: "600",
      // A profile of its own: the remembered side bar, language and theme of the real application stay out of it.
      WEBVIEW2_USER_DATA_FOLDER: path.join(root, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, ...env },
    stdio: "ignore",
  });
  exited = new Promise((r) => app.on("exit", r));
  for (let i = 0; i < 150; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      page = browser.contexts()[0].pages()[0];
      page.on("pageerror", (e) => check(false, `erreur de la page : ${e.message}`));
      await page.waitForSelector(".home", { timeout: 15000 });
      // Wide enough for the full side bar: below, it folds to a rail of icons.
      await page.setViewportSize({ width: 1600, height: 1000 });
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Impossible de joindre WebView2");
}
async function kill() {
  execFileSync("taskkill", ["/F", "/T", "/PID", String(app.pid)], { stdio: "ignore" });
  await browser.close().catch(() => {});
  await exited;
  await sleep(300);
}
const button = (name) => page.getByRole("button", { name, exact: true });
/** Exports the screenplay through the project menu's Exporter dialog: `kind` is PDF, Fountain or FDX. */
async function exportAs(kind) {
  await projectMenu("Exporter…");
  await page.locator("dialog.dialog").getByRole("radio", { name: new RegExp(`^${kind}`) }).check();
  await page.locator("dialog.dialog").getByRole("button", { name: "Exporter", exact: true }).click();
}
/** Opens the project menu at the top of the side bar and picks `name`. */
async function projectMenu(name) {
  await page.locator(".shell-brand").click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
/** « Fermer », at the foot of the side bar. */
const closeProject = () => page.locator(".shell-nav .nav-close").click();
const editorText = () => page.locator(".ProseMirror").innerText();
const saveState = () => page.locator(".save-state").textContent();
const waitSaved = () => page.waitForFunction(() => document.querySelector(".save-state")?.textContent === "Enregistré", null, { timeout: 15000 });
async function openRecent() {
  await page.locator(".recent-open", { hasText: title }).click();
}
const nav = (name) => page.locator(".shell-nav").getByRole("button", { name, exact: true }).click();
/** A project opens on its dashboard: the screenplay is one step away. */
async function waitEditor() {
  await page.waitForSelector(".shell-nav", { timeout: 30000 });
  await nav("Scénario");
  await page.waitForSelector(".ProseMirror", { timeout: 30000 });
  await page.waitForFunction(() => window.__oniric?.editor);
}

/** Exports the PDF in the current format, keeps it under `name`, and compares it with the computed layout. */
async function exportAndVerify(name) {
  const expected = await page.evaluate(() => window.__oniric.expectedPdf());
  const t0 = Date.now();
  await exportAs("PDF");
  await page.waitForFunction(() => [...document.querySelectorAll(".toast p")].some((p) => p.textContent.includes(".pdf")), null, { timeout: 60000 });
  const ms = Date.now() - t0;
  const produced = (await readdir(exportsDir)).find((f) => f.endsWith(".pdf") && f.includes(expected.format === "fr" ? "(A4)" : "(Letter)"));
  const pdf = path.join(out, `${name}-${expected.format}.pdf`);
  await copyFile(path.join(exportsDir, produced), pdf);
  await writeFile(pdf.replace(/\.pdf$/, ".attendu.json"), JSON.stringify(expected));
  let verdict;
  let ok = true;
  try {
    verdict = execFileSync(process.execPath, ["scripts/verifier-pdf.mjs", pdf], { encoding: "utf8" }).trim().split("\n");
  } catch (e) {
    ok = false;
    verdict = String(e.stdout).trim().split("\n");
  }
  const lines = expected.pages.reduce((n, p) => n + p.lines.length, 0);
  results.pdf.push({ name, format: expected.format, pages: expected.pages.length, lines, ms, ok });
  check(ok, `${name} (${expected.format}) : ${expected.pages.length} pages, PDF en ${ms} ms — ${verdict.at(-1)}`);
  await page.locator(".toast-close").first().click().catch(() => {});
}
async function setFormat(id) {
  await page.evaluate((id) => window.__oniric.setFormat(id), id);
  await page.waitForTimeout(300);
}

// ------------------------------------------------------------------ startup
console.log("Démarrage (10 lancements)");
const startups = [];
for (let i = 0; i < 10; i++) {
  const file = path.join(root, `demarrage-${i}.txt`);
  await new Promise((resolve) => spawn(exe, [], { env: { ...process.env, ONIRIC_DONNEES: data, ONIRIC_MESURE_DEMARRAGE: file }, stdio: "ignore" }).on("exit", resolve));
  startups.push(Number(await readFile(file, "utf8")));
}
results.timings.startupMs = { first: startups[0], median: median(startups), max: Math.max(...startups) };
check(startups.every((ms) => ms > 0 && ms < 3000), `interface prête en ${median(startups)} ms (médiane), ${Math.max(...startups)} ms au plus`);

// ------------------------------------------------------------------ P1
console.log("\nP1 · Créer un projet, écrire une scène, exporter un PDF");
await launch();
// The home actions carry a hint under their label, which is part of their name.
await page.locator(".home-action", { hasText: "Nouveau projet" }).click();
await page.fill("input[name=title]", title);
await page.fill("input[name=location]", projects);
await button("Créer le projet").click();
await waitEditor();
check((await readdir(projectDir)).sort().join(",") === ".verrou,donnees.db,exports,medias,projet.oniric,versions", "dossier projet conforme (PRJ-06)");

const t0 = Date.now();
await page.keyboard.type("int. cuisine de marie – nuit");
await page.keyboard.press("Enter");
await page.keyboard.type("La lumière du frigo découpe MARIE (30 ans), qui boit du lait à même la bouteille.");
await page.keyboard.press("Enter");
await page.keyboard.press("Tab");
await page.keyboard.type("Marie");
await page.keyboard.press("Enter");
await page.keyboard.type("(sans se retourner)");
await page.keyboard.press("Enter");
await page.keyboard.type("Paul? Si c'est toi, dis quelque chose de gentil.");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.type("ext. toit de l'immeuble – aube");
await page.keyboard.press("Enter");
await page.keyboard.type("Le ciel pâlit au-dessus des cheminées.");
const typingMs = Date.now() - t0;
const types = await page.locator(".ProseMirror .el").evaluateAll((els) => els.map((e) => e.dataset.type));
check(
  types.join(",") === "scene_heading,action,character,parenthetical,dialogue,scene_heading,action",
  `Entrée, Tab et « INT. » enchaînent les bons éléments (${types.length} éléments)`,
);
check((await editorText()).includes("Paul ? Si"), "espace insécable automatique avant « ? »");
check((await page.locator(".scene-list li").count()) === 2, "la liste montre 2 scènes");
await waitSaved();
check(true, `scène écrite en ${typingMs} ms et enregistrée`);
await page.keyboard.press("Control+s");
await page.waitForFunction(() => document.querySelector(".save-state")?.title.includes("Dernière recopie"), null, { timeout: 10000 });
check(true, "Ctrl+S recopie dans le dossier du projet");
await exportAndVerify("p1");
await setFormat("us");
await exportAndVerify("p1");
await setFormat("fr");
await exportAs("Fountain");
await page.waitForFunction(() => [...document.querySelectorAll(".toast p")].some((p) => p.textContent.includes(".fountain")));
const fountain = await readFile(path.join(exportsDir, `${title}.fountain`), "utf8");
check(fountain.includes("INT. CUISINE DE MARIE – NUIT") && fountain.includes("MARIE\n(sans se retourner)"), "export Fountain");
await closeProject();
await page.waitForSelector(".home");
check((await page.locator(".recent-open", { hasText: title }).count()) === 1, "le projet apparaît dans les projets récents");
check(!(await readdir(projectDir)).includes(".verrou"), "fermeture : verrou retiré");

// ------------------------------------------------------------------ P5
console.log("\nP5 · Survivre à un plantage");
await openRecent();
await waitEditor();
check((await editorText()).includes("Le ciel pâlit"), "le projet se rouvre avec son texte");
await page.locator(".ProseMirror .el").last().click();
await page.keyboard.press("End");
await page.keyboard.type(" Texte écrit juste avant la coupure.");
await waitSaved();
await kill();
await launch();
await openRecent();
await page.getByRole("button", { name: "Restaurer mon travail" }).waitFor({ timeout: 10000 });
check(true, "à la réouverture, Oniric propose de restaurer le travail");
await button("Restaurer mon travail").click();
await waitEditor();
check((await editorText()).includes("juste avant la coupure"), "travail restauré : le texte tapé avant la coupure est là");
check(await page.locator(".toast p", { hasText: "Travail restauré" }).isVisible(), "un message confirme la restauration");

await page.locator(".ProseMirror .el").last().click();
await page.keyboard.press("End");
await page.keyboard.type(" Phrase à écarter.");
await waitSaved();
await kill();
await launch();
await openRecent();
await button("Ouvrir la version du dossier").click();
await waitEditor();
const folderText = await editorText();
check(!folderText.includes("juste avant la coupure") && folderText.includes("Le ciel pâlit"), "« version du dossier » : le dossier est ouvert tel qu'il était");
check(await page.locator(".toast p", { hasText: "mise de côté" }).isVisible(), "le travail écarté est mis de côté, pas effacé");

await page.locator(".ProseMirror .el").last().click();
await page.keyboard.press("End");
await page.keyboard.type(" Tapé puis fenêtre fermée aussitôt.");
await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:window|close", { label: "main" }));
const closedAlone = await Promise.race([exited.then(() => true), sleep(15000).then(() => false)]);
check(closedAlone, "fermer la fenêtre enregistre puis quitte");
await browser.close().catch(() => {});
await launch();
await openRecent();
await waitEditor();
check((await editorText()).includes("fenêtre fermée aussitôt"), "rien n'est perdu à la fermeture de la fenêtre, et aucune récupération n'est proposée");

// ------------------------------------------------------------------ corpus
console.log("\nScénarios de référence");
const files = (await readdir(corpus)).filter((f) => f.endsWith(".fountain")).sort();
check(files.length >= 5, `${files.length} scénarios de référence`);
for (const file of files) {
  const name = file.replace(/\.fountain$/, "");
  await page.setInputFiles("input.script-import", path.join(corpus, file));
  await button("Remplacer").click();
  await page.waitForFunction((f) => [...document.querySelectorAll(".toast p")].some((p) => p.textContent.includes(f)), file);
  await page.locator(".toast-close").first().click();
  await setFormat("fr");
  await exportAndVerify(name);
  await setFormat("us");
  await exportAndVerify(name);
}

// ------------------------------------------------------------------ 120 pages
console.log("\nPerformance sur 120 pages (format français)");
await setFormat("fr");
const pages = await page.evaluate(() => window.__oniric.editor.snapshot.pagination.pages.length);
await waitSaved();
await closeProject();
await page.waitForSelector(".home");
const o0 = Date.now();
await openRecent();
await waitEditor();
await page.waitForFunction((n) => window.__oniric.editor.snapshot.pagination.pages.length === n, pages);
const openMs = Date.now() - o0;
results.timings.open120Ms = openMs;
check(openMs < 2000, `ouverture d'un scénario de ${pages} pages en ${openMs} ms (< 2 s)`);
await page.evaluate(() => window.__oniric.editor.goToScene(Math.floor(window.__oniric.editor.doc.childCount / 2)));
await page.evaluate(() => (window.__oniric.editor.latencies.length = 0));
for (let i = 0; i < 120; i++) await page.keyboard.type(i % 6 === 5 ? " " : "x", { delay: 15 });
await sleep(300);
const lat = await page.evaluate(() => [...window.__oniric.editor.latencies]);
results.timings.typing120 = { median: median(lat), p95: p95(lat), max: Math.max(...lat), samples: lat.length };
check(p95(lat) < 50, `latence de frappe : médiane ${median(lat).toFixed(1)} ms, 95 % ${p95(lat).toFixed(1)} ms (< 50 ms)`);
const cold = await page.evaluate(() => {
  const e = window.__oniric.editor;
  e.setFormat(e.currentFormat);
  return e.snapshot.stats;
});
results.timings.coldLayout = cold;
check(cold.paginateMs < 50, `pagination complète : ${cold.paginateMs.toFixed(1)} ms ; mesure à froid de ${cold.blocks} éléments : ${cold.measureMs.toFixed(0)} ms`);
await waitSaved();
await closeProject();
await page.waitForSelector(".home");
await browser.close();
app.kill();
await exited;

// ------------------------------------------------------------------ v0.5
console.log("\nÉcrire (v0.5)");
await launch();
await openRecent();
await waitEditor();
const toast = (text) => page.waitForFunction((t) => [...document.querySelectorAll(".toast p")].some((p) => p.textContent.includes(t)), text, { timeout: 30000 });
const closeToasts = async () => {
  for (const b of await page.locator(".toast-close").all()) await b.click().catch(() => {});
};
const sceneCount = await page.evaluate(() => window.__oniric.editor.doc.childCount);

await nav("Atelier");
await page.fill("#w-prep\\.premise\\.who", "Une boulangère timide");
await nav("Bible");
await nav("Atelier");
check((await page.inputValue("#w-prep\\.premise\\.who")) === "Une boulangère timide", "atelier : un champ rempli est gardé d'une vue à l'autre (ATL-02)");

await nav("Bible");
// The bible finds the characters and places of the screenplay by itself; each card counts them.
await page.waitForFunction(() => document.querySelectorAll(".type-card-count").length > 0, null, { timeout: 15000 });
const detected = (await page.locator(".type-card-count").allInnerTexts()).reduce((n, t) => n + Number(t), 0);
await page.locator(".type-card[data-type=character]").click();
// A detected card becomes an entry as it opens.
await page.locator(".entry-card", { has: page.locator(".badge.detected") }).first().locator(".entry-card-open").click();
await page.waitForSelector("article.entry", { timeout: 15000 });
const saved = await page.evaluate(() =>
  window.__TAURI_INTERNALS__.invoke("db_query", { query: { sql: "SELECT count(*) FROM bible_entry", parameters: [] } }).then((r) => r.rows[0][0]),
);
check(detected > 0 && saved === 1, `bible : ${detected} personnages et lieux retrouvés dans le scénario, l'un d'eux devenu fiche en l'ouvrant (BIB-05)`);
const entries = 1;

await projectMenu("Exporter…");
await page.locator(".transfer-nav").getByRole("button", { name: /^Bible/ }).click();
await page.locator("dialog.dialog").getByRole("button", { name: "Exporter", exact: true }).click();
await toast(".json");
await closeToasts();
const bibleFile = (await readdir(exportsDir)).find((f) => f.startsWith("Bible") && f.endsWith(".json"));
await page.setInputFiles("input.bible-import", path.join(exportsDir, bibleFile));
await toast("Bible importée : 0 fiche(s) ajoutée(s)").then(
  () => check(true, `bible : exportée puis réimportée depuis la fenêtre Importer/Exporter du projet (${entries} fiche)`),
  () => check(false, "bible : réimport depuis la fenêtre Importer/Exporter"),
);
await closeToasts();

await nav("Scénario");
await page.evaluate(() => window.__oniric.editor.goToScene(0));
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type(" @");
const popup = await page.waitForSelector(".wiki-popup .wiki-item", { timeout: 5000 }).then(() => true, () => false);
await page.keyboard.press("Enter");
const linked = await page.evaluate(() => window.__oniric.editor.marks("wikilink").length);
check(popup && linked > 0, "lien wiki : @ propose les fiches et pose un lien dans le scénario (BIB-02)");
await page.keyboard.press("Control+z");
await page.keyboard.press("Control+z");

const shape = (name) => page.locator(".view-header").getByRole("button", { name, exact: true }).click();
await nav("Structure");
await shape("Tableau");
await page.waitForSelector(".board-view .cv-tree", { timeout: 15000 });
// The canvas shows every card of a fresh project, nothing folded.
const cards = await page.locator(".board-view .cv-tree .card").count();
check(cards === sceneCount, `tableau : ${cards} cartes pour ${sceneCount} scènes (VUE-03)`);

await shape("Chronologie");
check(await page.waitForSelector(".timeline-view .tl-scene", { timeout: 15000 }).then(() => true, () => false), "chronologie affichée (VUE-10)");

await nav("Versions");
// A project without a version shows how freezing works, with its button.
await page.locator(".vr-first-go").click();
await button("Valider").click();
await toast("figée");
await closeToasts();
const versionFiles = (await readdir(path.join(projectDir, "versions"))).filter((f) => f.endsWith(".json"));
check(versionFiles.length === 1, `version figée dans le dossier versions : ${versionFiles[0]} (REE-01)`);

await nav("Scénario");
await exportAs("FDX");
await toast(".fdx");
await closeToasts();
const fdx = (await readdir(exportsDir)).find((f) => f.endsWith(".fdx"));
const before = await page.evaluate(() => window.__oniric.editor.doc.textContent.replace(/\s+/g, ""));
await page.setInputFiles("input.script-import", path.join(exportsDir, fdx));
await button("Remplacer").click();
await toast(fdx);
await closeToasts();
const after = await page.evaluate(() => window.__oniric.editor.doc.textContent.replace(/\s+/g, ""));
const scenesAfter = await page.evaluate(() => window.__oniric.editor.doc.childCount);
check(scenesAfter === sceneCount && after.length > 0 && Math.abs(after.length - before.length) / before.length < 0.01, `FDX : export puis import, ${scenesAfter} scènes retrouvées (EDT-10)`);

await projectMenu("Réglages");
await page.locator(".settings-nav").getByRole("button", { name: "Sauvegardes" }).click();
await button("Sauvegarder maintenant").click();
await toast("Sauvegarde faite");
await closeToasts();
const backupRoot = path.join(data, "sauvegardes");
const [backupDir] = await readdir(backupRoot);
const copies = (await readdir(path.join(backupRoot, backupDir, "bases"))).filter((f) => f.endsWith(".db"));
check(copies.some((f) => f.includes("manuelle")), `sauvegarde manuelle : ${copies.length} copie(s) dans ${backupDir} (SAV-01)`);
await page.keyboard.press("Escape");

await nav("Scénario");
await page.evaluate(() => window.__oniric.editor.goToScene(0));
await page.keyboard.type(" Fin.");
await waitSaved();
await closeProject();
await page.waitForSelector(".home");
const copiesAtClose = (await readdir(path.join(backupRoot, backupDir, "bases"))).filter((f) => f.endsWith(".db"));
check(copiesAtClose.some((f) => f.includes("fermeture")), "copie automatique à la fermeture du projet (SAV-02)");
await browser.close();
app.kill();

await writeFile(path.join(out, "resultats.json"), JSON.stringify(results, null, 2));
console.log(failed ? "\n✗ Au moins une vérification a échoué." : "\n✓ Toutes les vérifications sont passées.");
process.exit(failed ? 1 : 0);
