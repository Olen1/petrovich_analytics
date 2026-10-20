// Mermaid-диаграммы в markdown: извлечение и быстрая статическая проверка (полная — рендером, `npm run render`).

export const DIAGRAM_TYPES = [
  "flowchart", "graph", "sequenceDiagram", "stateDiagram", "stateDiagram-v2", "journey", "gantt", "timeline",
  "quadrantChart", "mindmap", "classDiagram", "erDiagram", "pie", "xychart-beta", "block-beta",
];

/** Блоки ```mermaid … ``` с номером первой строки. */
export function extractMermaid(text) {
  const blocks = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```mermaid\s*$/.test(lines[i])) continue;
    const start = i + 1;
    const body = [];
    for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    blocks.push({ line: start, code: body.join("\n"), closed: i < lines.length });
  }
  return blocks;
}

/** Статические ошибки диаграммы: тип, незакрытый блок, непарные скобки и кавычки, размер. */
export function lintMermaid(block) {
  const errors = [];
  const warnings = [];
  if (!block.closed) errors.push("блок ```mermaid не закрыт");
  const meaningful = block.code.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("%%"));
  if (!meaningful.length) return { errors: [...errors, "пустая диаграмма"], warnings };
  const type = meaningful[0].split(/\s+/)[0];
  if (!DIAGRAM_TYPES.includes(type)) errors.push(`неизвестный тип диаграммы «${type}»`);
  meaningful.forEach((l, i) => {
    const quotes = (l.match(/"/g) || []).length;
    if (quotes % 2) errors.push(`строка ${i + 1}: непарная кавычка`);
    const unquoted = l.replace(/"[^"]*"/g, "");
    for (const [a, b] of [["[", "]"], ["(", ")"], ["{", "}"]]) {
      if (unquoted.split(a).length !== unquoted.split(b).length) errors.push(`строка ${i + 1}: непарные ${a}${b}`);
    }
  });
  const nodes = new Set();
  for (const m of block.code.matchAll(/(?:^|[\s>-])([A-Za-z][\w]*)\s*[[({]/g)) nodes.add(m[1]);
  if (nodes.size > 15) warnings.push(`${nodes.size} узлов — больше 15 читается плохо, разбейте диаграмму`);
  return { errors, warnings };
}
