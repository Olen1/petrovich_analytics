#!/usr/bin/env node
// PreToolUse (Write|Edit): до записи файла.
// Блокирует правку исходных материалов, запись вне разрешённых папок и секреты в тексте.
import { readInput, block } from "./lib.mjs";
import { PROTECTED, WRITABLE, findSecrets, rel } from "../../scripts/lib/docs.mjs";

const input = await readInput();
const file = input?.tool_input?.file_path;
if (!file) process.exit(0);
const p = rel(file);

// Файлы вне репозитория (scratchpad, память Claude) — не наша зона.
if (p.startsWith("..")) process.exit(0);

if (PROTECTED.includes(p)) {
  block(`${p} — исходный материал, его не правят. Нужна текстовая копия или выжимка — создайте отдельный документ в doc/ (см. AGENTS.md, «Границы»).`);
}
if (p.startsWith(".claude/settings.local.json") || /(^|\/)\.env/.test(p)) {
  block(`${p} — личные настройки или секреты; агент их не пишет.`);
}
if (!WRITABLE.some((re) => re.test(p))) {
  block(`${p} — вне разрешённых мест (doc/, .claude/, scripts/, *.md в корне). Если файл нужен здесь, спросите пользователя.`);
}

const text = [input.tool_input.content, input.tool_input.new_string].filter(Boolean).join("\n");
const secrets = findSecrets(text);
if (secrets.length) {
  block(`В ${p} похоже на секрет (${secrets.join("; ")}). Ключи и пароли в репозиторий не пишутся — замените заглушкой.`);
}
process.exit(0);
