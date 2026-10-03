import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(mjs|js)$/.test(entry.name) ? [file] : [];
  });
}
const files = ["bin", "lib", "scripts"].flatMap((dir) => sources(path.join(root, dir))).sort();
for (const file of files) {
  const check = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (check.error) throw check.error;
  if (check.status !== 0) process.exit(check.status ?? 1);
}
await import("../lib/run.mjs");
console.log(`Checked ${files.length} JavaScript sources and loaded the command router. Plain ESM needs no compilation.`);
