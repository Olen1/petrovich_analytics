#!/usr/bin/env node
// Проверка документов с однозначным вердиктом: exit 0 — прошло, exit 1 — есть ошибки.
// `npm run check` — весь doc/; `npm run check -- <файл> …` — только указанные файлы (ссылки и карта — всегда целиком).
import fs from "node:fs";
import path from "node:path";
import { ROOT, listDocs, checkHeader, findSecrets, findRefs, resolveRef, rel, PROTECTED } from "./lib/docs.mjs";
import { scanSlop, SOFT_LIMIT } from "./lib/slop.mjs";
import { extractMermaid, lintMermaid } from "./lib/mermaid.mjs";
import { validateDeck, deckText } from "./slides.mjs";
import { isSprintDeck, validateSprintDeck, sprintDeckText, builtFrom, sourceHash } from "./sprint-deck.mjs";

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

// 5. Нейрослоп: жёсткие маркеры — ошибка, мягкие — предупреждение выше порога. Подробно: `npm run slop -- <файл>`.
for (const f of targets.filter((f) => f.endsWith(".md") && !PROTECTED.includes(f))) {
  const { hits, softPer1k } = scanSlop(read(f));
  for (const h of hits.filter((h) => h.level === "hard")) errors.push(`${f}:${h.line}: нейрослоп [${h.id}] «${h.text.trim()}» → ${h.hint}`);
  if (softPer1k > SOFT_LIMIT) warnings.push(`${f}: мягких маркеров слопа ${softPer1k.toFixed(1)} на 1000 слов (порог ${SOFT_LIMIT}) — npm run slop -- ${f}`);
}

// 6. Mermaid-диаграммы: быстрая статическая проверка. Отрисовку проверяет `npm run render`.
for (const f of targets.filter((f) => f.endsWith(".md"))) {
  for (const b of extractMermaid(read(f))) {
    const { errors: e, warnings: w } = lintMermaid(b);
    e.forEach((m) => errors.push(`${f}:${b.line}: диаграмма — ${m}`));
    w.forEach((m) => warnings.push(`${f}:${b.line}: диаграмма — ${m}`));
  }
}

// 7. Слайды: источник slides/*.json валиден, без слопа, и HTML собран из текущей версии источника.
const slidesDir = path.join(ROOT, "slides");
if (fs.existsSync(slidesDir)) {
  for (const name of fs.readdirSync(slidesDir).filter((n) => n.endsWith(".json"))) {
    const f = `slides/${name}`;
    let raw, deck;
    try { raw = read(f); deck = JSON.parse(raw); } catch (e) { errors.push(`${f}: не JSON — ${e.message}`); continue; }
    const pptx = isSprintDeck(deck);
    (pptx ? validateSprintDeck(deck) : validateDeck(deck)).forEach((m) => errors.push(`${f}: ${m}`));
    // Источник обновился — слайды надо сверить с ним и поднять версию в sources.
    for (const s of deck.sources || []) {
      const m = String(s).match(/^(\S+\.md)\s+v(\d+\.\d+)/);
      if (!m) { errors.push(`${f}: источник «${s}» — нужен формат «doc/<файл>.md vX.Y»`); continue; }
      const found = resolveRef(m[1]);
      if (!found) errors.push(`${f}: источника ${m[1]} нет`);
      else if (versions[found] && versions[found] !== m[2]) errors.push(`${f}: собрано по ${m[1]} v${m[2]}, а документ уже v${versions[found]} — сверьте слайды с изменениями`);
    }
    for (const h of scanSlop(pptx ? sprintDeckText(deck) : deckText(deck)).hits.filter((h) => h.level === "hard")) errors.push(`${f}: слайд ${h.line}: нейрослоп [${h.id}] «${h.text.trim()}»`);
    if (pptx) {
      // Отчёт по спринту: .pptx собран из текущего JSON (хеш источника записан в свойствах файла).
      const out = f.replace(/\.json$/, ".pptx");
      if (builtFrom(path.join(ROOT, out)) !== sourceHash(raw)) errors.push(`${out}: не собран или собран из старой версии — npm run sprint-deck -- ${f}`);
      continue;
    }
    const html = f.replace(/\.json$/, ".html");
    const embedded = fs.existsSync(path.join(ROOT, html)) && read(html).includes(JSON.stringify(deck).replaceAll("</", "<\\/"));
    if (!embedded) errors.push(`${html}: не собран или собран из старой версии — npm run slides -- ${f}`);
  }
}

// 8. Длина правил: читаются за две минуты (антипаттерн «правила-роман»).
for (const f of ["AGENTS.md", "CLAUDE.md"]) {
  if (!fs.existsSync(path.join(ROOT, f))) continue;
  const words = read(f).split(/\s+/).filter(Boolean).length;
  if (words > 900) warnings.push(`${f}: ${words} слов — больше, чем читается за две минуты (~900)`);
}

for (const w of warnings) console.log(`ПРЕДУПРЕЖДЕНИЕ  ${w}`);
for (const e of errors) console.log(`ОШИБКА  ${e}`);
console.log(errors.length ? `\nВЕРДИКТ: НЕ ПРОШЛО — ошибок: ${errors.length}` : `ВЕРДИКТ: ПРОШЛО — проверено файлов: ${targets.length}`);
process.exit(errors.length ? 1 : 0);
