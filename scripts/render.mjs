#!/usr/bin/env node
// Проверка рендера Mermaid-диаграмм в документах: `npm run render -- doc/<файл>.md …`
// (без аргументов — все документы с диаграммами). Рисует каждую диаграмму в безголовом браузере.
// exit 0 — все отрисовались, exit 1 — есть ошибки, exit 2 — проверить нельзя (нет браузера или сети).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, listDocs, rel } from "./lib/docs.mjs";
import { extractMermaid } from "./lib/mermaid.mjs";
import { runPage, MERMAID_CDN } from "./lib/browser.mjs";

const args = process.argv.slice(2).map(rel);
const files = (args.length ? args : listDocs()).filter((f) => f.endsWith(".md"));
const diagrams = [];
for (const f of files) {
  const full = path.join(ROOT, f);
  if (!fs.existsSync(full)) continue;
  for (const b of extractMermaid(fs.readFileSync(full, "utf8"))) diagrams.push({ where: `${f}:${b.line}`, code: b.code });
}
if (!diagrams.length) {
  console.log("Диаграмм не найдено.\nВЕРДИКТ: ПРОШЛО");
  process.exit(0);
}

const page = path.join(os.tmpdir(), "petrovich-render-check.html");
fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><script src="${MERMAID_CDN}"></script></head><body>
<pre id="out"></pre><script>
const items = ${JSON.stringify(diagrams).replaceAll("</", "<\\/")};
(async () => {
  if (!window.mermaid) { document.getElementById("out").textContent = "RESULT:" + JSON.stringify({ error: "mermaid не загрузился — нет сети" }); return; }
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  const res = [];
  for (const [i, d] of items.entries()) {
    try { await mermaid.parse(d.code); const { svg } = await mermaid.render("d" + i, d.code); res.push({ ok: svg.includes("<svg") }); }
    catch (e) { res.push({ ok: false, err: String(e.message || e).split("\\n").slice(0, 3).join(" ") }); }
  }
  document.getElementById("out").textContent = "RESULT:" + JSON.stringify({ res });
})();
</script></body></html>`);

const out = runPage(page);
if (!out || out.error) {
  console.log(`ВЕРДИКТ: НЕ ПРОВЕРЕНО — ${out ? out.error : "не найден Edge или Chrome"}`);
  process.exit(2);
}
let bad = 0;
out.res.forEach((r, i) => {
  if (r.ok) console.log(`OK      ${diagrams[i].where}`);
  else { bad++; console.log(`ОШИБКА  ${diagrams[i].where}: ${r.err}`); }
});
console.log(bad ? `\nВЕРДИКТ: НЕ ПРОШЛО — не отрисовано диаграмм: ${bad}` : `\nВЕРДИКТ: ПРОШЛО — диаграмм: ${diagrams.length}`);
process.exit(bad ? 1 : 0);
