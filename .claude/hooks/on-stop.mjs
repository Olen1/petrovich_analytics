#!/usr/bin/env node
// Stop: когда агент считает задачу законченной, прогоняет `npm run check` по изменённым документам.
// Есть ошибки — exit 2, агент продолжает и исправляет. Повторно в том же цикле не блокирует.
import { execFileSync, spawnSync } from "node:child_process";
import { readInput, block } from "./lib.mjs";
import { ROOT } from "../../scripts/lib/docs.mjs";

const input = await readInput();
if (input.stop_hook_active) process.exit(0);

let changed = [];
try {
  const out = execFileSync("git", ["status", "--porcelain", "-z", "--untracked-files=all"], { cwd: ROOT }).toString();
  changed = out.split("\0").filter(Boolean).map((l) => l.slice(3)).filter((f) => f.startsWith("doc/") || f.startsWith("slides/") || /^(AGENTS|CLAUDE)\.md$/.test(f));
} catch {
  process.exit(0);
}
if (!changed.length) process.exit(0);

const docs = changed.filter((f) => f.startsWith("doc/"));
const r = spawnSync(process.execPath, ["scripts/check.mjs", ...docs], { cwd: ROOT, encoding: "utf8" });
if (r.status === 1) {
  block(`npm run check по изменённым файлам не прошёл — исправьте перед завершением:\n${r.stdout.trim()}`);
}
process.exit(0);
