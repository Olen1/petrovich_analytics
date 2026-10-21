// Вёрстка слайдов отчёта по спринту: тип слайда из JSON → фигуры с координатами в дюймах.
// Сетка, цвета и кегли сняты с шаблона scripts/sprint/template.pptx («Петрович_итоги_1_спринта_v11»).
// Из одних и тех же фигур собираются .pptx и HTML-превью, по превью браузер проверяет, что текст влез.

export const C = {
  ink: "1E1F21", muted: "6B6E73", panel: "F1F1F2", card: "FFFFFF", line: "D9DADC", dark: "2A2D34", mint: "B8D9C5",
  soft: "CDD2D7", plan: "B5BBC1", green: "2F8F5B", greenBg: "E3F1E8", red: "D2453B", redBg: "FBE7E5",
  amber: "C98A1B", amberBg: "FBF0DC", blue: "4A6CF7", blueBg: "E8EDFE", purple: "8E44D9", purpleBg: "F1E8FB",
};

// Тон → [цвет текста, фон плашки]. Колонки и блоки красятся по порядку: зелёный, синий, фиолетовый.
export const TONES = {
  green: [C.green, C.greenBg], blue: [C.blue, C.blueBg], purple: [C.purple, C.purpleBg],
  red: [C.red, C.redBg], amber: [C.amber, C.amberBg], gray: [C.muted, C.panel],
};
const ORDER = ["green", "blue", "purple"];
const tone = (name, i = 0) => TONES[name] || TONES[ORDER[i % ORDER.length]];

// Статус задачи в «план против факта» → тон плашки.
export function statusTone(s) {
  const t = String(s).toLowerCase();
  if (t.startsWith("сделано иначе") || t.startsWith("иначе")) return "blue";
  if (t.startsWith("сделано")) return "green";
  if (t.startsWith("не сделано") || t.startsWith("отменено")) return "red";
  return "amber"; // «Частично», «Перенесено», «Спринт N»
}

const X0 = 0.85, W = 11.6, BOTTOM = 6.6;
const R = 0.18; // скругление карточек

const box = (x, y, w, h, fill, o = {}) => ({ k: "box", x, y, w, h, fill, r: R, ...o });
const text = (x, y, w, h, t, size, o = {}) => ({ k: "text", x, y, w, h, text: String(t ?? ""), size, color: C.ink, align: "l", anchor: "ctr", ...o });
const arrow = (x, y, w, color = C.green) => ({ k: "arrow", x, y, w, color });

/** Шаг строк, чтобы n строк влезли от y0 до y1. */
const stepFor = (n, y0, y1, max, gap) => Math.min(max, (y1 - y0 + gap) / n);

function frame(s) {
  return [
    box(0.4, 0.3, 12.53, 6.9, C.panel, { r: 0.3, name: "Фон" }),
    text(X0, 0.6, W, 0.7, s.title, 28, { bold: true, anchor: "t", name: "Заголовок" }),
  ];
}
const footer = (s) => (s.source ? [text(X0, 6.75, 11.5, 0.3, s.source, 9, { color: C.muted, name: "Источник" })] : []);

const L = {};

// 1. Обложка.
L.cover = (s) => [
  box(0.4, 0.3, 12.53, 6.9, C.panel, { r: 0.3, name: "Фон" }),
  { k: "img", x: X0, y: 0.65, w: 0.85, h: 0.85, src: "slides/assets/logo.png", alt: "Логотип Петрович" },
  text(1.85, 0.85, 4, 0.45, "ПЕТРОВИЧ", 16, { bold: true, color: C.green }),
  text(1.0, 2.1, 11.3, 1.6, s.title, 36, { bold: true, anchor: "b", name: "Заголовок" }),
  text(1.0, 3.8, 11.3, 0.5, s.subtitle, 18, { color: C.green }),
  text(1.0, 4.5, 11.3, 0.5, s.label, 18, { bold: true, color: C.muted }),
  text(1.0, 5.9, 11.3, 0.4, s.meta, 13, { color: C.muted }),
];

