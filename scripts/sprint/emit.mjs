// Фигуры из layouts.mjs → .pptx (мастер, тема и стиль таблиц — из шаблона) и HTML-превью для проверки вёрстки.
import fs from "node:fs";
import path from "node:path";
import { readZip, writeZip } from "../lib/zip.mjs";
import { C, TONES } from "./layouts.mjs";

const EMU = 914400;
const emu = (inch) => Math.round(inch * EMU);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Метки статуса в тексте: [[ok:Сделано]], [[med:Частично]], [[high:Не сделано]], [[low:Иначе]].
const MARKS = { ok: TONES.green[0], med: TONES.amber[0], high: TONES.red[0], low: TONES.blue[0] };

/** Текст → абзацы из прогонов {t, b, color}. `**жирный**`, метки [[ok:…]], перевод строки — новый абзац. */
export function parseText(src, sh) {
  return String(src).split("\n").map((line, pi, all) => {
    const muted = sh.lastMuted && pi === all.length - 1 && all.length > 1;
    const base = { b: !!sh.bold && !muted, color: muted ? C.muted : sh.color };
    const runs = [];
    const re = /\*\*(.+?)\*\*|\[\[(ok|med|high|low):(.+?)\]\]/g;
    let last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) runs.push({ ...base, t: line.slice(last, m.index) });
      if (m[1] !== undefined) runs.push({ ...base, b: true, color: sh.strongColor || base.color, t: m[1] });
      else runs.push({ ...base, b: true, color: MARKS[m[2]], t: m[3] });
      last = re.lastIndex;
    }
    if (last < line.length || !runs.length) runs.push({ ...base, t: line.slice(last) });
    return { runs, size: muted ? Math.min(sh.size, 10.5) : sh.size };
  });
}

// ---------- размеры картинок (для обрезки «по заполнению», как object-fit: cover) ----------
function imageSize(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  for (let p = 2; p < buf.length - 9;) {
    if (buf[p] !== 0xff) { p++; continue; }
    const marker = buf[p + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(p + 7), buf.readUInt16BE(p + 5)];
    p += 2 + buf.readUInt16BE(p + 2);
  }
  return null;
}
function cropFor(buf, w, h) {
  const size = imageSize(buf);
  if (!size) return { l: 0, t: 0, r: 0, b: 0 };
  const ratio = size[0] / size[1], box = w / h;
  if (Math.abs(ratio - box) < 0.005) return { l: 0, t: 0, r: 0, b: 0 };
  if (ratio > box) { const cut = Math.round(((1 - box / ratio) / 2) * 100000); return { l: cut, r: cut, t: 0, b: 0 }; }
  const cut = Math.round(((1 - ratio / box) / 2) * 100000);
  return { t: cut, b: cut, l: 0, r: 0 };
}

// ---------- OOXML ----------
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const fillXml = (c) => (c ? `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>` : "<a:noFill/>");
const lineXml = (c, w = 12700) => (c ? `<a:ln w="${w}">${fillXml(c)}</a:ln>` : "<a:ln><a:noFill/></a:ln>");
const xfrm = (s) => `<a:xfrm><a:off x="${emu(s.x)}" y="${emu(s.y)}"/><a:ext cx="${emu(s.w)}" cy="${emu(s.h ?? 0)}"/></a:xfrm>`;
const ALGN = { l: "l", ctr: "ctr", r: "r" };
// Минимальная высота строки таблицы: PowerPoint не сжимает строку ниже неё, превью повторяет то же правило.
const ROW_MIN = 0.3;

function runXml(r, size) {
  return `<a:r><a:rPr lang="ru-RU" sz="${Math.round(size * 100)}" b="${r.b ? 1 : 0}" dirty="0">${fillXml(r.color)}<a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:rPr><a:t>${esc(r.t)}</a:t></a:r>`;
}
function parasXml(sh) {
  return parseText(sh.text, sh).map((p) => {
    const bullet = sh.bullets ? `marL="171450" indent="-171450"` : `marL="0" indent="0"`;
    const bu = sh.bullets ? `<a:buClr><a:srgbClr val="${sh.color}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>` : "<a:buNone/>";
    const gap = sh.gap ? `<a:spcAft><a:spcPts val="${sh.gap * 100}"/></a:spcAft>` : "";
    return `<a:p><a:pPr ${bullet} algn="${ALGN[sh.align]}">${gap}${bu}</a:pPr>${p.runs.map((r) => runXml(r, p.size)).join("")}</a:p>`;
  }).join("");
}

