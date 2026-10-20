#!/usr/bin/env node
// Подробный отчёт о нейрослопе: `npm run slop -- doc/<файл>.md …` (без аргументов — все документы).
// exit 1 — есть жёсткие маркеры, exit 0 — нет (мягкие только показываются).
import fs from "node:fs";
import path from "node:path";
import { ROOT, listDocs, rel, PROTECTED } from "./lib/docs.mjs";
import { scanSlop, SOFT_LIMIT } from "./lib/slop.mjs";

const args = process.argv.slice(2).map(rel);
const files = (args.length ? args : listDocs()).filter((f) => /\.(md|json)$/.test(f) && !PROTECTED.includes(f));
let hard = 0;
for (const f of files) {
  const full = path.join(ROOT, f);
  if (!fs.existsSync(full)) { console.log(`${f}: файла нет`); hard++; continue; }
  const { hits, words, softPer1k } = scanSlop(fs.readFileSync(full, "utf8"));
  if (!hits.length) continue;
  console.log(`\n${f} — ${words} слов, мягких ${softPer1k.toFixed(1)} на 1000 (порог ${SOFT_LIMIT})`);
  for (const h of hits) {
    if (h.level === "hard") hard++;
    console.log(`  ${h.level === "hard" ? "ОШИБКА " : "мягкий "} ${f}:${h.line}:${h.col}  [${h.id}] «${h.text.trim()}» → ${h.hint}`);
  }
}
console.log(hard ? `\nВЕРДИКТ: НЕ ПРОШЛО — жёстких маркеров: ${hard}` : `\nВЕРДИКТ: ПРОШЛО — проверено файлов: ${files.length}`);
process.exit(hard ? 1 : 0);