// 2. Итоги спринта: план против факта + счёт и что дальше.
L.summary = (s) => {
  const out = frame(s);
  const step = stepFor(s.rows.length, 1.5, 6.53, 0.73, 0.1), h = step - 0.1;
  s.rows.forEach(([task, detail, status], i) => {
    const y = 1.5 + i * step;
    const [fg, bg] = tone(statusTone(status));
    out.push(box(X0, y, 8.4, h, C.card),
      text(1.05, y, 3.9, h, task, 13, { bold: true }),
      text(4.95, y, 2.7, h, detail, 11, { color: C.muted }),
      box(7.65, y + (h - 0.34) / 2, 1.45, 0.34, bg, { r: 0.17 }),
      text(7.65, y + (h - 0.34) / 2, 1.45, 0.34, status, 10.5, { bold: true, color: fg, align: "ctr" }));
  });
  out.push(box(9.5, 1.5, 2.95, 5.03, C.dark, { r: 0.3 }),
    text(9.5, 1.8, 2.95, 1.0, s.score[0], 46, { bold: true, color: C.mint, align: "ctr" }),
    text(9.5, 2.8, 2.95, 0.4, s.score[1], 14, { color: C.card, align: "ctr" }));
  if (s.next) out.push(
    text(9.75, 3.5, 2.5, 0.35, s.next.title, 14, { bold: true, color: C.mint }),
    text(9.75, 3.95, 2.55, 2.45, s.next.items.join("\n"), 12, { color: C.card, anchor: "t", bullets: true, gap: 4 }));
  return out;
};

// 3. Тёмная панель слева + карточки справа (клиент и боли, контекст).
L.panel = (s) => {
  const out = frame(s), p = s.panel;
  out.push(box(X0, 1.5, 4.3, 5.1, C.dark, { r: 0.3 }),
    text(1.1, 1.65, 3.8, 0.3, p.kicker, 11, { bold: true, color: C.mint }),
    text(1.1, 2.0, 3.8, 1.0, p.head, 22, { bold: true, color: C.card }),
    text(1.1, 3.15, 3.8, 0.9, p.text, 13, { color: C.soft, anchor: "t" }));
  if (p.kicker2) out.push(text(1.1, 4.2, 3.8, 0.3, p.kicker2, 12, { bold: true, color: C.mint }));
  if (p.lines) out.push(text(1.1, 4.55, 3.8, 1.9, p.lines.join("\n"), 16, { bold: true, color: C.card, anchor: "t", gap: 3 }));
  const [fg] = tone(s.accent || "red");
  out.push(text(5.45, 1.5, 7.0, 0.35, s.heading, 15, { bold: true, color: fg }));
  const step = stepFor(s.cards.length, 1.95, BOTTOM, 1.18, 0.12), h = step - 0.12;
  s.cards.forEach(([head, body], i) => {
    const y = 1.95 + i * step;
    out.push(box(5.45, y, 7.0, h, C.card),
      text(5.7, y + 0.1, 6.6, 0.38, head, 14, { bold: true }),
      text(5.7, y + 0.48, 6.6, h - 0.56, body, 12.5, { color: C.muted, anchor: "t" }));
  });
  return out;
};

// 4. Было → стало: две колонки со стрелками.
L.compare = (s) => {
  const out = frame(s);
  let y = 1.5;
  if (s.lead) {
    out.push(box(X0, y, W, 0.95, C.card), text(1.1, y, 11.1, 0.95, s.lead, 16, { bold: true }));
    y += 1.15;
  }
  out.push(text(X0, y, 5.4, 0.35, s.head[0], 14, { bold: true, color: C.red }),
    text(6.9, y, 5.4, 0.35, s.head[1], 14, { bold: true, color: C.green }));
  const y0 = y + 0.4, step = stepFor(s.rows.length, y0, BOTTOM, 0.88, 0.12), h = step - 0.12;
  s.rows.forEach(([a, b], i) => {
    const ry = y0 + i * step;
    out.push(box(X0, ry, 5.6, h, C.redBg), text(1.05, ry, 5.2, h, a, 13.5),
      arrow(6.5, ry + h / 2, 0.35),
      box(6.9, ry, 5.55, h, C.greenBg), text(7.1, ry, 5.2, h, b, 13.5, { bold: true, color: C.green }));
  });
  return out;
};

