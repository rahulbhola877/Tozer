// Cleans the archive.org OCR of Paths to Power into data/paths-to-power.json
// Run: node tools/prep-ptp.mjs
import fs from "node:fs";
import { known, fixText2 as fixText } from "./ocr.mjs";

const L = fs.readFileSync("raw/paths-to-power.txt", "utf8").split("\n");
const CH = [[43, "Foreword"], [64, "1. Power in Action"], [388, "2. God’s Part and Man’s"], [673, "3. The Fruits of Obedience"], [985, "4. Miracles Follow the Plow"], [1272, "5. Doctrinal Hindrances"], [1623, "6. Through the Out-poured Spirit"], [1953, "7. Unity and Revival"]];
const END = L.findIndex((l, i) => i > 1953 && /^(BORN AFTER MIDNIGHT|Other books|OTHER BOOKS|Books by)/.test(l.trim()));
const endAt = END > 0 ? END : L.length;

// junk: page numbers, stray marks, short lines with no real words
const junk = (s) => {
  const t = s.trim();
  if (!t) return false;
  if (/^[\d\s|_—–\-.,:;'"‘’“”()*~©]+$/.test(t)) return true;
  const words = t.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
  const good = words.filter((w) => known(w.replace(/[^A-Za-z’']/g, "")));
  return t.length < 30 && good.length / Math.max(1, words.length) < 0.5;
};
const tidy = (s) => s.replace(/^[\s_|—–~]+(?=[A-Za-z“"‘'(])/, "").replace(/\s+[|—–_~>©]+\s*$/, "").replace(/\s*[|_]\s*$/, "").trim();

const chapters = [];
CH.forEach(([start, title], k) => {
  const stop = k + 1 < CH.length ? CH[k + 1][0] - 1 : endAt;
  const lines = L.slice(start + 1, stop).map((l) => (junk(l) ? "" : tidy(l)));
  // paragraphs: blank-line blocks, merged across page breaks when a sentence runs on
  const blocks = []; let cur = [];
  for (const l of lines) { if (!l) { if (cur.length) { blocks.push(cur); cur = []; } } else cur.push(l); }
  if (cur.length) blocks.push(cur);
  const paras = [];
  for (const b of blocks) {
    let t = "";
    for (const l of b) {
      if (t.endsWith("-")) { const a = (t.match(/(\S+)-$/) || ["", ""])[1], n = (l.match(/^(\S+)/) || ["", ""])[1]; t = known((a + n).replace(/[^A-Za-z’']/g, "")) ? t.slice(0, -1) + l : t + l; }
      else t = t ? t + " " + l : l;
    }
    if (t.replace(/[^A-Za-z]/g, "").length < 4) continue;
    const prev = paras[paras.length - 1];
    if (prev && !/[.!?:”"’)]$/.test(prev)) paras[paras.length - 1] = prev.endsWith("-") ? prev.slice(0, -1) + t : prev + " " + t;
    else paras.push(t);
  }
  const strip = (p) => p.split(" ").filter((w) => { const c = w.replace(/[^A-Za-z]/g, ""); if (!/[A-Za-z0-9]/.test(w)) return /^[—–“”"’‘(),.;:!?]+$/.test(w) && !/^[‘’'|]$/.test(w); return !(c.length <= 3 && !known(c) && !/^\(?\d/.test(w)); }).join(" ").replace(/([.?!”])\s+a\s+(?=[A-Z])/g, "$1 ").replace(new RegExp("^" + title.replace(/^\d+\. /, "").replace(/[’]/g, ".") + "\\s+"), "");
  const lead = (p) => { const w = p.split(" "); let i = 0; while (i < w.length - 1 && (!known(w[i].replace(/[^A-Za-z’']/g, "")) || /^\d+$/.test(w[i]) || (i < 8 && /^[a-z]/.test(w[i]) && w.slice(i + 1, i + 9).some((x) => !known(x.replace(/[^A-Za-z’']/g, "")))))) i++; return w.slice(i).join(" "); };
  const clean = paras.map((p, pi) => (pi === 0 ? lead : (x) => x)(strip(fixText(p)).replace(/\s*[|]\s*/g, " ").replace(/ {2,}/g, " "))).filter((p) => p.split(" ").length > 3);
  chapters.push({ t: title, p: clean });
});
// hand corrections for OCR damage at the scan's page edges
const FIX = [["V e present", "We present"], ["which y at least", "which may at least"], ["way to seter spiritual", "way to greater spiritual"], ["Or, as am title", "Or, as the title"], [/^: Doctrinal Hindrances /, ""], [/^.*?\b8 (?=God always works)/, ""]];
for (const c of chapters) c.p = c.p.map((x) => FIX.reduce((a, [f, t]) => a.replace(f, t), x));
fs.writeFileSync("data/paths-to-power.json", JSON.stringify({ id: "paths-to-power", title: "Paths to Power", year: 1940, chapters }));
console.log(chapters.map((c) => `${c.t}: ${c.p.length} paras, ${c.p.join(" ").split(" ").length} words`).join("\n"));
