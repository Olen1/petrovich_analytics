#!/usr/bin/env node
// Проверка окружения и самой обвязки: `npm run doctor`. exit 0 — всё на месте, exit 1 — что-то сломано.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { ROOT } from "./lib/docs.mjs";

const results = [];
const ok = (name, detail = "") => results.push(["OK  ", name, detail]);
const fail = (name, detail) => results.push(["FAIL", name, detail]);
const info = (name, detail) => results.push(["INFO", name, detail]);
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };

const major = Number(process.versions.node.split(".")[0]);
major >= 18 ? ok("Node.js", process.versions.node) : fail("Node.js", `${process.versions.node}, нужен 18+`);

const git = sh("git --version");
git ? ok("git", git) : fail("git", "не найден в PATH");
sh("git rev-parse --is-inside-work-tree") === "true" ? ok("Репозиторий git") : fail("Репозиторий git", "папка не под git");

sh("python --version") || sh("python3 --version") ? ok("Python") : info("Python", "не установлен — .xlsx и .docx читать через Node или попросить пользователя");

for (const f of ["AGENTS.md", "CLAUDE.md", "DECISIONS.md", "HARNESS.md", ".claude/settings.json"]) exists(f) ? ok(f) : fail(f, "нет файла");

try {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const cmds = Object.values(s.hooks || {}).flat().flatMap((h) => h.hooks || []).map((h) => h.command);
  for (const c of cmds) {
    const m = c.match(/\.claude\/hooks\/[\w.-]+/);
    if (m && !exists(m[0])) fail("Хук", `${m[0]} указан в settings.json, но файла нет`);
  }
  ok("settings.json", `хуков: ${cmds.length}`);
} catch (e) {
  fail("settings.json", `не читается: ${e.message}`);
}

const fm = (file) => (fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || "";
for (const dir of ["skills", "agents"]) {
  const base = path.join(ROOT, ".claude", dir);
  if (!fs.existsSync(base)) continue;
  for (const e of fs.readdirSync(base)) {
    const file = dir === "skills" ? path.join(base, e, "SKILL.md") : path.join(base, e);
    if (!fs.existsSync(file) || (dir === "agents" && !e.endsWith(".md"))) continue;
    const head = fm(file);
    /name:\s*\S/.test(head) && /description:\s*\S/.test(head) ? ok(`${dir}/${e}`) : fail(`${dir}/${e}`, "во frontmatter нет name или description");
  }
}

const tracked = sh("git ls-files .claude/settings.local.json");
tracked ? fail("settings.local.json", "личные настройки попали в git") : ok("settings.local.json не в git");

if (fs.existsSync(path.join(os.homedir(), ".claude/skills/make-bizness-treb/SKILL.md"))) {
  info("Навык make-bizness-treb", "есть копия в ~/.claude/skills — источник правды в репозитории: SKILL/make-bizness-treb");
}

for (const [s, name, detail] of results) console.log(`${s}  ${name}${detail ? ` — ${detail}` : ""}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(failed ? `\nВЕРДИКТ: НЕ ПРОШЛО — проблем: ${failed}` : "\nВЕРДИКТ: ПРОШЛО");
process.exit(failed ? 1 : 0);