// 5. Чат-бот: диалог, возможности, как говорит.
L.chat = (s) => {
  const out = frame(s), d = s.dialog;
  out.push(box(X0, 1.5, 5.3, 3.35, C.card),
    text(1.05, 1.6, 3.0, 0.3, d.label || "Диалог", 11, { bold: true, color: C.muted }),
    box(3.2, 1.95, 2.75, 0.5, C.blue),
    text(3.3, 1.95, 2.55, 0.5, d.question, 12.5, { color: C.card, align: "r" }),
    box(1.05, 2.6, 0.42, 0.42, C.green, { geom: "ellipse" }),
    text(1.05, 2.6, 0.42, 0.42, "П", 13, { bold: true, color: C.card, align: "ctr" }),
    text(1.6, 2.55, 4.35, 1.15, d.answer, 12.5, { anchor: "t" }));
  (d.actions || []).slice(0, 2).forEach((a, i) => {
    const x = 1.6 + i * 1.95;
    out.push(box(x, 3.75, 1.85, 0.42, i ? C.card : C.dark, { r: 0.21, line: i ? C.line : undefined }),
      text(x, 3.75, 1.85, 0.42, a, 11.5, { bold: !i, color: i ? C.ink : C.card, align: "ctr" }));
  });
  if (d.fallback) out.push(text(1.05, 4.25, 4.95, 0.55, d.fallback, 10.5, { color: C.muted }));
  s.features.forEach(([head, body], i) => {
    const x = i % 2 ? 9.47 : 6.45, y = 1.5 + Math.floor(i / 2) * 1.13;
    out.push(box(x, y, 2.9, 1.02, C.card),
      text(x + 0.15, y + 0.08, 2.6, 0.34, head, 13, { bold: true, color: C.green }),
      text(x + 0.15, y + 0.42, 2.62, 0.58, body, 11, { anchor: "t" }));
  });
  if (s.voice) out.push(
    text(X0, 5.0, 5.0, 0.35, s.voice.title, 14, { bold: true }),
    box(X0, 5.4, 5.6, 1.2, C.redBg), text(1.05, 5.4, 5.2, 1.2, s.voice.dont, 12.5, { color: C.red }),
    box(6.6, 5.4, 5.85, 1.2, C.greenBg), text(6.8, 5.4, 5.5, 1.2, s.voice.do, 12.5, { color: C.green }));
  return out;
};

// 6. Находки → что это значит.
L.findings = (s) => {
  const out = frame(s);
  out.push(text(X0, 1.45, 6.0, 0.35, s.head[0], 14, { bold: true, color: C.muted }),
    text(9.0, 1.45, 3.5, 0.35, s.head[1], 14, { bold: true, color: C.green }));
  const step = stepFor(s.rows.length, 1.88, BOTTOM, 0.95, 0.11), h = step - 0.11;
  s.rows.forEach(([head, body, tag], i) => {
    const y = 1.88 + i * step;
    out.push(box(X0, y, 7.9, h, C.card), text(1.05, y, 2.9, h, head, 13, { bold: true }),
      text(3.95, y, 4.7, h, body, 11.5, { color: C.muted }),
      arrow(8.8, y + h / 2, 0.17),
      box(9.0, y, 3.45, h, C.greenBg), text(9.15, y, 3.2, h, tag, 13, { bold: true, color: C.green }));
  });
  return out;
};

// 7. Таблица (сравнение, метрики, стек); справа — до двух карточек, снизу — вывод.
L.table = (s) => {
  const out = frame(s);
  const tw = s.side ? 7.6 : W;
  const bottom = s.note ? 5.85 : BOTTOM;
  const weights = s.widths || s.head.map((_, i) => (i ? 1 : 1.6));
  const sum = weights.reduce((a, b) => a + b, 0);
  out.push({ k: "table", x: X0, y: 1.45, w: tw, h: bottom - 1.45, cols: weights.map((v) => (tw * v) / sum), head: s.head, rows: s.rows, size: s.size || 12.5 });
  if (s.note) out.push(text(X0, 5.95, tw, 0.65, s.note, 12, { anchor: "t" }));
  (s.side || []).forEach((c, i) => {
    const y = 1.45 + i * 2.55, [fg] = tone(c.tone || "green");
    out.push(box(8.7, y, 3.75, 2.4, C.card),
      text(8.9, y + 0.1, 3.4, 0.32, c.head, 12.5, { bold: true }),
      text(8.9, y + 0.42, 1.45, 0.55, c.big, 24, { bold: true, color: fg }),
      text(10.35, y + 0.45, 2.0, 0.55, c.meta, 9.5, { color: C.muted }),
      text(8.9, y + 1.05, 3.4, 1.25, c.text, 11, { anchor: "t" }));
  });
  return out;
};

