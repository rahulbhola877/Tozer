// Builds the Tozer reader into ./dist
// Bible: World English Bible (`world-english-bible`) and King James Version (`kjv`), both public domain.
// Dictionary: Webster's Unabridged 1913 (`websters-english-dictionary`, public domain) and
//   WordNet 3.1 (`wordnet-db`, Princeton WordNet licence), plus Easton's Bible Dictionary (1897, public domain).
// Tozer: public-domain writings prepared in ./data (see README for sources and rights).
import fs from "node:fs";
import path from "node:path";

const OUT = "dist";
const W = (p, s) => { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.writeFileSync(path.join(OUT, p), s); };
const J = (o) => JSON.stringify(o);
const req = (p) => { for (const b of ["node_modules", "../node_modules"]) { const f = path.join(b, p); if (fs.existsSync(f)) return f; } throw new Error("missing " + p); };
const clean = (s) => s.replace(/\s+/g, " ").trim();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(".")) if (/^(index\.html|manifest\.webmanifest|icon[\w-]*\.(svg|png))$/.test(f)) fs.copyFileSync(f, path.join(OUT, f));

/* ---------- Bible: WEB ---------- */
const BOOKS = [["GEN","genesis","Genesis"],["EXO","exodus","Exodus"],["LEV","leviticus","Leviticus"],["NUM","numbers","Numbers"],["DEU","deuteronomy","Deuteronomy"],["JOS","joshua","Joshua"],["JDG","judges","Judges"],["RUT","ruth","Ruth"],["1SA","1samuel","1 Samuel"],["2SA","2samuel","2 Samuel"],["1KI","1kings","1 Kings"],["2KI","2kings","2 Kings"],["1CH","1chronicles","1 Chronicles"],["2CH","2chronicles","2 Chronicles"],["EZR","ezra","Ezra"],["NEH","nehemiah","Nehemiah"],["EST","esther","Esther"],["JOB","job","Job"],["PSA","psalms","Psalms"],["PRO","proverbs","Proverbs"],["ECC","ecclesiastes","Ecclesiastes"],["SNG","songofsolomon","Song of Solomon"],["ISA","isaiah","Isaiah"],["JER","jeremiah","Jeremiah"],["LAM","lamentations","Lamentations"],["EZK","ezekiel","Ezekiel"],["DAN","daniel","Daniel"],["HOS","hosea","Hosea"],["JOL","joel","Joel"],["AMO","amos","Amos"],["OBA","obadiah","Obadiah"],["JON","jonah","Jonah"],["MIC","micah","Micah"],["NAM","nahum","Nahum"],["HAB","habakkuk","Habakkuk"],["ZEP","zephaniah","Zephaniah"],["HAG","haggai","Haggai"],["ZEC","zechariah","Zechariah"],["MAL","malachi","Malachi"],["MAT","matthew","Matthew"],["MRK","mark","Mark"],["LUK","luke","Luke"],["JHN","john","John"],["ACT","acts","Acts"],["ROM","romans","Romans"],["1CO","1corinthians","1 Corinthians"],["2CO","2corinthians","2 Corinthians"],["GAL","galatians","Galatians"],["EPH","ephesians","Ephesians"],["PHP","philippians","Philippians"],["COL","colossians","Colossians"],["1TH","1thessalonians","1 Thessalonians"],["2TH","2thessalonians","2 Thessalonians"],["1TI","1timothy","1 Timothy"],["2TI","2timothy","2 Timothy"],["TIT","titus","Titus"],["PHM","philemon","Philemon"],["HEB","hebrews","Hebrews"],["JAS","james","James"],["1PE","1peter","1 Peter"],["2PE","2peter","2 Peter"],["1JN","1john","1 John"],["2JN","2john","2 John"],["3JN","3john","3 John"],["JUD","jude","Jude"],["REV","revelation","Revelation"]];
let verses = 0;
for (const [code, file] of BOOKS) {
  const d = JSON.parse(fs.readFileSync(req(`world-english-bible/json/${file}.json`), "utf8"));
  const ch = new Map(), para = new Map(), hdr = {};
  let pendingBreak = true, pendingHdr = null;
  for (const x of d) {
    const t = x.type;
    if (t === "paragraph start" || t === "stanza start" || t === "break") { pendingBreak = true; continue; }
    if (t === "header") { pendingHdr = clean(x.value); continue; }
    if (x.value == null || x.chapterNumber == null) continue;
    const c = x.chapterNumber, v = x.verseNumber;
    if (!ch.has(c)) ch.set(c, new Map());
    const C = ch.get(c);
    if (pendingHdr) { hdr[c] = pendingHdr; pendingHdr = null; }
    if (!C.has(v)) { C.set(v, { parts: [], poet: t === "line text" }); if (pendingBreak) { if (!para.has(c)) para.set(c, []); para.get(c).push(v); } }
    pendingBreak = false;
    C.get(v).parts.push(clean(x.value));
  }
  const chapters = [], paras = [], poet = [];
  for (const c of [...ch.keys()].sort((a, b) => a - b)) {
    const C = ch.get(c), mx = Math.max(...C.keys()), vs = [];
    let np = 0;
    for (let v = 1; v <= mx; v++) { const e = C.get(v); if (!e) { vs.push(""); continue; } if (e.poet) np++; vs.push(e.parts.join(e.poet ? "\n" : " ")); }
    chapters.push(vs); paras.push(para.get(c) || [1]); poet.push(np > C.size / 2 ? 1 : 0); verses += vs.length;
  }
  W(`bible/web/${code}.json`, J({ c: chapters, p: paras, poet, h: hdr }));
}
console.log("WEB:", verses, "verses");

