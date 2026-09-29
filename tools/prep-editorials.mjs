// Turns harvested magazine lines (raw/chunks/*.json) into data/editorials-YYYY.json.
// Line format from the browser: [column, y, indentFromColumnLeft, gapToColumnRight, height, text]
// Keeps: (1) editorial-page pieces signed "A. W. T.", (2) unsigned editorial-page pieces from
// 3 June 1950 (Tozer's first issue as editor) on, (3) articles bylined "A. W. Tozer".
import fs from "node:fs";
const OVR = JSON.parse(fs.readFileSync("tools/overrides.json", "utf8"));
import { known, fixText2 as fixText, fixDropCap } from "./ocr.mjs";

const EDITOR_FROM = "1950-06-03";
const files = fs.readdirSync("raw/chunks").filter((f) => f.endsWith(".json"));
const ISS = {};
for (const f of files) Object.assign(ISS, JSON.parse(fs.readFileSync("raw/chunks/" + f, "utf8")));
// pages 2-3 of every issue from the second pass, merged in (they win over the first pass for those pages)
if (fs.existsSync("raw/p23")) for (const f of fs.readdirSync("raw/p23").filter((f) => f.endsWith(".json"))) {
  for (const [d, v] of Object.entries(JSON.parse(fs.readFileSync("raw/p23/" + f, "utf8")))) {
    const iss = (ISS[d] ||= { n: v.n, p: [] });
    for (const pg of v.p) { iss.p = iss.p.filter((x) => x.pg !== pg.pg); iss.p.push({ ...pg, src: "p23" }); }
    iss.p.sort((a, b) => a.pg - b.pg);
  }
}
const extra = fs.existsSync("raw/extra-pages.json") ? JSON.parse(fs.readFileSync("raw/extra-pages.json", "utf8")) : {};

const letters = (s) => s.replace(/[^A-Za-z]/g, "");
const capsRatio = (s) => { const L = letters(s); return L.length ? L.replace(/[^A-Z]/g, "").length / L.length : 0; };
const MAST = /[VY]\s?OICE\b|ALLIANCE (WEEKLY|WITNESS)|OFFICIAL ORGAN|MISSIONARY ALLIANCE|VOLUME \d|NUMBER \d|EDITOR:|FOUNDER|ENTERED AS|SUBSCRIPTION|POST OFFICE|CHRISTIAN PUBLICATIONS|THE EDITORIAL VOICE|FROM THE EDITOR/i;
const SIG_TOZER = /[-—–~.,]\s*A\s*\.\s*W\s*\.\s*T\s*\.?\s*$/;
const SIG_OTHER = /[-—–~]\s*(?:[A-Z]\s*\.\s*){2,3}$/;
const BYLINE_TOZER = /(^|\bBy\s+)(DR\.?\s*|REV\.?\s*)?A\s*\.\s*W\s*\.\s*TO[Zz]ER\b/;
const isHeading = (l, bodyH) => {
  const s = l[5].trim(), L = letters(s);
  if (L.length < 5 || s.length > 70 || MAST.test(s)) return false;
  if (capsRatio(s) > 0.85 && !/^[A-Z]\.\s/.test(s)) return true;
  return l[4] >= bodyH * 1.45 && L.length >= 3;
};
function bodyHeight(lines) { const h = lines.map((l) => l[4]).filter((h) => h > 6).sort((a, b) => a - b); return h[Math.floor(h.length / 2)] || 10; }
function orderLines(p) { return [...p.L].sort((a, b) => a[0] - b[0] || a[1] - b[1]); }