// 8. Колонки пунктов: 2 колонки — гипотезы, 3 — задачи на следующий спринт. Над ними — цель на тёмной плашке.
L.columns = (s) => {
  const out = frame(s);
  let top = 1.42;
  if (s.lead) {
    out.push(box(X0, top, W, 0.55, C.dark, { r: 0.15 }),
      text(1.05, top, 11.2, 0.55, s.lead, 13.5, { bold: true, color: C.card, strongColor: C.mint }));
    top += 0.73;
  }
  const n = s.columns.length;
  if (n === 2) {
    s.columns.forEach((col, ci) => {
      const x = ci ? 6.73 : X0, [fg] = tone(col.tone, ci);
      out.push(text(x, top, 5.0, 0.35, col.title, 15, { bold: true, color: fg }));
      const y0 = top + 0.43, step = stepFor(col.items.length, y0, BOTTOM, 0.95, 0.1), h = step - 0.1;
      col.items.forEach(([badge, body, sub], i) => {
        const y = y0 + i * step;
        out.push(box(x, y, 5.72, h, C.card), text(x + 0.2, y, 0.6, h, badge || String(i + 1), 14, { bold: true, color: fg }));
        if (sub) out.push(text(x + 0.85, y + 0.06, 4.75, h - 0.4, body, 12.5, { bold: true, anchor: "t" }),
          text(x + 0.85, y + h - 0.33, 4.75, 0.28, sub, 10.5, { color: C.muted }));
        else out.push(text(x + 0.85, y, 4.75, h, body, 12.5, { bold: true }));
      });
    });
    return out;
  }
  const cw = (W - 0.16 * (n - 1)) / n;
  s.columns.forEach((col, ci) => {
    const x = X0 + ci * (cw + 0.16), [fg] = tone(col.tone, ci);
    out.push(box(x, top, cw, BOTTOM - top, C.card), text(x + 0.22, top + 0.15, cw - 0.44, 0.4, col.title, 15, { bold: true, color: fg }));
    const y0 = top + 0.7, step = stepFor(col.items.length, y0, BOTTOM - 0.15, 0.92, 0.12), h = step - 0.12;
    col.items.forEach(([badge, body, sub], i) => {
      const y = y0 + i * step;
      out.push(box(x + 0.18, y, cw - 0.36, h, C.panel),
        text(x + 0.3, y, 0.3, h, badge || String(i + 1), 14, { bold: true, color: fg }),
        text(x + 0.62, y, cw - 0.88, h, sub ? `${body}\n${sub}` : body, 12, { lastMuted: !!sub }));
    });
  });
  return out;
};

// 9. Что сделали: список слева, цифры под ним, справа — один-два блока (дальше, ограничения, решения).
L.progress = (s) => {
  const out = frame(s);
  const lw = s.side ? 7.1 : W;
  let y0 = 1.42;
  if (s.heading) { out.push(text(X0, y0, lw, 0.35, s.heading, 14, { bold: true, color: C.green })); y0 += 0.43; }
  const bottom = s.stats ? 5.73 : BOTTOM;
  const step = stepFor(s.rows.length, y0, bottom, 0.78, 0.1), h = step - 0.1;
  s.rows.forEach((row, i) => {
    const y = y0 + i * step;
    out.push(box(X0, y, lw, h, C.card));
    if (Array.isArray(row)) out.push(text(1.05, y, 2.3, h, row[0], 12.5, { bold: true }), text(3.35, y, lw - 2.6, h, row[1], 11.5, { color: C.muted }));
    else out.push(text(1.0, y, 0.4, h, String(i + 1), 13, { bold: true, color: C.green }), text(1.4, y, lw - 0.7, h, row, 12.5));
  });
  (s.stats || []).forEach(([num, label], i) => {
    const x = X0 + i * 2.4, nw = Math.min(1.1, 0.3 + 0.16 * String(num).length);
    out.push(box(x, 5.85, 2.25, 0.8, C.greenBg),
      text(x + 0.12, 5.85, nw, 0.8, num, 18, { bold: true, color: C.green }),
      text(x + 0.2 + nw, 5.85, 1.95 - nw, 0.8, label, 10));
  });
  const blocks = s.side || [];
  // Высота блока — по оценке числа строк (~40 знаков в строке), плюс заголовок.
  const lines = (arr) => arr.reduce((n, t) => n + Math.ceil(String(t).replace(/\*\*/g, "").length / 40), 0);
  const weight = blocks.map((b) => lines(b.items || String(b.text).split("\n")) + 2);
  const total = weight.reduce((a, b) => a + b, 0);
  let by = 1.42;
  blocks.forEach((b, i) => {
    const bh = ((6.65 - 1.42 - 0.13 * (blocks.length - 1)) * weight[i]) / total;
    // Первый блок по умолчанию — «что дальше» на жёлтой подложке, остальные — белые с синим заголовком.
    const name = b.tone || (i ? "blue" : "amber"), [fg, bg] = tone(name);
    out.push(box(8.2, by, 4.25, bh, name === "amber" ? bg : C.card),
      text(8.4, by + 0.1, 3.85, 0.35, b.title, 14, { bold: true, color: fg }),
      b.items
        ? text(8.4, by + 0.5, 3.9, bh - 0.6, b.items.join("\n"), 12, { anchor: "t", bullets: true, gap: 3 })
        : text(8.4, by + 0.5, 3.9, bh - 0.6, b.text, 11.5, { anchor: "t", gap: 4 }));
    by += bh + 0.13;
  });
  return out;
};