/* ---------- Bible: KJV (1769 text) ---------- */
{
  const V = JSON.parse(fs.readFileSync(req("kjv/json/verses-1769.json"), "utf8"));
  const byBook = new Map();
  for (const [ref, text] of Object.entries(V)) {
    const m = ref.match(/^(.+) (\d+):(\d+)$/); if (!m) continue;
    if (!byBook.has(m[1])) byBook.set(m[1], []);
    byBook.get(m[1]).push([+m[2], +m[3], text]);
  }
  const alias = { "Psalms": ["Psalms", "Psalm"], "Song of Solomon": ["Song of Solomon", "Solomon's Song"], "Revelation": ["Revelation", "Revelation of John"] };
  let n = 0;
  for (const [code, , name] of BOOKS) {
    const key = (alias[name] || [name]).find((k) => byBook.has(k));
    if (!key) { console.warn("KJV missing", name); continue; }
    const c = [], p = [];
    for (const [ch, v, t] of byBook.get(key)) {
      (c[ch - 1] ||= [])[v - 1] = t.replace(/^#\s*/, "").replace(/\s+/g, " ").trim();
      if (v === 1 || /^#/.test(t)) (p[ch - 1] ||= []).push(v);
      n++;
    }
    for (let i = 0; i < c.length; i++) { c[i] = Array.from(c[i] || [], (x) => x || ""); p[i] ||= [1]; }
    W(`bible/kjv/${code}.json`, J({ c, p }));
  }
  console.log("KJV:", n, "verses");
}
W("bible/books.json", J(BOOKS.map(([c, , n]) => [c, n])));

/* ---------- Dictionary: Webster 1913 + WordNet, chunked by word ---------- */
{
  const web = JSON.parse(fs.readFileSync(req("websters-english-dictionary/dictionary.json"), "utf8"));
  const wn = new Map();
  const dir = path.dirname(req("wordnet-db/dict/data.noun"));
  for (const pos of ["noun", "verb", "adj", "adv"]) {
    for (const l of fs.readFileSync(path.join(dir, "data." + pos), "utf8").split("\n")) {
      if (!l || l[0] === " ") continue;
      const bar = l.indexOf(" | "), head = l.slice(0, bar < 0 ? l.length : bar).split(" "), gloss = bar < 0 ? "" : l.slice(bar + 3).trim();
      const wc = parseInt(head[3], 16), ws = [];
      for (let i = 0; i < wc; i++) ws.push(head[4 + i * 2].replace(/\(.*\)$/, "").replace(/_/g, " "));
      for (const w of ws) {
        const k = w.toLowerCase(); if (!/^[a-z][a-z'-]*$/.test(k)) continue;
        if (!wn.has(k)) wn.set(k, []);
        const arr = wn.get(k); if (arr.length < 8) arr.push([pos[0], gloss, ws.filter((x) => x !== w && !x.includes(" ")).slice(0, 4)]);
      }
    }
  }
  const all = new Map();
  for (const [k, v] of Object.entries(web)) { const w = k.toLowerCase(); if (/^[a-z][a-z'-]*$/.test(w)) all.set(w, { w: v.replace(/\s+/g, " ").trim() }); }
  for (const [k, v] of wn) { const e = all.get(k) || {}; e.n = v; all.set(k, e); }
  const words = [...all.keys()].sort();
  const idx = []; let cur = {}, size = 0, first = null, files = 0;
  const flush = () => { if (!first) return; W(`dict/${files}.json`, J(cur)); idx.push(first); files++; cur = {}; size = 0; first = null; };
  for (const w of words) { const e = all.get(w); if (!first) first = w; cur[w] = e; size += w.length + JSON.stringify(e).length; if (size > 450000) flush(); }
  flush();
  W("dict/index.json", J(idx));
  console.log("Dictionary:", words.length, "words in", files, "files");
}

/* ---------- Easton's Bible Dictionary ---------- */
{
  const base = "https://raw.githubusercontent.com/neuu-org/bible-dictionary-dataset/main/data/02_sources/easton/";
  const get = async (u) => { for (let i = 0; i < 4; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch (e) {} await new Promise((r) => setTimeout(r, 800 * (i + 1))); } throw new Error("fetch failed " + u); };
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const got = await Promise.all(letters.map((l) => get(base + l + ".json").catch(() => ({}))));
  const out = {};
  got.forEach((d) => { for (const e of Object.values(d)) { const t = (e.definitions || []).filter((x) => x.source === "EAS").map((x) => x.text).join("\n\n"); if (t) out[e.name.toLowerCase()] = [e.name, t]; } });
  const byL = {};
  for (const [k, v] of Object.entries(out)) { const l = /^[a-z]/.test(k) ? k[0] : "_"; (byL[l] ||= {})[k] = v; }
  for (const [l, d] of Object.entries(byL)) W(`easton/${l}.json`, J(d));
  console.log("Easton:", Object.keys(out).length, "entries");
}

/* ---------- Tozer ---------- */
{
  const lib = JSON.parse(fs.readFileSync("data/library.json", "utf8"));
  const cat = [];
  for (const w of lib) {
    const f = `data/${w.id}.json`; if (!fs.existsSync(f)) { console.warn("missing", f); continue; }
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    W(`texts/${w.id}.json`, J(d));
    cat.push({ ...w, n: d.chapters.length, words: d.chapters.reduce((a, c) => a + c.p.join(" ").split(/\s+/).length, 0), toc: d.chapters.map((c) => [c.t, c.b || "", c.d || ""]) });
  }
  W("texts/catalog.json", J(cat));
  console.log("Tozer:", cat.map((c) => `${c.id} (${c.n})`).join(", "));
}
console.log("Done.");
