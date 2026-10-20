// Общие проверки документов: используются командой `npm run check` и хуками Claude Code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Исходные материалы: читаются, но не правятся (выгрузки, оригиналы заказчика, сырые данные).
export const PROTECTED = [
  "doc/autograph_api_reference.md",
  "doc/MVP.html",
  "doc/rawdata_1truck_5days.xlsx",
  "doc/ИИ_агент_Петрович_управляем_автопарком_v_1_1.txt",
];

// Куда агенту можно писать. Всё остальное — только по просьбе пользователя.
export const WRITABLE = [/^doc\//, /^slides\//, /^\.claude\//, /^scripts\//, /^[^/]+\.md$/, /^package\.json$/, /^\.gitignore$/];

// Документы, у которых не проверяется шапка: выгрузки и оригиналы.
const NO_HEADER = new Set(["doc/autograph_api_reference.md"]);

export const rel = (file) => path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join("/");

export function listDocs() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk("doc");
  return out.sort();
}

const today = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return { iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, ru: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` };
};

/** Шапка документа: заголовок, строка `_… Версия … Дата …_`. Возвращает {errors, version, meta}. */
export function checkHeader(relPath, text) {
  const errors = [];
  if (NO_HEADER.has(relPath)) return { errors, version: null, meta: "" };
  const head = text.replace(/^﻿/, "").split(/\r?\n/).slice(0, 6);
  if (!head.some((l) => /^# \S/.test(l))) errors.push("нет заголовка `# …` в начале файла");
  const meta = head.find((l) => /^_.*_\s*$/.test(l.trim())) || "";
  let version = null;
  if (!meta) errors.push("нет строки-шапки `_Статус: … | Версия: X.Y | Дата: ГГГГ-ММ-ДД_` под заголовком");
  else {
    version = (meta.match(/Версия:?\s*(\d+\.\d+)/) || [])[1] || null;
    if (!version) errors.push("в шапке нет версии (`Версия: X.Y`)");
    if (!/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/.test(meta)) errors.push("в шапке нет даты");
  }
  return { errors, version, meta };
}

export const isDatedToday = (meta) => { const t = today(); return meta.includes(t.iso) || meta.includes(t.ru); };
export const todayIso = () => today().iso;

// Секреты: ключ, токен или пароль со значением. Значения-заглушки (PASS, <token>, ***) не считаются.
const SECRET = /(password|passwd|пароль|token|api[_-]?key|secret|bearer)["']?\s*[:=]\s*["']?([^\s"'|,&<>`)]{8,})/gi;
const PLACEHOLDER = /^(x+|\*+|\.+|string|integer|boolean|example|пример|your|ваш)/i;
export function findSecrets(text) {
  const hits = [];
  for (const m of text.matchAll(SECRET)) if (!PLACEHOLDER.test(m[2])) hits.push(m[0].slice(0, 60));
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) hits.push("приватный ключ");
  return hits;
}

/** Ссылки вида `файл.md` (в обратных кавычках) и версии вида `файл.md` v0.2 / (v0.2). */
export function findRefs(text) {
  const refs = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/`([^`\s][^`]*?\.(?:md|html|xlsx|txt))`(?:\s*\(?v(\d+\.\d+)\)?)?/g)) {
      refs.push({ line: i + 1, target: m[1], version: m[2] || null, text: line });
    }
  });
  return refs;
}

/** Где искать файл по ссылке: как есть, от doc/, от doc/Analiz/. */
export function resolveRef(target) {
  const clean = target.replace(/^\.?\//, "");
  for (const base of ["", "doc/", "doc/Analiz/"]) {
    const p = base + clean;
    if (fs.existsSync(path.join(ROOT, p))) return p;
  }
  return null;
}
