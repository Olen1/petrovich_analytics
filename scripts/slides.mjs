#!/usr/bin/env node
// Сборка слайдов из одного источника: `npm run slides -- slides/<имя>.json` → slides/<имя>.html.
// Проверяет схему и лимиты текста, нейрослоп, затем рендерит в безголовом браузере: текст за краем
// слайда и ошибки диаграмм. exit 0 — прошло, exit 1 — ошибки, exit 2 — рендер проверить нельзя.
// Флаг --no-render — только схема и текст (без браузера).
import fs from "node:fs";
import path from "node:path";
import { ROOT, rel } from "./lib/docs.mjs";
import { scanSlop } from "./lib/slop.mjs";
import { lintMermaid } from "./lib/mermaid.mjs";
import { runPage } from "./lib/browser.mjs";

// Лимиты держат слайд читаемым: одна мысль, крупный кегль, без «стены текста».
const LIMITS = { slides: 20, title: 70, item: 150, cardHead: 45, cardText: 170, cell: 90, rows: 7, cols: 5, bullets: 6 };
const TYPES = {
  title: ["title"], section: ["title"], bullets: ["title", "items"], cards: ["title", "items"], metrics: ["title", "items"],
  table: ["title", "head", "rows"], statement: ["title", "text"], diagram: ["title", "mermaid"],
};

export function validateDeck(deck) {
  const errors = [];
  if (!deck || typeof deck.title !== "string" || !Array.isArray(deck.slides)) return ["нужны поля title (строка) и slides (массив)"];
  if (!Array.isArray(deck.sources) || !deck.sources.length) errors.push("нет sources — из каких документов (с версиями) собраны слайды");
  if (deck.slides.length > LIMITS.slides) errors.push(`слайдов ${deck.slides.length}, максимум ${LIMITS.slides}`);
  deck.slides.forEach((s, i) => {
    const at = `слайд ${i + 1} (${s.type})`;
    const need = TYPES[s.type];
    if (!need) return errors.push(`${at}: неизвестный тип, допустимы ${Object.keys(TYPES).join(", ")}`);
    for (const f of need) if (s[f] === undefined || s[f] === "") errors.push(`${at}: нет поля ${f}`);
    if (s.title && s.title.length > LIMITS.title) errors.push(`${at}: заголовок ${s.title.length} символов, максимум ${LIMITS.title}`);
    const long = (t, max, what) => { if (String(t).length > max) errors.push(`${at}: ${what} длиннее ${max} символов — «${String(t).slice(0, 40)}…»`); };
    if (s.type === "bullets") {
      if (s.items.length > LIMITS.bullets) errors.push(`${at}: пунктов ${s.items.length}, максимум ${LIMITS.bullets}`);
      s.items.forEach((t) => long(t, LIMITS.item, "пункт"));
    }
    if (s.type === "cards" || s.type === "metrics") {
      if (s.items.length < 2 || s.items.length > 4) errors.push(`${at}: карточек должно быть 2–4`);
      s.items.forEach(([h, t]) => { long(h, LIMITS.cardHead, "заголовок карточки"); long(t ?? "", LIMITS.cardText, "текст карточки"); });
    }
    if (s.type === "table") {
      if (s.head.length > LIMITS.cols) errors.push(`${at}: столбцов ${s.head.length}, максимум ${LIMITS.cols}`);
      if (s.rows.length > LIMITS.rows) errors.push(`${at}: строк ${s.rows.length}, максимум ${LIMITS.rows}`);
      s.rows.forEach((r) => { if (r.length !== s.head.length) errors.push(`${at}: в строке ${r.length} ячеек, в шапке ${s.head.length}`); r.forEach((c) => long(c, LIMITS.cell, "ячейка")); });
    }
    if (s.type === "diagram") lintMermaid({ code: s.mermaid, closed: true }).errors.forEach((e) => errors.push(`${at}: диаграмма — ${e}`));
    if (s.takeaway) long(s.takeaway, LIMITS.item, "вывод");
  });
  return errors;
}

/** Все тексты колоды одной строкой на слайд — для проверки нейрослопа. */
export const deckText = (deck) => deck.slides.map((s) => JSON.stringify({ ...s, mermaid: undefined })
  .replace(/["{}[\]]|\\n/g, " ").replace(/\b(type|title|items|head|rows|text|lead|takeaway|caption|subtitle|meta|num)\b:/g, " ")).join("\n");

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, "scripts/slides.mjs");
if (isMain) {
  const args = process.argv.slice(2);
  const noRender = args.includes("--no-render");
  const src = args.find((a) => a.endsWith(".json"));
  if (!src) { console.log("Использование: npm run slides -- slides/<имя>.json [--no-render]"); process.exit(1); }
  const file = rel(src);
  let deck;
  try { deck = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); }
  catch (e) { console.log(`ОШИБКА  ${file}: ${e.message}\nВЕРДИКТ: НЕ ПРОШЛО`); process.exit(1); }

  const errors = validateDeck(deck);
  for (const h of scanSlop(deckText(deck)).hits.filter((h) => h.level === "hard")) errors.push(`слайд ${h.line}: нейрослоп [${h.id}] «${h.text.trim()}» → ${h.hint}`);

  const out = file.replace(/\.json$/, ".html");
  const template = fs.readFileSync(path.join(ROOT, "scripts/slides/template.html"), "utf8");
  fs.writeFileSync(path.join(ROOT, out), template.replace("/*__DECK__*/null", JSON.stringify(deck).replaceAll("</", "<\\/")));
  console.log(`Собрано: ${out}`);

  let status = errors.length ? 1 : 0;
  if (!noRender) {
    const r = runPage(path.join(ROOT, out), { query: "?check", width: 1400, height: 900 });
    if (!r || r.error) {
      console.log(`Рендер НЕ ПРОВЕРЕН — ${r ? r.error : "не найден Edge или Chrome"}`);
      if (!status) status = 2;
    } else {
      r.overflow.forEach((p) => errors.push(`вёрстка: ${p}`));
      r.diagrams.forEach((p) => errors.push(`диаграмма: ${p}`));
      if (!r.fonts) console.log("ПРЕДУПРЕЖДЕНИЕ  шрифты Onest/Manrope не загрузились (нет сети?) — проверено на запасном шрифте");
      console.log(`Рендер: слайдов ${r.slides}, вылезает за край: ${r.overflow.length}, ошибок диаграмм: ${r.diagrams.length}`);
      if (errors.length) status = 1;
    }
  }
  errors.forEach((e) => console.log(`ОШИБКА  ${e}`));
  console.log(status === 1 ? `\nВЕРДИКТ: НЕ ПРОШЛО — ошибок: ${errors.length}` : status === 2 ? "\nВЕРДИКТ: НЕ ПРОВЕРЕНО — схема и текст в порядке, рендер не проверен" : "\nВЕРДИКТ: ПРОШЛО");
  process.exit(status);
}
