#!/usr/bin/env node
// Отчёт по спринту в .pptx по шаблону «Петрович_итоги_1_спринта_v11»: `npm run sprint-deck -- slides/sprint_<N>.json`
// → slides/sprint_<N>.pptx и slides/sprint_<N>.preview.html. Проверяет схему, нейрослоп, затем рендерит превью
// в безголовом браузере: текст за краем рамки. exit 0 — прошло, exit 1 — ошибки, exit 2 — рендер проверить нельзя.
// Флаг --no-render — только схема и текст (без браузера).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, rel } from "./lib/docs.mjs";
import { scanSlop } from "./lib/slop.mjs";
import { runPage } from "./lib/browser.mjs";
import { readZip } from "./lib/zip.mjs";
import { layoutSlide, TYPES } from "./sprint/layouts.mjs";
import { buildPptx, buildPreview } from "./sprint/emit.mjs";

export const TEMPLATE = "scripts/sprint/template.pptx";
const MAX_SLIDES = 20;

// Обязательные поля и пределы количества: больше — не влезает в сетку шаблона.
const SCHEMA = {
  cover: { need: ["title", "label"] },
  summary: { need: ["title", "rows", "score"], rows: [1, 7] },
  panel: { need: ["title", "panel", "heading", "cards"], cards: [2, 4] },
  compare: { need: ["title", "head", "rows"], rows: [2, 5] },
  chat: { need: ["title", "dialog", "features"], features: [2, 6] },
  findings: { need: ["title", "head", "rows"], rows: [2, 5] },
  table: { need: ["title", "head", "rows"], rows: [1, 9], side: [0, 2] },
  columns: { need: ["title", "columns"], columns: [2, 3] },
  progress: { need: ["title", "rows"], rows: [1, 7], stats: [0, 3], side: [0, 2] },
  screens: { need: ["title", "items"], items: [1, 5] },
  flow: { need: ["title", "client", "server", "external"], external: [1, 3] },
  team: { need: ["title", "members"], members: [1, 6] },
};

export const isSprintDeck = (deck) => deck && deck.format === "pptx";

export function validateSprintDeck(deck, root = ROOT) {
  const errors = [];
  if (!deck || typeof deck.title !== "string" || !Array.isArray(deck.slides)) return ["нужны поля title (строка) и slides (массив)"];
  if (!Array.isArray(deck.sources) || !deck.sources.length) errors.push("нет sources — из каких документов (с версиями) собраны слайды");
  const sp = deck.sprint;
  if (!sp || !Number.isInteger(sp.num) || !sp.from || !sp.to || !sp.dates) errors.push("нет sprint: { num, from, to, dates } — границы спринта");
  if (deck.slides.length > MAX_SLIDES) errors.push(`слайдов ${deck.slides.length}, максимум ${MAX_SLIDES}`);
  deck.slides.forEach((s, i) => {
    const at = `слайд ${i + 1} (${s.type})`;
    const sc = SCHEMA[s.type];
    if (!sc) return errors.push(`${at}: неизвестный тип, допустимы ${TYPES.join(", ")}`);
    for (const f of sc.need) if (s[f] === undefined || s[f] === "") errors.push(`${at}: нет поля ${f}`);
    if (!s.notes) errors.push(`${at}: нет notes — текста для докладчика`);
    if (s.title && s.title.length > 70) errors.push(`${at}: заголовок ${s.title.length} символов, максимум 70`);
    for (const [f, lim] of Object.entries(sc)) {
      if (f === "need" || s[f] === undefined) continue;
      if (!Array.isArray(s[f]) || s[f].length < lim[0] || s[f].length > lim[1]) errors.push(`${at}: ${f} — от ${lim[0]} до ${lim[1]} элементов`);
    }
    if (s.type === "table") s.rows?.forEach((r, ri) => { if (r.length !== s.head.length) errors.push(`${at}: в строке ${ri + 1} ячеек ${r.length}, в шапке ${s.head.length}`); });
    if (s.type === "columns") s.columns?.forEach((c, ci) => {
      const max = s.columns.length === 2 ? 5 : 4;
      if (!c.items?.length || c.items.length > max) errors.push(`${at}: в колонке ${ci + 1} пунктов ${c.items?.length || 0}, нужно 1–${max}`);
    });
    if (s.type === "summary" && (!Array.isArray(s.score) || s.score.length !== 2)) errors.push(`${at}: score — [число, подпись], например ["6 / 7", "задач сделано"]`);
    if (s.type === "flow" && s.server?.items?.length > 6) errors.push(`${at}: модулей сервера ${s.server.items.length}, максимум 6`);
    for (const img of images(s)) if (!fs.existsSync(path.join(root, img))) errors.push(`${at}: нет картинки ${img}`);
  });
  return errors;
}

const images = (s) => [...(s.items || []).filter(() => s.type === "screens").map((x) => x[0]), ...(s.members || []).map((x) => x[0])];

