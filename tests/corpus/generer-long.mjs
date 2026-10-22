// Usage: node tests/corpus/generer-long.mjs
// Writes 5-long-120.fountain: a deterministic synthetic screenplay of about 120 pages (performance targets, PRD 10.1).
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const WORDS = (
  "le la les un une des et mais donc or ni car qui que quoi dont où porte fenêtre lumière nuit jour rue voiture silence regard main " +
  "visage ombre pluie café table chaise escalier couloir téléphone lettre clé souvenir colère rire peur départ retour ville mer " +
  "vent froid chaud lentement soudain encore toujours jamais déjà vers contre sous dans avec sans pour entre regarde avance recule " +
  "attend ouvre ferme prend pose cherche trouve sourit hésite murmure crie tremble tourne s'assoit se lève disparaît revient"
).split(" ");
const NAMES = ["MARIE", "PAUL", "LÉA", "YANIS", "SOFIA", "LE COMMISSAIRE", "MADAME BERTRAND"];
const PLACES = ["CUISINE", "COMMISSARIAT", "GARE SAINT-CHARLES", "VOITURE DE PAUL", "PLAGE", "BUREAU DE SOFIA", "CAFÉ DU PORT"];
const PARENS = ["(un temps)", "(bas)", "(sans se retourner)", "(au téléphone)", "(ironique)"];

let seed = 42;
const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
const pick = (a) => a[Math.floor(r() * a.length)];
const sentence = (min, max) => {
  const n = min + Math.floor(r() * (max - min));
  const w = Array.from({ length: n }, () => pick(WORDS));
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return w.join(" ") + pick([".", ".", ".", " ?", " !", "…"]);
};
const paragraph = (n) => Array.from({ length: n }, () => sentence(4, 16)).join(" ");

const out = ["Title: Synthétique 120 pages", "Notes: Généré par tests/corpus/generer-long.mjs, déterministe.", ""];
let rows = 0;
while (rows < 120 * 55) {
  out.push(`${pick(["INT.", "EXT."])} ${pick(PLACES)} – ${pick(["JOUR", "NUIT", "AUBE", "SOIR"])}`, "");
  rows += 2;
  const beats = 3 + Math.floor(r() * 8);
  for (let k = 0; k < beats; k++) {
    if (r() < 0.4) {
      const text = paragraph(1 + Math.floor(r() * 5));
      out.push(text, "");
      rows += 1 + Math.ceil(text.length / 60);
    } else {
      out.push(pick(NAMES));
      if (r() < 0.25) {
        out.push(pick(PARENS));
        rows++;
      }
      const text = paragraph(r() < 0.1 ? 12 : 1 + Math.floor(r() * 4));
      out.push(text, "");
      rows += 2 + Math.ceil(text.length / 35);
    }
  }
  if (r() < 0.2) {
    out.push(`>${pick(["FONDU AU NOIR.", "COUPE FRANCHE :", "ENCHAÎNÉ :"])}`, "");
    rows += 2;
  }
}
await writeFile(fileURLToPath(new URL("./5-long-120.fountain", import.meta.url)), out.join("\n"));