function shapeXml(sh, id, rel) {
  const name = esc(sh.name || `${sh.k} ${id}`);
  if (sh.k === "box") {
    const geom = sh.geom === "ellipse" ? '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'
      : `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.round((sh.r / Math.min(sh.w, sh.h)) * 100000))}"/></a:avLst></a:prstGeom>`;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(sh)}${geom}${fillXml(sh.fill)}${lineXml(sh.line)}</p:spPr></p:sp>`;
  }
  if (sh.k === "text") {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(sh)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
      + `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${sh.anchor}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${parasXml(sh)}</p:txBody></p:sp>`;
  }
  if (sh.k === "arrow") {
    return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm({ ...sh, h: 0 })}<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:ln w="22225">${fillXml(sh.color)}<a:tailEnd type="triangle" w="med" len="med"/></a:ln></p:spPr></p:cxnSp>`;
  }
  if (sh.k === "img") {
    const c = rel.crop;
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr="${esc(sh.alt || "")}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rel.id}"/><a:srcRect l="${c.l}" t="${c.t}" r="${c.r}" b="${c.b}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(sh)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }
  if (sh.k === "table") {
    const border = ["lnL", "lnR", "lnT", "lnB"].map((t) => `<a:${t} w="9525">${fillXml(C.line)}</a:${t}>`).join("");
    const cell = (t, head) => {
      const plus = !head && /^[+−-]$/.test(t.trim());
      const sh2 = { text: t, size: sh.size, bold: head || plus, color: plus ? (t.trim() === "+" ? C.green : C.red) : C.ink, align: "l" };
      return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${parasXml(sh2)}</a:txBody><a:tcPr marL="82300" marR="82300" marT="82300" marB="82300" anchor="ctr">${border}${fillXml(C.card)}</a:tcPr></a:tc>`;
    };
    const rowXml = (r, head) => `<a:tr h="${emu(ROW_MIN)}">${r.map((t) => cell(String(t), head)).join("")}</a:tr>`;
    return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
      + `<p:xfrm><a:off x="${emu(sh.x)}" y="${emu(sh.y)}"/><a:ext cx="${emu(sh.w)}" cy="${emu(ROW_MIN * (sh.rows.length + 1))}"/></p:xfrm>`
      + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${sh.cols.map((w) => `<a:gridCol w="${emu(w)}"/>`).join("")}</a:tblGrid>`
      + `${rowXml(sh.head, true)}${sh.rows.map((r) => rowXml(r, false)).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  }
  throw new Error(`неизвестная фигура ${sh.k}`);
}

const slideXml = (body, bg) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld><p:bg><p:bgPr>${fillXml(bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

const notesXml = (notes) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>`
  + `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>`
  + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>`
  + String(notes || "").split("\n").map((l) => `<a:p><a:r><a:rPr lang="ru-RU" dirty="0"/><a:t>${esc(l)}</a:t></a:r></a:p>`).join("")
  + `</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rels = (list) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith("http") ? type : `${REL}/${type}`}" Target="${target}"/>`).join("")}</Relationships>`;

/**
 * Собрать .pptx. slides — [{shapes, notes, bg}], root — корень проекта (пути картинок от него).
 * Мастер, макет, темы, стиль таблиц и стиль текста по умолчанию берутся из шаблона.
 */
export function buildPptx({ slides, title, description, templatePath, root }) {
  const tpl = readZip(fs.readFileSync(templatePath));
  const keep = ["ppt/theme/theme1.xml", "ppt/theme/theme2.xml", "ppt/slideMasters/slideMaster1.xml", "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    "ppt/slideLayouts/slideLayout1.xml", "ppt/slideLayouts/_rels/slideLayout1.xml.rels", "ppt/notesMasters/notesMaster1.xml",
    "ppt/notesMasters/_rels/notesMaster1.xml.rels", "ppt/tableStyles.xml", "ppt/presProps.xml"];
  const out = [];
  const media = new Map(); // путь → имя в ppt/media
  const parts = [];
  slides.forEach((sl, i) => {
    const n = i + 1;
    const slideRels = [["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "notesSlide", `../notesSlides/notesSlide${n}.xml`]];
    let id = 2;
    const body = sl.shapes.map((sh) => {
      let rel;
      if (sh.k === "img") {
        const file = path.join(root, sh.src);
        const buf = fs.readFileSync(file);
        if (!media.has(sh.src)) media.set(sh.src, { name: `image${media.size + 1}${path.extname(file).toLowerCase().replace(".jpeg", ".jpg")}`, buf });
        rel = { id: `rId${slideRels.length + 1}`, crop: cropFor(buf, sh.w, sh.h) };
        slideRels.push([rel.id, "image", `../media/${media.get(sh.src).name}`]);
      }
      return shapeXml(sh, id++, rel);
    }).join("");
    parts.push([`ppt/slides/slide${n}.xml`, slideXml(body, sl.bg || C.card)], [`ppt/slides/_rels/slide${n}.xml.rels`, rels(slideRels)],
      [`ppt/notesSlides/notesSlide${n}.xml`, notesXml(sl.notes)],
      [`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, rels([["rId1", "notesMaster", "../notesMasters/notesMaster1.xml"], ["rId2", "slide", `../slides/slide${n}.xml`]])]);
  });

  const ct = "application/vnd.openxmlformats-officedocument.presentationml";
  const over = (p, t) => `<Override PartName="/${p}" ContentType="${t}"/>`;
  out.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
    + `<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>`
    + over("ppt/presentation.xml", `${ct}.presentation.main+xml`) + over("ppt/presProps.xml", `${ct}.presProps+xml`)
    + over("ppt/tableStyles.xml", `${ct}.tableStyles+xml`) + over("ppt/slideMasters/slideMaster1.xml", `${ct}.slideMaster+xml`)
    + over("ppt/slideLayouts/slideLayout1.xml", `${ct}.slideLayout+xml`) + over("ppt/notesMasters/notesMaster1.xml", `${ct}.notesMaster+xml`)
    + over("ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml") + over("ppt/theme/theme2.xml", "application/vnd.openxmlformats-officedocument.theme+xml")
    + slides.map((_, i) => over(`ppt/slides/slide${i + 1}.xml`, `${ct}.slide+xml`) + over(`ppt/notesSlides/notesSlide${i + 1}.xml`, `${ct}.notesSlide+xml`)).join("")
    + over("docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml") + "</Types>"]);
  out.push(["_rels/.rels", rels([["rId1", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"], ["rId2", "officeDocument", "ppt/presentation.xml"]])]);
  out.push(["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Петрович — аналитика</dc:creator><dc:description>${esc(description)}</dc:description></cp:coreProperties>`]);

  // presentation.xml: стиль текста по умолчанию — из шаблона, список слайдов — свой.
  const presTpl = tpl.get("ppt/presentation.xml").toString("utf8");
  const defaultText = (presTpl.match(/<p:defaultTextStyle>.*<\/p:defaultTextStyle>/s) || [""])[0];
  out.push(["ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId4"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId5"/></p:notesMasterIdLst>`
    + `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${6 + i}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>${defaultText}</p:presentation>`]);
  out.push(["ppt/_rels/presentation.xml.rels", rels([["rId1", "theme", "theme/theme2.xml"], ["rId2", "presProps", "presProps.xml"], ["rId3", "tableStyles", "tableStyles.xml"],
    ["rId4", "slideMaster", "slideMasters/slideMaster1.xml"], ["rId5", "notesMaster", "notesMasters/notesMaster1.xml"],
    ...slides.map((_, i) => [`rId${6 + i}`, "slide", `slides/slide${i + 1}.xml`])])]);
  for (const k of keep) {
    if (!tpl.has(k)) throw new Error(`в шаблоне нет ${k}`);
    out.push([k, tpl.get(k)]);
  }
  out.push(...parts);
  for (const { name, buf } of media.values()) out.push([`ppt/media/${name}`, buf]);
  return writeZip(out);
}

// ---------- HTML-превью: те же фигуры, 96 px на дюйм; ?check — отчёт о тексте за краем ----------
const px = (inch) => +(inch * 96).toFixed(2);
const pt = (size) => +((size * 96) / 72).toFixed(2);
const escH = (s) => esc(s).replace(/"/g, "&quot;");

function textHtml(sh) {
  return parseText(sh.text, sh).map((p) => `<p style="font-size:${pt(p.size)}px;margin:0 0 ${sh.gap ? pt(sh.gap) : 0}px${sh.bullets ? ";padding-left:14px;text-indent:-14px" : ""}">${sh.bullets ? "•&nbsp;&nbsp;" : ""}`
    + p.runs.map((r) => `<span style="color:#${r.color};font-weight:${r.b ? 700 : 400}">${escH(r.t)}</span>`).join("") + "</p>").join("");
}

function shapeHtml(sh, si, idx, root, htmlDir) {
  const pos = `left:${px(sh.x)}px;top:${px(sh.y)}px;width:${px(sh.w)}px;height:${px(sh.h ?? 0)}px`;
  if (sh.k === "box") {
    const radius = sh.geom === "ellipse" ? "50%" : `${px(Math.min(sh.r, sh.w / 2, sh.h / 2))}px`;
    return `<div class="s" style="${pos};background:#${sh.fill};border-radius:${radius};${sh.line ? `box-shadow:inset 0 0 0 1.3px #${sh.line}` : ""}"></div>`;
  }
  if (sh.k === "text") {
    const jc = { t: "flex-start", ctr: "center", b: "flex-end" }[sh.anchor];
    return `<div class="s t" data-slide="${si + 1}" data-i="${idx}" style="${pos};justify-content:${jc};text-align:${{ l: "left", ctr: "center", r: "right" }[sh.align]}"><div class="in">${textHtml(sh)}</div></div>`;
  }
  if (sh.k === "arrow") return `<div class="s a" style="left:${px(sh.x)}px;top:${px(sh.y) - 1}px;width:${px(sh.w)}px;--c:#${sh.color}"></div>`;
  if (sh.k === "img") {
    const src = path.relative(htmlDir, path.join(root, sh.src)).split(path.sep).join("/");
    return `<img class="s" src="${escH(src)}" alt="${escH(sh.alt || "")}" style="${pos};object-fit:cover">`;
  }
  if (sh.k === "table") {
    const cell = (t, tag) => {
      const plus = tag === "td" && /^[+−-]$/.test(String(t).trim());
      const color = plus ? (String(t).trim() === "+" ? C.green : C.red) : C.ink;
      return `<${tag}>${textHtml({ text: t, size: sh.size, bold: tag === "th" || plus, color })}</${tag}>`;
    };
    return `<div class="s tb" data-slide="${si + 1}" data-i="${idx}" style="${pos}"><table style="width:${px(sh.w)}px"><colgroup>${sh.cols.map((w) => `<col style="width:${px(w)}px">`).join("")}</colgroup>`
      + `<tr>${sh.head.map((t) => cell(t, "th")).join("")}</tr>${sh.rows.map((r) => `<tr>${r.map((t) => cell(t, "td")).join("")}</tr>`).join("")}</table></div>`;
  }
  return "";
}

export function buildPreview({ slides, title, root, htmlFile }) {
  const htmlDir = path.dirname(htmlFile);
  const body = slides.map((sl, si) => `<section class="slide" id="s${si + 1}" style="background:#${sl.bg || C.card}">${sl.shapes.map((sh, i) => shapeHtml(sh, si, i, root, htmlDir)).join("")}<span class="num">${si + 1}</span></section>`
    + (sl.notes ? `<aside class="notes"><b>Заметки, слайд ${si + 1}.</b> ${escH(sl.notes)}</aside>` : "")).join("\n");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${escH(title)} — превью</title><style>
body{margin:0;background:#d6d7da;font-family:Arial,Helvetica,sans-serif;padding:24px 0}
.slide{position:relative;width:1280px;height:720px;margin:0 auto 8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.15)}
.s{position:absolute;box-sizing:border-box}.t{display:flex;flex-direction:column}.in{line-height:1.17}
.a{height:2px;background:var(--c)}.a:after{content:"";position:absolute;right:-1px;top:-4px;border:5px solid transparent;border-left:8px solid var(--c);border-right:0}
table{border-collapse:collapse;table-layout:fixed;background:#fff}th,td{border:1px solid #${C.line};padding:8.6px;vertical-align:middle;text-align:left;line-height:1.17;height:${px(ROW_MIN)}px;box-sizing:border-box}
.num{position:absolute;right:14px;bottom:6px;font-size:11px;color:#999}.notes{width:1240px;margin:0 auto 28px;font-size:13px;color:#444;line-height:1.4}
.bad{outline:2px solid #e00;outline-offset:1px}#result{display:none}
</style></head><body>${body}<pre id="result"></pre><script>
// Текст за краем: содержимое выше или шире своей рамки. Впритык (>94 %) — предупреждение: PowerPoint верстает чуть иначе браузера.
const over = [], tight = [];
for (const el of document.querySelectorAll(".t,.tb")) {
  const inner = el.firstElementChild, box = el.getBoundingClientRect(), r = inner.getBoundingClientRect();
  // Таблицу PowerPoint верстает на несколько процентов выше браузера — у неё запас 5 %.
  const h = el.classList.contains("tb") ? r.height * 1.05 : inner.scrollHeight, w = inner.scrollWidth;
  const where = "слайд " + el.dataset.slide + ": «" + el.innerText.trim().replace(/\\s+/g, " ").slice(0, 50) + "»";
  if (h > box.height + 1 || w > box.width + 1) { over.push(where + " — нужно " + Math.round(h) + "px по высоте, есть " + Math.round(box.height)); el.classList.add("bad"); }
  else if (el.classList.contains("t") && box.height > 30 && h > box.height * 0.94) tight.push(where);
}
if (location.search.includes("check")) document.getElementById("result").textContent = "RESULT:" + JSON.stringify({ slides: ${slides.length}, overflow: over, tight, fonts: document.fonts.check("12px Arial") });
</script></body></html>`;
}
