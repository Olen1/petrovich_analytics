#!/usr/bin/env node
// PreToolUse (Bash|PowerShell): до запуска команды. Блокирует необратимые действия.
// Коммиты и обычный push не блокируются — на них settings.json спрашивает подтверждение.
import { readInput, block } from "./lib.mjs";

const input = await readInput();
const cmd = String(input?.tool_input?.command || "");

const rules = [
  [/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i, "rm -rf"],
  [/Remove-Item\b[^|;]*-Recurse/i, "Remove-Item -Recurse"],
  [/\bgit\s+push\b[^|;]*(--force\b|-f\b|--force-with-lease)/, "git push --force"],
  [/\bgit\s+reset\s+--hard\b/, "git reset --hard"],
  [/\bgit\s+clean\s+-[a-z]*f/, "git clean -f"],
  [/\bgit\s+checkout\s+(--\s+)?\.(\s|$)/, "git checkout ."],
  [/\bgit\s+(restore)\s+[^|;]*\.(\s|$)/, "git restore ."],
  [/\bgit\s+branch\s+-D\b/, "git branch -D"],
  [/\bgit\s+filter-(branch|repo)\b/, "переписывание истории git"],
];
for (const [re, name] of rules) {
  if (re.test(cmd)) {
    block(`Команда «${name}» необратима и заблокирована хуком. Если это действительно нужно, попросите пользователя выполнить её самому (\`! <команда>\`).`);
  }
}
if (/settings\.local\.json|\.env\b/.test(cmd) && /\b(cat|type|Get-Content|head|tail|less|more)\b/.test(cmd)) {
  block("Чтение личных настроек и секретов заблокировано хуком.");
}
process.exit(0);