function paragraphs(lines) {
  const paras = []; let cur = "";
  lines.forEach((l, k) => {
    const prev = lines[k - 1], s = l[5].trim();
    if (!s || (s.length < 3 && !/[A-Za-z]{2}/.test(s))) return;
    const indent = l[2] > 6 && l[2] < 40, shortPrev = prev && prev[3] > 30 && prev[0] === l[0];
    if (cur && (indent || shortPrev)) { paras.push(cur); cur = ""; }
    if (cur.endsWith("-")) {
      const a = (cur.match(/(\S+)-$/) || ["", ""])[1], b = (s.match(/^(\S+)/) || ["", ""])[1];
      const joined = (a + b).replace(/[^A-Za-z’']/g, "");
      cur = known(joined) || !known(a.replace(/[^A-Za-z]/g, "")) ? cur.slice(0, -1) + s : cur + s;
    } else cur = cur ? cur + " " + s : s;
  });
  if (cur) paras.push(cur);
  return paras.map((p) => fixText(p)).filter((p) => letters(p).length > 3);
}
const titleCase = (t) => t.toLowerCase().replace(/(^|[\s“"(—-])([a-z])/g, (m, a, c) => a + c.toUpperCase())
  .replace(/\s(A|An|And|As|At|But|By|For|In|Into|Of|On|Or|The|To|With|From|Is|Are|Nor|Not)(?=\s)/g, (w) => w.toLowerCase())
  .replace(/’S\b|'S\b/g, (m) => m.toLowerCase()).replace(/\s+/g, " ").trim();
const cleanTitle = (t) => titleCase(fixText(t.replace(/[*•~_|]+/g, " ").replace(/\s+/g, " ")).replace(/[.,:;]+$/, ""));

const out = [], DROP = [];
const need = new Set();
const BYANY = /\bBy\s+(THE\s+)?(REV|DR|PROF|MRS|MR|MISS|BISHOP)\b\.?/i;
const tozerBy = (t, date) => BYLINE_TOZER.test(t) || (date >= EDITOR_FROM && /\bby the Editor\b/i.test(t));
function okText(paras) {
  const toks = paras.join(" ").split(/\s+/).map((w) => w.replace(/[^A-Za-z’']/g, "")).filter((w) => w.length > 2);
  return toks.filter((w) => known(w)).length / Math.max(1, toks.length);
}
const ADS = /Quotes from (Our Contemporaries|the Fathers)|Treasures Old|Local Conventions|Missionary (Lessons|Treasury)|Righteous|Flannelgraph|Bulletin|Cole and s|Pocket|Herd Bangles|Address Inquiries/i;
function tidyTitle(t) {
  t = t.replace(/^[^A-Za-z“"']+/, "").replace(/\s*[-—–·]+\s*(?:[IVX]+\s*[-—–]*)?$/, (m) => { const r = m.match(/([IVX]+)/); return r ? ` (Part ${r[1]})` : ""; });
  t = t.replace(/^(.*\S)\s+(The|A)$/, "$2 $1").replace(/\s+/g, " ").trim();
  return t;
}
function titleOK(t) {
  if (/\d|[#<>{}|\\]/.test(t)) return false; const w = t.split(/\s+/).filter((x) => /[A-Za-z]/.test(x)); return w.length && w.filter((x) => known(x.replace(/[^A-Za-z’']/g, "")) || /^[A-Z][a-z]+$/.test(x)).length / w.length >= 0.75 && letters(t).length >= 4; }
function cleanParas(e) {
  // drop captions, hymn lines and page furniture that share the column with the text
  e.p = e.p.filter((x, i) => {
    const w = x.split(/\s+/), r = okText([x]);
    if (w.length < 6 && !/[.!?”"]$/.test(x) && e.p.length > 4) return false;
    if (w.length < 25 && r < 0.75) return false;
    if (/^(Reprinted|Copyright|Printed in|Photo|\(?Continued)/i.test(x)) return false;
    return true;
  });
  // runs of very short paragraphs are hymn verses or column debris: keep clean ones as a quoted verse
  { const g = []; let run = [];
    const flush = () => { if (run.length >= 3) { if (okText(run) >= 0.9) g.push("> " + run.join("\n")); } else g.push(...run); run = []; };
    for (const x of e.p) { if (x.split(/\s+/).length < 14 && !x.startsWith("> ")) run.push(x); else { flush(); g.push(x); } }
    flush(); e.p = g; }
}
function push(e, date, pg) {
  e.p[0] = fixDropCap(e.p[0]);
  for (const o of OVR) if (o.d === date && (e.t + " " + e.p[0].slice(0, 120)).toLowerCase().includes(o.match.toLowerCase())) {
    if (o.find) e.p[0] = e.p[0].replace(new RegExp(o.find), o.replace);
    if (o.title) { e.t = o.title; e.fixed = true; }
  }
  e.p = e.p.map((x) => x.replace(/\s*\([^)]*(Photo|photo|Press)[^)]*\)\s*$/, "").trim()).filter(Boolean);
  e.t = tidyTitle(e.t);
  cleanParas(e);
  if (!e.p.length) return;
  if (ADS.test(e.t) || ADS.test(e.p[0].slice(0, 200))) { DROP.push(`${date} p${pg} ad :: ${e.t}`); return; }
  if (!e.fixed && !titleOK(e.t)) { const f = e.p[0].replace(/^[“"]/, "").split(/(?<=[.!?])\s/)[0].split(" ").slice(0, 7).join(" ").replace(/[,;:.]$/, ""); e.t = f + "…"; e.untitled = true; }
  const words = e.p.join(" ").split(/\s+/).length;
  if (words < (e.kind === "article" ? 250 : 120)) { DROP.push(`${date} p${pg} short ${words} :: ${e.t}`); return; }
  const q = okText(e.p);
  if (q < 0.9) { DROP.push(`${date} p${pg} ocr ${q.toFixed(2)} :: ${e.t}`); return; }
  out.push({ ...e, d: date, pg, words, q: +q.toFixed(3) });
}
for (const [date, iss] of Object.entries(ISS).sort()) {
  if (date >= "1964-01-01") continue;
  for (const p of iss.p) {
    const lines = orderLines(p).filter((l) => l[4] >= 4);
    const bodyH = bodyHeight(lines);
    const all = lines.map((l) => l[5]).join("\n");
    const topText = [...lines].sort((a, b) => a[1] - b[1]).slice(0, 8).map((l) => l[5]).join(" ");
    const edPage = /Editorial\s*(V|tl|\\)|From\s+the\s+Edit/i.test(all) || (p.src === "p23" && /[VY]\s*O\s*I\s*C\s*E|EDITORIAL|itorial|tloice|Editor.?s\s+Pen/i.test(topText));
    const edPage2 = edPage || (p.src === "p23" && p.pg === 2 && date >= "1958-01-01" && !/\bBy\s+(THE\s+)?(REV|DR|PROF|MRS|MR|MISS)\b/.test(all));
    const big = (l) => l[4] >= bodyH * 1.45 && letters(l[5]).length >= 2;
    const small = (l) => l[4] < bodyH * 0.75;
    // ---------- article page: a Tozer byline near a big title ----------
    const byLine = lines.find((l) => /^[^A-Za-z]*(By\s+)?(DR\.?\s*|REV\.?\s*)?A\s*\.\s*W\s*\.\s*TO[Zz]ER[^A-Za-z]*$/.test(l[5].trim()) || (date >= EDITOR_FROM && /^[^A-Za-z]*by the Editor[^A-Za-z]*$/i.test(l[5].trim())));
    if (!edPage2 && byLine) {
      const bigs = lines.filter(big);
      const titleLines = bigs.filter((x) => Math.abs(x[1] - (bigs[0] ? bigs[0][1] : 0)) < 110).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      let title = titleLines.map((x) => x[5]).join(" ").replace(BYANY, "").replace(/\s+/g, " ").trim();
      const body = lines.filter((l) => !titleLines.includes(l) && l !== byLine && !small(l) && !MAST.test(l[5]) && !/Continued (on|from) page/i.test(l[5]) && !/^[A-Z][A-Z .,'-]{2,}\s+\d{1,2},\s+19\d\d$/.test(l[5].trim()));
      const cont = all.match(/Continued on page (\d+)/i);
      if (cont) need.add(date + "|" + cont[1]);
      const next = iss.p.find((x) => x.pg === p.pg + 1);
      if (!cont) need.add(date + "|" + (p.pg + 1)); // articles usually run onto the next page
      const paras = paragraphs(body);
      if (paras.length) push({ t: cleanTitle(title || "Untitled"), kind: "article", signed: false, cont: cont ? +cont[1] : null, next: p.pg + 1, p: paras }, date, p.pg);
      continue;
    }
    // ---------- editorial page / other page: split at ALL-CAPS headings ----------
    const pieces = []; let cur = null;
    lines.forEach((l, i) => {
      if (big(l) || small(l)) return;
      if (isHeading(l, bodyH)) {
        if (cur && cur.body.length === 0 && cur.col === l[0] && Math.abs(cur.y - l[1]) < 60) { cur.title += " " + l[5]; return; }
        cur = { title: l[5], y: l[1], col: l[0], body: [], pre: lines.slice(Math.max(0, i - 3), i).map((x) => x[5]).join(" ") };
        pieces.push(cur);
      } else if (cur) cur.body.push(l);
    });
    for (const pc of pieces) {
      const body = pc.body.filter((l) => !MAST.test(l[5]) || l[5].length > 70);
      if (!body.length) continue;
      const lastText = body.map((l) => l[5]).join(" ").trim();
      const guest = /Guest Editorial/i.test(pc.pre) || /Guest Editorial/i.test(pc.title);
      const otherBy = BYANY.test(pc.title) || body.slice(0, 3).some((l) => /^By\s+(REV|DR|PROF|MRS|MR|MISS|BISHOP|[A-Z]\.|[A-Z]{2,})/.test(l[5].trim()) && !/TOZER|the Editor/i.test(l[5]));
      let kind = null, signed = false;
      if (SIG_TOZER.test(lastText)) { kind = "editorial"; signed = true; }
      else if (edPage2 && !guest && !otherBy && date >= EDITOR_FROM && !SIG_OTHER.test(lastText.slice(-40))) kind = "editorial";
      if (!kind) { DROP.push(`${date} p${p.pg} nokind ed=${edPage} guest=${guest} by=${otherBy} :: ${pc.title}`); continue; }
      const paras = paragraphs(body);
      if (!paras.length) continue;
      paras[paras.length - 1] = paras[paras.length - 1].replace(/\s*[-—–~.,]\s*A\s*\.\s*W\s*\.\s*T\s*\.?\s*$/, ".").replace(/([.!?”"])\.$/, "$1");
      push({ t: cleanTitle(pc.title), kind, signed, cont: null, p: paras }, date, p.pg);
    }
  }
}
// articles: append the following page(s) when we have them (from raw/extra-pages.json)
for (const e of out.filter((x) => x.kind === "article")) {
  for (const pgNo of [e.cont || e.next]) {
    const key = e.d + "|" + pgNo, raw = extra[key] || (ISS[e.d].p.find((x) => x.pg === pgNo) || {}).L;
    if (!raw) { e.partial = true; continue; }
    const lines = orderLines({ L: raw }).filter((l) => l[4] >= 4), bodyH = bodyHeight(lines);
    let start = 0;
    if (e.cont) { const first = e.t.toLowerCase().split(" ").find((w) => w.length > 3) || ""; start = lines.findIndex((l, i) => /Continued from page/i.test(l[5])); if (start < 0) { e.partial = true; continue; } start++; }
    const rest = [];
    for (const l of lines.slice(start)) { if (l[4] >= bodyH * 1.45 || /Continued from page/i.test(l[5]) || BYANY.test(l[5]) || (isHeading(l, bodyH) && rest.length > 3)) break; if (l[4] < bodyH * 0.75 || MAST.test(l[5])) continue; rest.push(l); }
    const more = paragraphs(rest);
    if (more.length) {
      // a paragraph broken across the page turn continues without an indent
      if (!/[.!?”"’)]$/.test(e.p[e.p.length - 1]) && /^[a-z]/.test(more[0])) e.p[e.p.length - 1] += " " + more.shift();
      else if (e.p[e.p.length - 1].endsWith("-")) e.p[e.p.length - 1] = e.p[e.p.length - 1].slice(0, -1) + more.shift();
      e.p.push(...more); e.merged = true; cleanParas(e); e.words = e.p.join(" ").split(/\s+/).length;
    }
  }
}
const keep = out;
const seen = new Set(), final = keep.filter((e) => { const k = e.d + "|" + e.t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.d.localeCompare(b.d) || a.pg - b.pg);
fs.writeFileSync("raw/need-pages.json", JSON.stringify([...need].filter((k) => { const [d, pg] = k.split("|"); return !extra[k] && (!ISS[d] || !ISS[d].p.some((x) => x.pg === +pg)); })));
const byYear = {};
for (const e of final) (byYear[e.d.slice(0, 4)] ||= []).push({ t: e.t, d: e.d, pg: e.pg, k: e.kind, s: e.signed ? 1 : 0, m: e.d >= "1958" ? "The Alliance Witness" : "The Alliance Weekly", p: e.p });
for (const f of fs.readdirSync("data")) if (/^editorials-\d{4}\.json$/.test(f)) fs.unlinkSync("data/" + f);
const lib = JSON.parse(fs.readFileSync("data/library.json", "utf8")).filter((w) => w.kind !== "editorials");
for (const [y, list] of Object.entries(byYear).sort()) {
  const id = "editorials-" + y;
  fs.writeFileSync(`data/${id}.json`, JSON.stringify({ id, title: "Editorials " + y, year: +y, chapters: list }));
  lib.push({ id, kind: "editorials", title: "Editorials, " + y, year: y });
}
fs.writeFileSync("data/library.json", JSON.stringify(lib, null, 1));
const stat = (k) => final.filter(k).length;
console.log(`pieces: ${final.length} (signed ${stat((e) => e.signed)}, unsigned editorials ${stat((e) => e.kind === "editorial" && !e.signed)}, articles ${stat((e) => e.kind === "article")}); waiting on continuation pages: ${out.length - keep.length}`);
console.log(Object.entries(byYear).map(([y, l]) => y + ":" + l.length).join(" "));
fs.writeFileSync("raw/dropped.txt", DROP.join("\n"));
fs.writeFileSync("raw/report.txt", final.map((e) => `${e.d} p${e.pg} ${e.kind}${e.signed ? "*" : ""}${e.partial ? "(partial)" : ""} q${e.q} w${e.words}  ${e.t}`).join("\n"));
