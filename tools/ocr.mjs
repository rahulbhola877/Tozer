import fs from "node:fs";
import path from "node:path";
/* ---- a word list for de-hyphenation and OCR repair ---- */
const WORDS = new Set();
for (const f of fs.readdirSync("dist/dict")) if (/^\d+\.json$/.test(f)) for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join("dist/dict", f), "utf8")))) WORDS.add(k);
const EXTRA = "tozer alliance christ christ's god's jesus' saviour saviour's honour colour favour labour neighbour behaviour today tonight fundamentalism fundamentalist fundamentalists evangelicalism evangelicals evangelical pentecost pentecostal modernism modernist modernists churchianity worshiper worshipers worshipped worshipping unregenerate unsaid selfhood godhead otherworldly christlike christlikeness hymnbook bible bibles scriptures scriptural".split(" ");
EXTRA.forEach((w) => WORDS.add(w));
const inflect = (w) => {
  if (WORDS.has(w)) return true;
  for (const [a, b] of [["s", ""], ["es", ""], ["ies", "y"], ["ed", ""], ["ed", "e"], ["d", ""], ["ing", ""], ["ing", "e"], ["ly", ""], ["er", ""], ["est", ""], ["ness", ""], ["'s", ""], ["’s", ""], ["eth", ""], ["eth", "e"]])
    if (w.endsWith(a) && w.length - a.length >= 4 && WORDS.has(w.slice(0, -a.length) + b)) return true;
  return false;
};
export const known = (w) => { const l = w.toLowerCase().replace(/[’]/g, "'"); return l.length < 2 || /\d/.test(l) || inflect(l); };