/** Все тексты слайда одной строкой — для проверки нейрослопа (без путей к картинкам и служебных ключей). */
export function sprintDeckText(deck) {
  const walk = (v) => (typeof v === "string" ? (/\.(png|jpe?g)$/i.test(v) ? "" : v) : Array.isArray(v) ? v.map(walk).join(" ")
    : v && typeof v === "object" ? Object.entries(v).filter(([k]) => k !== "type" && k !== "tone").map(([, x]) => walk(x)).join(" ") : "");
  return deck.slides.map((s) => walk(s).replace(/\s+/g, " ")).join("\n");
}

export const sourceHash = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Хеш JSON, из которого собран .pptx (пишется в описание файла). null — файла нет или он собран не этой командой. */
export function builtFrom(pptxFile) {
  if (!fs.existsSync(pptxFile)) return null;
  try {
    const core = readZip(fs.readFileSync(pptxFile)).get("docProps/core.xml")?.toString("utf8") || "";
    return (core.match(/source-sha256:([0-9a-f]{16})/) || [])[1] || null;
  } catch { return null; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, "scripts/sprint-deck.mjs");
if (isMain) {
  const args = process.argv.slice(2);
  const noRender = args.includes("--no-render");
  const src = args.find((a) => a.endsWith(".json"));
  if (!src) { console.log("Использование: npm run sprint-deck -- slides/sprint_<N>.json [--no-render]"); process.exit(1); }
  const file = rel(src);
  let raw, deck;
  try { raw = fs.readFileSync(path.join(ROOT, file), "utf8"); deck = JSON.parse(raw); }
  catch (e) { console.log(`ОШИБКА  ${file}: ${e.message}\nВЕРДИКТ: НЕ ПРОШЛО`); process.exit(1); }
  if (!isSprintDeck(deck)) { console.log(`ОШИБКА  ${file}: нет "format": "pptx" — это колода для npm run slides\nВЕРДИКТ: НЕ ПРОШЛО`); process.exit(1); }

  const errors = validateSprintDeck(deck);
  for (const h of scanSlop(sprintDeckText(deck)).hits.filter((h) => h.level === "hard")) errors.push(`слайд ${h.line}: нейрослоп [${h.id}] «${h.text.trim()}» → ${h.hint}`);
  if (errors.length && errors.some((e) => /нет поля|неизвестный тип|нужны поля|нет картинки/.test(e))) {
    errors.forEach((e) => console.log(`ОШИБКА  ${e}`));
    console.log(`\nВЕРДИКТ: НЕ ПРОШЛО — ошибок: ${errors.length} (не собрано)`);
    process.exit(1);
  }

  const slides = deck.slides.map((s) => ({ shapes: layoutSlide(s), notes: s.notes }));
  const pptx = file.replace(/\.json$/, ".pptx");
  const html = file.replace(/\.json$/, ".preview.html");
  fs.writeFileSync(path.join(ROOT, pptx), buildPptx({
    slides, title: deck.title, root: ROOT, templatePath: path.join(ROOT, TEMPLATE),
    description: `Собрано из ${file}, source-sha256:${sourceHash(raw)}`,
  }));
  fs.writeFileSync(path.join(ROOT, html), buildPreview({ slides, title: deck.title, root: ROOT, htmlFile: path.join(ROOT, html) }));
  console.log(`Собрано: ${pptx}\nПревью:  ${html}`);

  let status = errors.length ? 1 : 0;
  if (!noRender) {
    const r = runPage(path.join(ROOT, html), { query: "?check", width: 1400, height: 900 });
    if (!r || r.error) {
      console.log(`Рендер НЕ ПРОВЕРЕН — ${r ? r.error : "не найден Edge или Chrome"}`);
      if (!status) status = 2;
    } else {
      r.overflow.forEach((p) => errors.push(`вёрстка: ${p}`));
      r.tight.forEach((p) => console.log(`ПРЕДУПРЕЖДЕНИЕ  впритык, в PowerPoint может не влезть: ${p}`));
      if (!r.fonts) console.log("ПРЕДУПРЕЖДЕНИЕ  нет шрифта Arial — проверено на запасном шрифте");
      console.log(`Рендер: слайдов ${r.slides}, текст за краем: ${r.overflow.length}, впритык: ${r.tight.length}`);
      if (errors.length) status = 1;
    }
  } else if (!status) status = 2;
  errors.forEach((e) => console.log(`ОШИБКА  ${e}`));
  console.log(status === 1 ? `\nВЕРДИКТ: НЕ ПРОШЛО — ошибок: ${errors.length}` : status === 2 ? "\nВЕРДИКТ: НЕ ПРОВЕРЕНО — схема и текст в порядке, вёрстка не проверена" : "\nВЕРДИКТ: ПРОШЛО");
  process.exit(status);
}
