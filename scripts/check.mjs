#!/usr/bin/env node
// Проверка документов с однозначным вердиктом: exit 0 — прошло, exit 1 — есть ошибки.
// `npm run check` — весь doc/; `npm run check -- <файл> …` — только указанные файлы (ссылки и карта — всегда целиком).
import fs from "node:fs";
import path from "node:path";
import { ROOT, listDocs, checkHeader, findSecrets, findRefs, resolveRef, rel } from "./lib/docs.mjs";

const args = process.argv.slice(2).map(rel);
const all = listDocs();
const targets = args.length ? args.filter((f) => f.startsWith("doc/") && fs.existsSync(path.join(ROOT, f))) : all;
const errors = [];
const warnings = [];
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// 1. Шапки и версии документов.
const versions = {};
for (const f of all.filter((f) => f.endsWith(".md"))) {
  const { errors: e, version } = checkHeader(f, read(f));
  versions[f] = version;
  if (targets.includes(f)) e.forEach((msg) => errors.push(`${f}: ${msg}`));
}

// 2. Ссылки на другие файлы и их версии.
for (const f of targets.filter((f) => f.endsWith(".md") && f !== "doc/autograph_api_reference.md")) {
  for (const r of findRefs(read(f))) {
    const found = resolveRef(r.target);
    if (!found) {
      // Ссылка на удалённый документ допустима, если строка прямо говорит об удалении.
      if (!/удал[её]н|удалена|удалено/i.test(r.text)) errors.push(`${f}:${r.line}: ссылка на несуществующий файл \`${r.target}\``);
      continue;
    }
    if (r.version && versions[found] && r.version !== versions[found]) {
      errors.push(`${f}:${r.line}: ссылка на \`${r.target}\` v${r.version}, а у документа сейчас v${versions[found]}`);
    }
  }
}

// 3. Секреты в документах и правилах.
const ruleFiles = ["AGENTS.md", "CLAUDE.md", "DECISIONS.md", "HARNESS.md"].filter((f) => fs.existsSync(path.join(ROOT, f)));
for (const f of [...targets.filter((f) => /\.(md|html|txt)$/.test(f) && !f.endsWith(".txt")), ...ruleFiles]) {
  for (const hit of findSecrets(read(f))) errors.push(`${f}: похоже на секрет — «${hit}»`);
}

// 4. Карта документов в AGENTS.md не отстаёт от папки doc/ (антипаттерн «обвязка-музей»).
const map = fs.existsSync(path.join(ROOT, "AGENTS.md")) ? read("AGENTS.md") : "";
if (!map) errors.push("нет AGENTS.md с картой документов");
else {
  for (const f of all) if (!map.includes(path.basename(f))) errors.push(`AGENTS.md: документа ${f} нет в карте`);
  for (const m of map.matchAll(/`(doc\/[^`]+)`/g)) {
    if (!fs.existsSync(path.join(ROOT, m[1])) && !m[1].includes("…")) errors.push(`AGENTS.md: в карте есть ${m[1]}, а файла нет`);
  }
}

// 5. Длина правил: читаются за две минуты (антипаттерн «правила-роман»).
for (const f of ["AGENTS.md", "CLAUDE.md"]) {
  if (!fs.existsSync(path.join(ROOT, f))) continue;
  const words = read(f).split(/\s+/).filter(Boolean).length;
  if (words > 900) warnings.push(`${f}: ${words} слов — больше, чем читается за две минуты (~900)`);
}

for (const w of warnings) console.log(`ПРЕДУПРЕЖДЕНИЕ  ${w}`);
for (const e of errors) console.log(`ОШИБКА  ${e}`);
console.log(errors.length ? `\nВЕРДИКТ: НЕ ПРОШЛО — ошибок: ${errors.length}` : `ВЕРДИКТ: ПРОШЛО — проверено файлов: ${targets.length}`);
process.exit(errors.length ? 1 : 0);