// 10. Экраны: до пяти скриншотов в рамке телефона.
L.screens = (s) => {
  const out = frame(s), n = s.items.length, stepX = 2.415;
  const x0 = X0 + (W - (n * 1.94 + (n - 1) * (stepX - 1.94))) / 2;
  s.items.forEach(([src, title, caption], i) => {
    const x = x0 + i * stepX;
    out.push(box(x, 1.38, 1.94, 4.06, C.dark, { r: 0.22 }),
      { k: "img", x: x + 0.06, y: 1.44, w: 1.82, h: 3.94, src, alt: `Макет: ${title}` },
      text(x - 0.1, 5.5, 2.14, 0.3, title, 12.5, { bold: true, align: "ctr" }),
      text(x - 0.15, 5.78, 2.24, 0.3, caption, 10, { color: C.muted, align: "ctr" }));
  });
  if (s.note) out.push(box(X0, 6.12, W, 0.56, C.card), text(1.05, 6.12, 11.2, 0.56, s.note, 11.5, { color: C.green, strongColor: C.green }));
  return out;
};

// 11. Архитектура: клиент → сервер (модули сделано/план) → внешние системы.
L.flow = (s) => {
  const out = frame(s);
  out.push(box(X0, 1.5, 2.6, 3.4, C.card),
    text(1.0, 1.6, 2.3, 0.35, s.client.title, 13, { bold: true }),
    text(1.0, 2.0, 2.35, 2.8, s.client.items.join("\n"), 12, { anchor: "t", bullets: true, gap: 3 }),
    arrow(3.5, 3.2, 0.5, C.blue),
    text(3.42, 2.85, 0.66, 0.3, s.link || "", 9, { color: C.muted, align: "ctr" }),
    box(4.05, 1.5, 5.0, 3.4, C.card, { line: C.blue }),
    text(4.25, 1.6, 4.6, 0.35, s.server.title, 13, { bold: true, color: C.blue }));
  s.server.items.forEach(([label, status], i) => {
    const x = i % 2 ? 6.6 : 4.25, y = 2.05 + Math.floor(i / 2) * 0.92, done = status !== "plan";
    out.push(box(x, y, 2.2, 0.8, done ? C.greenBg : C.panel, { line: done ? undefined : C.plan }),
      text(x + 0.08, y, 2.04, 0.8, label, 11, { bold: true, color: done ? C.green : C.muted, align: "ctr" }));
  });
  out.push(arrow(9.1, 3.2, 0.45, C.blue));
  s.external.forEach(([title, body], i) => {
    const y = 1.5 + i * 1.18;
    out.push(box(9.6, y, 2.85, 1.04, C.card),
      text(9.8, y + 0.12, 2.5, 0.38, title, 13, { bold: true }),
      text(9.8, y + 0.52, 2.5, 0.4, body, 11, { color: C.muted }));
  });
  const [doneLabel, planLabel] = s.legend || ["сделано", "план"];
  out.push(box(X0, 5.1, 0.5, 0.3, C.greenBg, { r: 0.08 }), text(1.45, 5.08, 1.1, 0.34, doneLabel, 11),
    box(2.6, 5.1, 0.5, 0.3, C.panel, { r: 0.08, line: C.plan }), text(3.2, 5.08, 3.5, 0.34, planLabel, 11));
  if (s.note) out.push(text(X0, 5.6, W, 0.9, s.note, 12.5, { anchor: "t" }));
  return out;
};

// 12. Команда: фото, имя, роль. В шаблоне — без серой подложки.
L.team = (s) => {
  const out = [text(0.45, 0.5, 6.0, 0.6, s.title, 28, { bold: true, name: "Заголовок" })];
  const n = s.members.length, stepX = Math.min(2.52, 12.43 / n);
  s.members.forEach(([src, name, role], i) => {
    const x = 0.45 + i * stepX;
    out.push({ k: "img", x, y: 1.5, w: stepX - 0.17, h: 2.95, src, alt: name },
      text(x, 4.6, stepX - 0.12, 0.4, name, 15, { bold: true }),
      text(x, 5.0, stepX - 0.12, 0.35, role, 13, { color: C.muted }));
  });
  return out;
};

export const TYPES = Object.keys(L);

/** Фигуры слайда в порядке отрисовки. */
export function layoutSlide(s) {
  return [...L[s.type](s), ...(s.type === "cover" ? [] : footer(s))];
}