/* OCR repair: try common confusions on unknown words only */
const SWAPS = [[/^Il/g, "H"], [/ij/g, "n"], [/ll/g, "u"], [/iii/g, "in"], [/ii/g, "h"], [/ll/g, "h"], [/lI/g, "h"], [/1\./g, "L"], [/\(\)/g, "o"], [/1/g, "i"], [/fl/g, "ff"], [/v/g, "y"], [/rn/g, "m"], [/ii/g, "u"], [/li/g, "h"], [/1/g, "l"], [/0/g, "o"], [/c/g, "e"], [/e/g, "c"], [/n/g, "u"], [/u/g, "n"], [/tl/g, "d"], [/cl/g, "d"], [/f/g, "t"], [/I/g, "l"], [/\bl\b/g, "I"], [/J/g, "I"], [/m/g, "in"], [/in/g, "m"], [/h/g, "b"], [/b/g, "h"], [/ri/g, "n"], [/0/g, "O"], [/5/g, "S"], [/8/g, "S"]];
export function repair(tok) {
  const m = tok.match(/^([^A-Za-z0-9]*)([A-Za-z0-9’']+)([^A-Za-z0-9]*)$/); if (!m) return tok;
  const [, pre, w, post] = m;
  if (known(w) || /^[A-Z]{2,}$/.test(w) || /^\d+$/.test(w)) return tok;
  const cands = new Set();
  for (const [re, to] of SWAPS) { const all = [...w.matchAll(new RegExp(re.source, "g"))]; for (const a of all) cands.add(w.slice(0, a.index) + to + w.slice(a.index + a[0].length)); cands.add(w.replace(re, to)); }
  for (const c of cands) if (c !== w && known(c)) return pre + (w[0] === w[0].toUpperCase() ? c[0].toUpperCase() + c.slice(1) : c) + post;
  return tok;
}
export const fixText = (s) => s.replace(/\(\)(?=[a-z])/g, "o").replace(/\b1\.(?=[a-z])/g, "L").split(/(\s+)/).map((t) => (/\s/.test(t) ? t : repair(t))).join("")
  .replace(/\s+([,.;:!?])/g, "$1").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
  .replace(/"\s+([^"]*?)\s+"/g, "“$1”").replace(/--/g, "—").replace(/\s*—\s*/g, "—")
  .replace(/ ,/g, ",").replace(/\s{2,}/g, " ").trim();


/* ---- frequency-based fallback: nearest common word within a small edit distance ---- */
const FREQ = new Map();
{
  const add = (t) => { for (const w of t.toLowerCase().match(/[a-z]+/g) || []) FREQ.set(w, (FREQ.get(w) || 0) + 1); };
  for (const v of ["kjv", "web"]) for (const f of fs.readdirSync(`dist/bible/${v}`)) { const d = JSON.parse(fs.readFileSync(`dist/bible/${v}/${f}`, "utf8")); d.c.forEach((c) => c.forEach(add)); }
  for (const f of ["data/pursuit-of-god.json"]) if (fs.existsSync(f)) JSON.parse(fs.readFileSync(f, "utf8")).chapters.forEach((c) => c.p.forEach(add));
  for (const [w, n] of [...FREQ]) if (n < 3 || !WORDS.has(w)) FREQ.delete(w);
}
const BYLEN = new Map();
for (const w of FREQ.keys()) { const k = w.length; if (!BYLEN.has(k)) BYLEN.set(k, []); BYLEN.get(k).push(w); }
function dist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) { let best = 1e9; for (let j = 1; j <= b.length; j++) { d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, d[i][j]); } if (best > max) return max + 1; }
  return d[a.length][b.length];
}
export function nearest(w) {
  const l = w.toLowerCase(); if (l.length < 5 || known(l)) return null;
  const max = l.length >= 6 ? 2 : 1;
  let best = null, bd = 9, bf = 0;
  for (let k = l.length - max; k <= l.length + max; k++) for (const c of BYLEN.get(k) || []) {
    const dd = dist(l, c, max); if (dd > max) continue;
    const f = FREQ.get(c); if (dd === 2 && f < 40) continue;
    if (dd < bd || (dd === bd && f > bf)) { best = c; bd = dd; bf = f; }
  }
  if (!best) return null;
  return w[0] === w[0].toUpperCase() ? best[0].toUpperCase() + best.slice(1) : best;
}
const SMALL = new Set("to in on at of it is be by he we me up so no do go an as or us my if am".split(" "));
function joinSplits(s) {
  const t = s.split(" "); const out = [];
  const bare = (x) => x.replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z’']+$/, "");
  const f = (w) => (typeof FREQ !== "undefined" && FREQ.get(w)) || 0;
  for (let i = 0; i < t.length; i++) {
    let cur = t[i];
    for (;;) {
      if (i + 1 >= t.length) break;
      const a = cur.replace(/^[^A-Za-z]+/, ""), b = bare(t[i + 1]), c = i + 2 < t.length ? bare(t[i + 2]) : "";
      if (!/^[A-Za-z’']+$/.test(a) || !/^[a-z’']+$/.test(b) || /[^A-Za-z’']$/.test(cur)) break;
      const al = a.toLowerCase(), bl = b.toLowerCase(), j = al + bl;
      if (c && /^[a-z]+$/.test(c) && !known(j) && known(j + c) && (b.length <= 3 || c.length <= 3)) { cur = cur + t[i + 1] + t[i + 2]; i += 2; continue; }
      if (c && /^[a-z]+$/.test(c) && b.length <= 2 && known(bl + c) && known(al) && f(bl + c) > f(j)) break;
      const ok = known(j) && (!known(al) || !known(bl) || b.length === 1 || (b.length === 2 && !SMALL.has(bl)) || (f(j) >= 20 && f(al) < 5 && f(bl) < 5));
      if (ok) { cur = cur + t[i + 1]; i++; } else break;
    }
    out.push(cur);
  }
  return out.join(" ");
}
export const fixText2 = (s) => fixText(joinSplits(s.replace(/\biii\b/g, "in"))).split(/(\s+)/).map((t) => {
  if (/\s/.test(t)) return t;
  const m = t.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z,.]*[A-Za-z])([^A-Za-z]*)$/); if (!m) return t;
  const core = m[2].replace(/[,.]/g, ""); if (known(core)) return t;
  const n = nearest(core); return n ? m[1] + n + m[3] : t;
}).join("");
export const _dbg = () => ({ freq: FREQ.size, lens: [...BYLEN.keys()].length, your: FREQ.get("your") });

/* ---- drop caps: the first letter of an article is often an ornament read as "~" or lost ---- */
const PREF = "TWIASOBMNHPDCF";
export function fixDropCap(p) {
  const junked = /^[~*]/.test(p);
  const s = p.replace(/^[~*.,\-\s'"‘“]{1,4}(?=[A-Za-z])/, (m) => (/["“‘]/.test(m) ? m : ""));
  const m = s.match(/^([A-Za-z]{1,3})(\s+)([A-Za-z]+)/); if (!m) return s;
  const first = m[1];
  if (!junked) { if (known(first) && first.length > 1 && !/^[A-Z]{1,2}$/.test(first)) return s; if (known(first.toLowerCase()) && first.length > 2) return s; }
  const cands = [];
  for (const L of PREF) { const w = (L + first).toLowerCase(); if (known(w) && w.length >= 2 && (w.length > 2 || SMALL.has(w) || 'we he me be'.includes(w)) && ((typeof FREQ !== 'undefined' && FREQ.get(w)) || 0) >= 30) cands.push([w, (typeof FREQ !== "undefined" && FREQ.get(w)) || 0, PREF.indexOf(L)]); }
  if (!cands.length) return s;
  cands.sort((a, b) => a[2] - b[2] || b[1] - a[1]);
  const w = cands[0][0], keepCase = first === first.toUpperCase() && m[3] === m[3].toUpperCase();
  return (keepCase ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)) + s.slice(first.length);
}
