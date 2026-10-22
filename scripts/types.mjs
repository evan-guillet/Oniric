// Usage: npm run types [-- chemin\vers\oniric.exe]
// Regenerates src/bindings.ts from the Rust commands; `npm run typecheck` then shows every place to adapt.
import { execFileSync } from "node:child_process";
import path from "node:path";

const exe = process.argv[2] ?? path.join("target", "debug", process.platform === "win32" ? "oniric.exe" : "oniric");
execFileSync(exe, ["--exporter-types", path.join("src", "bindings.ts")], { stdio: "inherit" });
console.log("src/bindings.ts régénéré.");
