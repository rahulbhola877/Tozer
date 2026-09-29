// Turns the magazine harvest (raw OCR word boxes from The Alliance Weekly / Witness scans)
// into data/editorials-YYYY.json: Tozer's signed editorials ("—A. W. T.").
// Run: node tools/prep-editorials.mjs raw/harvest.json
import fs from "node:fs";
import path from "node:path";

const RAW = process.argv[2] || "raw/harvest.json";
const H = JSON.parse(fs.readFileSync(RAW, "utf8"));

/* ---- a word list for de-hyphenation and OCR repair ---- */
const WORDS = new Set();
for (const f of fs.readdirSync("dist/dict")) if (/^\d+\.json$/.test(f)) for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join("dist/dict", f), "utf8")))) WORDS.add(k);
const EXTRA = "tozer alliance christ christ's god's jesus' saviour saviour's honour colour favour labour neighbour behaviour today tonight fundamentalism fundamentalist fundamentalists evangelicalism evangelicals evangelical pentecost pentecostal modernism modernist modernists churchianity worshiper worshipers worshipped worshipping unregenerate unsaid selfhood godhead otherworldly christlike christlikeness hymnbook bible bibles scriptures scriptural".split(" ");
EXTRA.forEach((w) => WORDS.add(w));
const inflect = (w) => {
  if (WORDS.has(w)) return true;
  for (const [a, b] of [["s", ""], ["es", ""], ["ies", "y"], ["ed", ""], ["ed", "e"], ["d", ""], ["ing", ""], ["ing", "e"], ["ly", ""], ["er", ""], ["est", ""], ["ness", ""], ["'s", ""], ["’s", ""], ["eth", ""], ["eth", "e"]])
    if (w.endsWith(a) && WORDS.has(w.slice(0, -a.length) + b)) return true;
  return false;
};
const known = (w) => { const l = w.toLowerCase().replace(/[’]/g, "'"); return l.length < 2 || /\d/.test(l) || inflect(l); };

