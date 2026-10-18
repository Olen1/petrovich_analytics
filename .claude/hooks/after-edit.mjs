#!/usr/bin/env node
// PostToolUse (Write|Edit): после правки документа в doc/ проверяет шапку.
// Нет заголовка, версии или даты — exit 2, Claude исправляет. Дата не сегодняшняя — напоминание.
import fs from "node:fs";
import path from "node:path";
import { readInput, block, note } from "./lib.mjs";
import { ROOT, checkHeader, isDatedToday, todayIso, rel } from "../../scripts/lib/docs.mjs";

const input = await readInput();
const file = input?.tool_input?.file_path;
if (!file || !file.toLowerCase().endsWith(".md")) process.exit(0);
const p = rel(file);
if (!p.startsWith("doc/")) process.exit(0);

let text;
try {
  text = fs.readFileSync(path.join(ROOT, p), "utf8");
} catch {
  process.exit(0);
}
const { errors, version, meta } = checkHeader(p, text);
if (errors.length) block(`Шапка ${p}: ${errors.join("; ")}. Формат — в AGENTS.md, «Конвенции».`);
if (version && !isDatedToday(meta)) {
  note("PostToolUse", `${p}: дата в шапке не сегодняшняя. Если правка меняет содержание — поднимите версию и поставьте дату ${todayIso()}.`);
}
process.exit(0);