/* OCR repair: try common confusions on unknown words only */
const SWAPS = [[/v/g, "y"], [/rn/g, "m"], [/ii/g, "u"], [/li/g, "h"], [/1/g, "l"], [/0/g, "o"], [/c/g, "e"], [/e/g, "c"], [/n/g, "u"], [/u/g, "n"], [/tl/g, "d"], [/cl/g, "d"], [/f/g, "t"], [/I/g, "l"], [/\bl\b/g, "I"], [/J/g, "I"], [/m/g, "in"], [/in/g, "m"], [/h/g, "b"], [/b/g, "h"], [/ri/g, "n"], [/0/g, "O"], [/5/g, "S"], [/8/g, "S"]];
function repair(tok) {
  const m = tok.match(/^([^A-Za-z0-9]*)([A-Za-z0-9’']+)([^A-Za-z0-9]*)$/); if (!m) return tok;
  const [, pre, w, post] = m;
  if (known(w) || /^[A-Z]{2,}$/.test(w) || /^\d+$/.test(w)) return tok;
  const cands = new Set();
  for (const [re, to] of SWAPS) { const all = [...w.matchAll(new RegExp(re.source, "g"))]; for (const a of all) cands.add(w.slice(0, a.index) + to + w.slice(a.index + a[0].length)); cands.add(w.replace(re, to)); }
  for (const c of cands) if (c !== w && known(c)) return pre + (w[0] === w[0].toUpperCase() ? c[0].toUpperCase() + c.slice(1) : c) + post;
  return tok;
}
const fixText = (s) => s.split(/(\s+)/).map((t) => (/\s/.test(t) ? t : repair(t))).join("")
  .replace(/\s+([,.;:!?])/g, "$1").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
  .replace(/"\s+([^"]*?)\s+"/g, "“$1”").replace(/--/g, "—").replace(/\s*—\s*/g, "—")
  .replace(/ ,/g, ",").replace(/\s{2,}/g, " ").trim();

/* ---- layout ---- */
function columns(pg) {
  const W = pg.W, cov = new Float32Array(Math.ceil(W) + 2);
  for (const [x, , , w] of pg.it) for (let i = Math.max(0, Math.floor(x)); i < Math.min(cov.length, Math.ceil(x + (w || 4))); i++) cov[i]++;
  const valley = (c) => { let best = 1e9, at = c; for (let i = Math.round(c - 22); i <= Math.round(c + 22); i++) if (cov[i] < best) { best = cov[i]; at = i; } return [best, at]; };
  const [v2, a2] = valley(W / 2), [v3a, b1] = valley(W / 3), [v3b, b2] = valley((2 * W) / 3);
  return v3a + v3b < v2 * 1.6 && Math.max(v3a, v3b) <= v2 + 2 ? [b1, b2] : [a2];
}
function linesOf(pg) {
  const cuts = columns(pg), cols = cuts.length + 1, buckets = [...Array(cols)].map(() => []);
  for (const it of pg.it) { const [x, y, h, w, s] = it; if (!s || !s.trim()) continue; let c = 0; while (c < cuts.length && x + (w || 0) / 2 > cuts[c]) c++; buckets[c].push({ x, y, h, w: w || 0, s }); }
  const out = [];
  buckets.forEach((b, ci) => {
    b.sort((a, c) => a.y - c.y);
    const ls = [];
    for (const it of b) { const l = ls[ls.length - 1]; if (l && Math.abs(l.y - it.y) < Math.max(3, it.h * 0.45)) l.w.push(it); else ls.push({ y: it.y, w: [it] }); }
    const left = ci ? cuts[ci - 1] : 0, right = ci < cuts.length ? cuts[ci] : pg.W;
    const xs = ls.map((l) => Math.min(...l.w.map((z) => z.x))).sort((a, c) => a - c), colL = xs[Math.floor(xs.length * 0.15)] ?? left;
    const xe = ls.map((l) => Math.max(...l.w.map((z) => z.x + z.w))).sort((a, c) => a - c), colR = xe[Math.floor(xe.length * 0.85)] ?? right;
    for (const l of ls) {
      l.w.sort((a, c) => a.x - c.x);
      const s = l.w.map((z) => z.s).join(" ").replace(/\s+/g, " ").trim();
      out.push({ col: ci, y: l.y, x0: l.w[0].x, x1: Math.max(...l.w.map((z) => z.x + z.w)), h: Math.max(...l.w.map((z) => z.h)), s, colL, colR });
    }
  });
  return out;
}
const letters = (s) => s.replace(/[^A-Za-z]/g, "");
const isCaps = (s) => { const L = letters(s); return L.length >= 5 && L.replace(/[^A-Z]/g, "").length / L.length > 0.85 && s.length < 80; };
const SIG = /[-—–~.]\s*A\s*\.\s*W\s*\.\s*T\s*\.?\s*$/;
const MAST = /ALLIANCE (WEEKLY|WITNESS)|OFFICIAL ORGAN|EDITOR|SECOND.CLASS|ENTERED AS|SUBSCRIPTION/i;

function editorialsOnPage(date, pg) {
  const L = linesOf(pg);
  const res = [];
  for (let i = 0; i < L.length; i++) {
    if (!SIG.test(L[i].s)) continue;
    // walk back to the nearest heading in the reading stream
    let j = i; while (j > 0 && !(isCaps(L[j].s) && !MAST.test(L[j].s)) ) j--;
    if (!isCaps(L[j].s)) continue;
    let t0 = j; while (t0 > 0 && isCaps(L[t0 - 1].s) && !MAST.test(L[t0 - 1].s) && Math.abs(L[t0 - 1].y - L[t0].y) < 40) t0--;
    const title = L.slice(t0, j + 1).map((l) => l.s).join(" ");
    const body = L.slice(j + 1, i + 1).filter((l) => !MAST.test(l.s) || l.s.length > 60).filter((l) => !/^\d{2,4}$/.test(l.s.trim()) && letters(l.s).length > 1);
    // paragraphs
    const paras = []; let cur = "";
    body.forEach((l, k) => {
      const prev = body[k - 1];
      const indent = l.x0 - l.colL > 6, colBreak = prev && prev.col !== l.col, shortPrev = prev && !colBreak && prev.x1 < prev.colR - 30;
      if (cur && (indent || shortPrev) && !(colBreak && !indent)) { paras.push(cur); cur = ""; }
      let s = l.s;
      if (cur.endsWith("-")) {
        const a = cur.match(/(\S+)-$/)[1], b = (s.match(/^(\S+)/) || ["", ""])[1], j2 = (a + b).replace(/[^A-Za-z’']/g, "");
        cur = known(j2) || !known(a.replace(/[^A-Za-z]/g, "")) ? cur.slice(0, -1) + s : cur + s;
      } else cur = cur ? cur + " " + s : s;
    });
    if (cur) paras.push(cur);
    const clean = paras.map((p) => fixText(p)).filter((p) => letters(p).length > 3);
    if (!clean.length) continue;
    clean[clean.length - 1] = clean[clean.length - 1].replace(/\s*[-—–~.]\s*A\s*\.\s*W\s*\.\s*T\s*\.?\s*$/, "");
    const words = clean.join(" ").split(/\s+/).length;
    if (words < 80) continue;
    const t = fixText(title).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(A|An|And|As|At|But|By|For|In|Into|Of|On|Or|The|To|With|From|Is|Are)\b/g, (w, _, o) => (o ? w.toLowerCase() : w)).replace(/’S\b|'S\b/g, (m) => m.toLowerCase());
    res.push({ t: t.replace(/\s+/g, " ").trim(), d: date, pg: pg.pg, p: clean, words });
  }
  return res;
}

const all = [];
for (const [date, rec] of Object.entries(H)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= "1964-01-01") continue;
  for (const pg of rec.keep || []) {
    pg.it = pg.it.map((a) => a); // [x,y,h,w,s]
    for (const e of editorialsOnPage(date, pg)) all.push(e);
  }
}
// de-duplicate (same title same issue)
const seen = new Set(), out = all.filter((e) => { const k = e.d + e.t; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.d.localeCompare(b.d));
const byYear = {};
for (const e of out) (byYear[e.d.slice(0, 4)] ||= []).push({ t: e.t, d: e.d, pg: e.pg, m: +e.d.slice(0, 4) >= 1958 ? "The Alliance Witness" : "The Alliance Weekly", p: e.p });
const lib = JSON.parse(fs.readFileSync("data/library.json", "utf8")).filter((w) => w.kind !== "editorials");
for (const [y, list] of Object.entries(byYear)) {
  const id = "editorials-" + y;
  fs.writeFileSync(`data/${id}.json`, JSON.stringify({ id, title: "Editorials " + y, year: +y, chapters: list }));
  lib.push({ id, kind: "editorials", title: "Editorials, " + y, year: y });
}
fs.writeFileSync("data/library.json", JSON.stringify(lib, null, 1));
console.log("editorials:", out.length, Object.entries(byYear).map(([y, l]) => y + ":" + l.length).join(" "));
