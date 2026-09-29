"use strict";
/* ============ basics ============ */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const L = {
  get(k, d) { try { const v = localStorage.getItem("tz-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("tz-" + k, JSON.stringify(v)); } catch (e) {} },
};
const cache = new Map();
function getJSON(p) {
  if (!cache.has(p)) cache.set(p, fetch(p).then((r) => { if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }).catch((e) => { cache.delete(p); throw e; }));
  return cache.get(p);
}
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmtDate = (d) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
const shortDate = (d) => { const [, m, dd] = d.split("-").map(Number); return `${dd} ${MONTHS[m - 1].slice(0, 3)}`; };
async function copy(text) { try { await navigator.clipboard.writeText(text); toast("Copied"); } catch (e) { toast("Copy isn't allowed here. Select the text instead."); } }

/* optional Claude (only inside a Claude artifact that grants it) */
let SAMPLE = null;
(async () => { try { if (window.claude && window.claude.use) SAMPLE = await window.claude.use("sample"); } catch (e) { SAMPLE = null; } })();

/* ============ state ============ */
const S = { view: "today", lib: { open: null, year: null, q: "" }, rd: null, bible: { ver: L.get("ver", "kjv"), book: null, ch: null, pick: null }, search: { q: "", scope: "tozer", res: null, busy: false } };
let CAT = null, BOOKS = null;
const bookName = (c, one) => (c === "PSA" && one ? "Psalm" : BOOKS ? (BOOKS.find((b) => b[0] === c) || [c, c])[1] : c);

/* ============ theme + text size ============ */
const THEME_LBL = { auto: "Auto", light: "Light", dark: "Dark" };
function applyTheme(t) {
  const r = document.documentElement;
  if (t === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t);
  $("#themeLbl").textContent = THEME_LBL[t];
}
applyTheme(L.get("theme", "auto"));
$("#themeBtn").onclick = () => { const o = ["auto", "light", "dark"], n = o[(o.indexOf(L.get("theme", "auto")) + 1) % 3]; L.set("theme", n); applyTheme(n); };
function applySize() { document.documentElement.style.setProperty("--rs", L.get("size", 1)); }
applySize();
function cycleSize() { const s = [1, 1.1, 1.22, 0.92], n = s[(s.indexOf(L.get("size", 1)) + 1) % s.length]; L.set("size", n); applySize(); toast("Text size " + Math.round(n * 100) + "%"); }

/* ============ tabs ============ */
$$(".tab").forEach((b) => (b.onclick = () => { if (b.dataset.v === S.view && S.view === "library") { S.rd = null; S.lib.open = null; } if (b.dataset.v === S.view && S.view === "bible") { S.bible.pick = null; S.bible.ch = null; } show(b.dataset.v); }));
function show(v) {
  stopSpeech();
  S.view = v;
  $$(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === v)));
  render(); scrollTo(0, 0);
}
function render() {
  ({ today: vToday, library: vLibrary, bible: vBible, search: vSearch, words: vWords })[S.view]();
}

/* ============ catalog ============ */
async function catalog() {
  if (!CAT) CAT = await getJSON("texts/catalog.json");
  return CAT;
}
const isEd = (w) => w.kind === "editorials";
function progress() { return L.get("prog", {}); }
function markRead(id, ch) { const p = progress(); const s = (p[id] ||= { done: [] }); if (!s.done.includes(ch)) s.done.push(ch); s.at = ch; s.t = Date.now(); L.set("prog", p); L.set("last", { id, ch }); }

/* ============ TODAY ============ */
const WOD = ["prevenient","ineffable","adoration","numinous","contrition","immanence","transcendence","abasement","sovereignty","holiness","reverence","effulgence","meekness","sanctify","pilgrim","communion","omnipresence","consecration","mystic","vestibule","veil","awe","righteous","wonder","tabernacle","shekinah","grace","faith","humility","sacrament","zeal","worship","penitent","ardor","luminous","solitude","yearning","majesty","eternal","creature","seraph","abide","rapture","dross","bulwark","covenant"];
function dayIndex() { const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5); }
async function vToday() {
  const v = $("#view");
  v.innerHTML = `<div class="box pad"><span class="spin"></span> Loading</div>`;
  let cat;
  try { cat = await catalog(); } catch (e) { v.innerHTML = `<div class="box pad">Couldn't load the library. Check your connection and reload.</div>`; return; }
  const eds = cat.filter(isEd).flatMap((w) => w.toc.map((t, i) => ({ id: w.id, ch: i, t: t[0], d: t[2] })));
  const books = cat.filter((w) => !isEd(w));
  const pool = eds.length ? eds : books.flatMap((w) => w.toc.map((t, i) => ({ id: w.id, ch: i, t: t[0], d: "" })));
  const pick = pool[dayIndex() % pool.length];
  const work = cat.find((w) => w.id === pick.id);
  const last = L.get("last", null), lw = last && cat.find((w) => w.id === last.id);
  const wod = WOD[dayIndex() % WOD.length];
  const now = new Date();
  v.innerHTML = `
  <section class="box hero"><div class="pad">
    <div class="kicker"><span class="label red">Today's reading</span><span class="label">${esc(isEd(work) ? "Editorial · " + fmtDate(pick.d) : work.title)}</span></div>
    <h2>${esc(pick.t)}</h2>
    <p class="ex" id="todayEx"><span class="spin"></span></p>
    <div class="row" style="margin-top:16px"><button class="btn primary" id="todayRead">Read it</button><button class="btn" id="todayLib">Browse the library</button></div>
  </div></section>
  ${lw ? `<section class="box"><button class="lrow" id="cont"><span><span class="label">Continue</span><b>${esc(lw.toc[last.ch] ? lw.toc[last.ch][0] : lw.title)}</b><small>${esc(isEd(lw) ? "Editorial · " + fmtDate(lw.toc[last.ch][2]) : lw.title)}</small></span><span class="go">Open →</span></button></section>` : ""}
  <section class="box wod"><div class="pad" id="wodBox"><span class="label">Word of the day</span><div style="margin-top:6px"><b>${esc(wod)}</b></div><p class="long" id="wodDef"><span class="spin"></span></p><div class="row" style="margin-top:12px"><button class="btn" id="wodMore">Meaning and translation</button></div></div></section>
  <section class="box pad"><span class="label">In the library</span><p class="lede" style="margin-top:8px">${books.length} book${books.length === 1 ? "" : "s"}${eds.length ? ` and ${eds.length} editorials from The Alliance Weekly and The Alliance Witness, ${eds[0].d.slice(0, 4)}–${eds[eds.length - 1].d.slice(0, 4)}` : ""}. Tap any word while reading to see what it means or translate it.</p></section>`;
  $("#todayRead").onclick = () => openWork(pick.id, pick.ch);
  $("#todayLib").onclick = () => show("library");
  $("#wodMore").onclick = () => openWord(wod, null);
  const c = $("#cont"); if (c) c.onclick = () => openWork(last.id, last.ch);
  try { const d = await getJSON(`texts/${pick.id}.json`); const p = d.chapters[pick.ch].p.find((x) => !x.startsWith("> ") && x.length > 60) || d.chapters[pick.ch].p[0]; const ex = $("#todayEx"); if (ex) ex.textContent = p.length > 360 ? p.slice(0, p.lastIndexOf(" ", 340)) + " …" : p; } catch (e) {}
  try { const e = await lookup(wod); const el = $("#wodDef"); if (el) el.innerHTML = e && e.n ? `<span class="pos">${posName(e.n[0][0])}</span> ${esc(stripEx(e.n[0][1]))}` : e && e.w ? esc(webClean(e.w).slice(0, 300)) : ""; } catch (e) {}
}

/* ============ LIBRARY ============ */
async function vLibrary() {
  if (S.rd) return vReader();
  const v = $("#view");
  v.innerHTML = `<div class="box pad"><span class="spin"></span> Loading</div>`;
  const cat = await catalog();
  const p = progress();
  const books = cat.filter((w) => !isEd(w)), eds = cat.filter(isEd);
  const q = S.lib.q.trim().toLowerCase();
  const total = eds.reduce((a, w) => a + w.n, 0);
  let edHTML = "";
  if (q) {
    const hits = eds.flatMap((w) => w.toc.map((t, i) => ({ w, i, t }))).filter((x) => x.t[0].toLowerCase().includes(q));
    edHTML = hits.length ? hits.map(({ w, i, t }) => `<button class="erow${(p[w.id] || { done: [] }).done.includes(i) ? " read" : ""}" data-w="${w.id}" data-c="${i}"><time>${esc(shortDate(t[2]))} ${t[2].slice(0, 4)}</time><b>${esc(t[0])}</b></button>`).join("") : `<div class="empty">No editorial titles match “${esc(S.lib.q)}”. Search looks inside the texts too.</div>`;
  } else {
    edHTML = eds.map((w) => {
      const open = S.lib.year === w.id, rd = (p[w.id] || { done: [] }).done.length;
      return `<button class="yr" data-y="${w.id}" aria-expanded="${open}"><b>${esc(w.year)}</b><span>${w.n} editorial${w.n === 1 ? "" : "s"}${rd ? ` · ${rd} read` : ""} ${open ? "−" : "+"}</span></button>` +
        (open ? w.toc.map((t, i) => `<button class="erow${(p[w.id] || { done: [] }).done.includes(i) ? " read" : ""}" data-w="${w.id}" data-c="${i}"><time>${esc(shortDate(t[2]))}</time><b>${esc(t[0])}</b></button>`).join("") : "");
    }).join("");
  }
  v.innerHTML = `
  <section class="box pad"><h2 class="pageh">Library</h2><p class="note" style="margin-top:6px">Everything here is Tozer's own writing and in the public domain in the United States.</p>
    <form class="ctl" id="libF" style="margin-top:14px"><input type="search" id="libQ" placeholder="Filter titles…" value="${esc(S.lib.q)}" aria-label="Filter titles"><button class="btn">Filter</button></form></section>
  ${books.length ? `<section class="box"><div class="sechead"><span class="label">Books</span></div>${books.map((w) => { const rd = (p[w.id] || { done: [] }).done.length; return `<button class="lrow" data-open="${w.id}"><span><b>${esc(w.title)}</b><small>${esc(w.year)} · ${w.n} chapters${rd ? ` · ${rd} read` : ""}</small><span class="desc">${esc(w.desc || "")}</span></span><span class="go">Open →</span></button>`; }).join("")}</section>` : ""}
  ${eds.length ? `<section class="box"><div class="sechead"><span class="label">Editorials · ${total}</span><p class="note" style="margin-top:4px">Written while Tozer edited The Alliance Weekly (1950–57) and The Alliance Witness (1958–63): the editorials he signed “A. W. T.”, the unsigned “Editorial Voice” pieces he wrote as editor, and articles under his name.</p></div>${edHTML}</section>` : ""}`;
  $("#libF").onsubmit = (e) => { e.preventDefault(); S.lib.q = $("#libQ").value; vLibrary(); };
  $("#libQ").oninput = (e) => { if (!e.target.value) { S.lib.q = ""; vLibrary(); } };
  $$("[data-y]").forEach((b) => (b.onclick = () => { S.lib.year = S.lib.year === b.dataset.y ? null : b.dataset.y; vLibrary(); }));
  $$("[data-w]").forEach((b) => (b.onclick = () => openWork(b.dataset.w, +b.dataset.c)));
  $$("[data-open]").forEach((b) => (b.onclick = () => { const w = cat.find((x) => x.id === b.dataset.open); const s = p[w.id]; openWork(w.id, s ? s.at || 0 : 0, true); }));
}

async function openWork(id, ch, contents) {
  S.rd = { id, ch: ch || 0, toc: !!contents && !(progress()[id]) };
  S.view = "library";
  $$(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === "library")));
  await vReader(); scrollTo(0, 0);
}

/* ============ READER ============ */
async function vReader() {
  const v = $("#view"), cat = await catalog(), w = cat.find((x) => x.id === S.rd.id);
  v.innerHTML = `<div class="box pad"><span class="spin"></span> Opening ${esc(w.title)}</div>`;
  let d; try { d = await getJSON(`texts/${w.id}.json`); } catch (e) { v.innerHTML = `<div class="box pad">Couldn't open this text. Check your connection.</div>`; return; }
  const n = d.chapters.length; S.rd.ch = Math.max(0, Math.min(n - 1, S.rd.ch));
  const c = d.chapters[S.rd.ch], ed = isEd(w);
  if (S.rd.toc) {
    let lastB = null;
    v.innerHTML = `${rbar(w.title, true)}
    <section class="box"><div class="pad"><span class="label">${esc(ed ? "Editorials" : "A. W. Tozer · " + w.year)}</span><h2 class="pageh" style="margin-top:6px">${esc(ed ? "The Alliance " + (+w.year >= 1958 ? "Witness" : "Weekly") + ", " + w.year : w.title)}</h2>${w.desc ? `<p class="lede" style="margin-top:8px">${esc(w.desc)}</p>` : ""}</div>
    <div>${d.chapters.map((x, i) => { const hb = x.b && x.b !== lastB; lastB = x.b; return (hb ? `<div class="sechead"><span class="label">${esc(x.b)}</span></div>` : "") + `<button class="toc${i === S.rd.ch ? " cur" : ""}" data-i="${i}"><i>${ed ? esc(shortDate(x.d)) : i + 1}</i><span>${esc(x.t)}</span></button>`; }).join("")}</div></section>`;
    bindBar(w, d);
    $$(".toc").forEach((b) => (b.onclick = () => { S.rd.ch = +b.dataset.i; S.rd.toc = false; vReader(); scrollTo(0, 0); }));
    return;
  }
  const kept = L.get("keep", []).filter((k) => k.id === w.id && k.ch === S.rd.ch).map((k) => k.pi);
  const prev = S.rd.ch > 0 ? d.chapters[S.rd.ch - 1] : null, next = S.rd.ch < n - 1 ? d.chapters[S.rd.ch + 1] : null;
  const tipOn = !L.get("tipSeen", false);
  v.innerHTML = `${rbar(ed ? c.t : w.title)}
  ${tipOn ? `<div class="tip" id="tip"><span>Tap any word to see what it means or translate it. Tap a Bible reference to read the verse.</span><button id="tipX">Got it</button></div>` : ""}
  <article class="box"><div class="prog" aria-hidden="true"><i style="width:${Math.round(((S.rd.ch + 1) / n) * 100)}%"></i></div><div class="doc" id="doc">
    <div class="label dlabel">${esc(ed ? (c.m || (+c.d.slice(0, 4) >= 1958 ? "The Alliance Witness" : "The Alliance Weekly")) + " · " + fmtDate(c.d) + " · " + (S.rd.ch + 1) + " of " + n : (c.b ? c.b + " · " : "") + "A. W. Tozer · " + (S.rd.ch + 1) + " of " + n)}</div>
    <h2>${esc(c.t)}</h2>
    ${c.p.map((p, i) => { const q = p.startsWith("> "); return `<p data-pi="${i}" class="${q ? "q" : ""}${kept.includes(i) ? " kept" : ""}">${linkRefs(esc(q ? p.slice(2) : p))}</p>`; }).join("")}
    ${ed ? `<p class="src">${c.k === "article" ? "Article by A. W. Tozer." : c.s ? "Signed “A. W. T.”" : "Unsigned editorial, from the page Tozer wrote as editor."} ${c.pg ? `Page ${c.pg} of the issue. ` : ""}Taken from the magazine scan; if a word looks wrong, it may be a scanning error.</p>` : ""}
  </div>
  <div class="pager">${prev ? `<button id="pPrev"><small>← Previous</small><span>${esc(prev.t)}</span></button>` : "<span></span>"}${next ? `<button id="pNext"><small>Next →</small><span>${esc(next.t)}</span></button>` : "<span></span>"}</div></article>`;
  bindBar(w, d);
  bindText($("#doc"), { id: w.id, ch: S.rd.ch, title: c.t, work: w.title });
  const tx = $("#tipX"); if (tx) tx.onclick = () => { L.set("tipSeen", true); $("#tip").remove(); };
  if (prev) $("#pPrev").onclick = () => { S.rd.ch--; vReader(); scrollTo(0, 0); };
  if (next) $("#pNext").onclick = () => { S.rd.ch++; vReader(); scrollTo(0, 0); };
  markRead(w.id, S.rd.ch);
}
function rbar(title, toc) {
  return `<div class="rbar"><button class="ic" id="rBack" aria-label="Back to library">←</button><div class="rt"><span>${esc(title)}</span></div>${toc ? "" : `<button class="ic" id="rToc" aria-label="Contents">☰</button><button id="rListen" aria-label="Listen">Listen</button><button class="ic" id="rSize" aria-label="Text size">Aa</button>`}</div>`;
}
function bindBar(w, d) {
  $("#rBack").onclick = () => { stopSpeech(); S.rd = null; vLibrary(); scrollTo(0, 0); };
  const t = $("#rToc"); if (t) t.onclick = () => { stopSpeech(); S.rd.toc = true; vReader(); scrollTo(0, 0); };
  const s = $("#rSize"); if (s) s.onclick = cycleSize;
  const l = $("#rListen"); if (l) l.onclick = () => toggleSpeech($("#doc"), l);
}

/* speech */
let speaking = false;
function stopSpeech() { try { speechSynthesis.cancel(); } catch (e) {} speaking = false; const l = $("#rListen"); if (l) l.textContent = "Listen"; }
function toggleSpeech(root, btn) {
  if (!("speechSynthesis" in window)) { toast("Listening isn't supported in this browser."); return; }
  if (speaking) { stopSpeech(); return; }
  const parts = $$("h2, p:not(.src)", root).map((p) => p.textContent);
  speaking = true; btn.textContent = "Stop";
  let i = 0;
  const next = () => { if (!speaking || i >= parts.length) { stopSpeech(); return; } const u = new SpeechSynthesisUtterance(parts[i++]); u.rate = 0.95; u.lang = "en-US"; u.onend = next; u.onerror = () => stopSpeech(); speechSynthesis.speak(u); };
  next();
}

/* ============ scripture references ============ */
const BK = {
  gen:"GEN",genesis:"GEN",ex:"EXO",exod:"EXO",exodus:"EXO",lev:"LEV",leviticus:"LEV",num:"NUM",numbers:"NUM",deut:"DEU",deuteronomy:"DEU",josh:"JOS",joshua:"JOS",judg:"JDG",judges:"JDG",ruth:"RUT",
  "1sam":"1SA","2sam":"2SA","1samuel":"1SA","2samuel":"2SA","1kings":"1KI","2kings":"2KI","1kgs":"1KI","2kgs":"2KI","1chron":"1CH","2chron":"2CH","1chr":"1CH","2chr":"2CH","1chronicles":"1CH","2chronicles":"2CH",
  ezra:"EZR",neh:"NEH",nehemiah:"NEH",esth:"EST",esther:"EST",job:"JOB",ps:"PSA",psa:"PSA",psalm:"PSA",psalms:"PSA",prov:"PRO",proverbs:"PRO",eccl:"ECC",eccles:"ECC",ecclesiastes:"ECC",song:"SNG",cant:"SNG",
  isa:"ISA",isaiah:"ISA",jer:"JER",jeremiah:"JER",lam:"LAM",lamentations:"LAM",ezek:"EZK",ezekiel:"EZK",dan:"DAN",daniel:"DAN",hos:"HOS",hosea:"HOS",joel:"JOL",amos:"AMO",obad:"OBA",obadiah:"OBA",jonah:"JON",mic:"MIC",micah:"MIC",nah:"NAM",nahum:"NAM",hab:"HAB",habakkuk:"HAB",zeph:"ZEP",zephaniah:"ZEP",hag:"HAG",haggai:"HAG",zech:"ZEC",zechariah:"ZEC",mal:"MAL",malachi:"MAL",
  matt:"MAT",mat:"MAT",matthew:"MAT",mark:"MRK",mk:"MRK",luke:"LUK",lk:"LUK",john:"JHN",jn:"JHN",acts:"ACT",rom:"ROM",romans:"ROM","1cor":"1CO","2cor":"2CO","1corinthians":"1CO","2corinthians":"2CO",gal:"GAL",galatians:"GAL",eph:"EPH",ephesians:"EPH",phil:"PHP",philippians:"PHP",col:"COL",colossians:"COL",
  "1thess":"1TH","2thess":"2TH","1thessalonians":"1TH","2thessalonians":"2TH","1tim":"1TI","2tim":"2TI","1timothy":"1TI","2timothy":"2TI",tit:"TIT",titus:"TIT",philem:"PHM",philemon:"PHM",heb:"HEB",hebrews:"HEB",jas:"JAS",james:"JAS",
  "1pet":"1PE","2pet":"2PE","1peter":"1PE","2peter":"2PE","1john":"1JN","2john":"2JN","3john":"3JN",jude:"JUD",rev:"REV",revelation:"REV"
};
const REF_RE = /\b((?:[123]|I{1,3})\s?)?(Gen|Genesis|Ex|Exod|Exodus|Lev|Leviticus|Num|Numbers|Deut|Deuteronomy|Josh|Joshua|Judg|Judges|Ruth|Sam|Samuel|Kings|Kgs|Chron|Chr|Chronicles|Ezra|Neh|Nehemiah|Esth|Esther|Job|Ps|Psa|Psalm|Psalms|Prov|Proverbs|Eccl|Eccles|Ecclesiastes|Song|Cant|Isa|Isaiah|Jer|Jeremiah|Lam|Lamentations|Ezek|Ezekiel|Dan|Daniel|Hos|Hosea|Joel|Amos|Obad|Obadiah|Jonah|Mic|Micah|Nah|Nahum|Hab|Habakkuk|Zeph|Zephaniah|Hag|Haggai|Zech|Zechariah|Mal|Malachi|Matt|Mat|Matthew|Mark|Mk|Luke|Lk|John|Jn|Acts|Rom|Romans|Cor|Corinthians|Gal|Galatians|Eph|Ephesians|Phil|Philippians|Col|Colossians|Thess|Thessalonians|Tim|Timothy|Tit|Titus|Philem|Philemon|Heb|Hebrews|Jas|James|Pet|Peter|Jude|Rev|Revelation)\.?\s+(\d{1,3})(?::\s?(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?)?\b/g;
function refCode(num, name) {
  const n = num ? String(num).trim().replace(/^III$/, "3").replace(/^II$/, "2").replace(/^I$/, "1") : "";
  const key = (n + name).toLowerCase(), k2 = name.toLowerCase();
  return BK[key] || (!n ? BK[k2] : null);
}
function linkRefs(html) {
  return html.replace(REF_RE, (m, num, name, ch, v1, v2) => {
    if (!v1 && !["Psalm", "Psalms", "Ps", "Psa"].includes(name)) return m;
    const code = refCode(num, name); if (!code) return m;
    return `<span class="sref" role="button" tabindex="0" data-ref="${code}.${ch}.${v1 || ""}.${v2 || ""}">${m}</span>`;
  });
}

/* ============ word taps ============ */
function wordAt(x, y) {
  let node, off;
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (!p) return null; node = p.offsetNode; off = p.offset; }
  else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (!r) return null; node = r.startContainer; off = r.startOffset; }
  if (!node || node.nodeType !== 3) return null;
  const t = node.textContent, isW = (c) => /[A-Za-zÀ-ɏ'’-]/.test(c);
  let a = off, b = off;
  while (a > 0 && isW(t[a - 1])) a--;
  while (b < t.length && isW(t[b])) b++;
  let w = t.slice(a, b).replace(/^['’-]+|['’-]+$/g, "");
  if (!w || !/[A-Za-z]/.test(w)) return null;
  const lead = t.slice(a, b).indexOf(w);
  return { word: w, node, start: a + lead, end: a + lead + w.length };
}
function highlight(hit) {
  try { if (!window.CSS || !CSS.highlights) return; const r = new Range(); r.setStart(hit.node, hit.start); r.setEnd(hit.node, hit.end); CSS.highlights.set("tzword", new Highlight(r)); } catch (e) {}
}
function clearHighlight() { try { CSS.highlights && CSS.highlights.delete("tzword"); } catch (e) {} }
function bindText(root, ctx) {
  root.addEventListener("click", (e) => {
    const r = e.target.closest(".sref");
    if (r) { const [b, c, v1, v2] = r.dataset.ref.split("."); openRef(b, +c, v1 ? +v1 : null, v2 ? +v2 : null); return; }
    if (String(getSelection() || "").trim().length > 1) return;
    const p = e.target.closest("p[data-pi], p[data-v]"); if (!p) return;
    const hit = wordAt(e.clientX, e.clientY); if (!hit) return;
    highlight(hit);
    openWord(hit.word, { ...ctx, pi: p.dataset.pi != null ? +p.dataset.pi : null, v: p.dataset.v || null, text: p.textContent });
  });
  root.addEventListener("keydown", (e) => { const r = e.target.closest(".sref"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.click(); } });
}

/* ============ dictionary ============ */
let DIDX = null;
async function dictChunk(w) {
  if (!DIDX) DIDX = await getJSON("dict/index.json");
  let lo = 0, hi = DIDX.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (DIDX[m] <= w) lo = m; else hi = m - 1; }
  return getJSON(`dict/${lo}.json`);
}
const IRREG = { hath: "have", hast: "have", hadst: "have", doth: "do", dost: "do", didst: "do", saith: "say", sayest: "say", spake: "speak", art: "be", wast: "be", wert: "be", shalt: "shall", wilt: "will", canst: "can", couldst: "could", wouldst: "would", shouldst: "should", mayest: "may", knowest: "know", goeth: "go", men: "man", women: "woman", children: "child", feet: "foot", teeth: "tooth", mice: "mouse", brethren: "brother", oxen: "ox", went: "go", gone: "go", saw: "see", seen: "see", came: "come", gave: "give", given: "give", took: "take", taken: "take", knew: "know", known: "know", spoke: "speak", spoken: "speak", wrote: "write", written: "write", thought: "think", brought: "bring", sought: "seek", taught: "teach", bought: "buy", fought: "fight", ran: "run", began: "begin", begun: "begin", rose: "rise", risen: "rise", fell: "fall", fallen: "fall", held: "hold", stood: "stand", understood: "understand", lay: "lie", laid: "lay", slain: "slay", slew: "slay", bore: "bear", borne: "bear", born: "bear", drew: "draw", drawn: "draw", ate: "eat", eaten: "eat", forsook: "forsake", forsaken: "forsake", better: "good", best: "good", worse: "bad", worst: "bad", was: "be", were: "be", is: "be", are: "be", been: "be", am: "be", has: "have", had: "have", did: "do", does: "do", said: "say", made: "make", found: "find", felt: "feel", kept: "keep", left: "leave", meant: "mean", met: "meet", paid: "pay", sent: "send", spent: "spend", told: "tell", won: "win", led: "lead", fed: "feed", fled: "flee", wept: "weep", slept: "sleep", heard: "hear", sat: "sit", lost: "lose", built: "build", dwelt: "dwell", knelt: "kneel", sold: "sell", shone: "shine", strove: "strive", striven: "strive", wrought: "work" };
function candidates(raw) {
  const w = raw.toLowerCase().replace(/[’]/g, "'").replace(/'s$/, "").replace(/'$/, "");
  const out = [w];
  if (IRREG[w]) out.push(IRREG[w]);
  const add = (s) => { if (s && s.length > 1 && !out.includes(s)) out.push(s); };
  const rules = [["ies", "y"], ["ied", "y"], ["ier", "y"], ["iest", "y"], ["ily", "y"], ["iness", "y"], ["ves", "f"], ["ves", "fe"], ["sses", "ss"], ["xes", "x"], ["ches", "ch"], ["shes", "sh"], ["es", "e"], ["es", ""], ["s", ""], ["ed", ""], ["ed", "e"], ["d", ""], ["ing", ""], ["ing", "e"], ["eth", ""], ["eth", "e"], ["est", ""], ["est", "e"], ["st", ""], ["er", ""], ["er", "e"], ["ly", ""], ["ly", "le"], ["ness", ""], ["ment", ""], ["ful", ""], ["less", ""]];
  for (const [a, b] of rules) if (w.endsWith(a) && w.length > a.length + 2) { const s = w.slice(0, -a.length) + b; add(s); if (/(bb|dd|ff|gg|ll|mm|nn|pp|rr|ss|tt|zz)$/.test(s) && !b) add(s.slice(0, -1)); }
  return out;
}
async function lookup(raw) {
  const cs = candidates(raw); let first = null;
  for (const c of cs) {
    try {
      const ch = await dictChunk(c);
      if (!ch[c]) continue;
      const e = { ...ch[c], word: c };
      // "has", "loveth", "spake": a bare inflection note is not a meaning, so also look up the base word
      if (!first) { first = e; if ((!e.n || !e.n.length) && e.w && e.w.length < 90 && cs.length > 1) continue; else if (IRREG[raw.toLowerCase()] || !e.n) { const base = IRREG[raw.toLowerCase()]; if (base && base !== c) { try { const bc = await dictChunk(base); if (bc[base]) return { ...bc[base], word: base, from: raw }; } catch (x) {} } } return e; }
      return e.n ? e : first;
    } catch (e) {}
  }
  return first;
}
async function easton(raw) {
  const k = raw.toLowerCase(), l = /^[a-z]/.test(k) ? k[0] : "_";
  try { const d = await getJSON(`easton/${l}.json`); for (const c of [k, ...candidates(raw)]) if (d[c]) return d[c]; } catch (e) {}
  return null;
}
const posName = (p) => ({ n: "noun", v: "verb", a: "adjective", s: "adjective", r: "adverb" })[p] || "";
const webClean = (t) => t.replace(/\s*\[[^\]]*(\]|$)/g, "").replace(/\s*--\s*/g, " — ").trim();
const stripEx = (g) => g.split(/;\s*"/)[0].trim();

/* ============ translation ============ */
const LANGS = [["hi", "Hindi"], ["es", "Spanish"], ["pt", "Portuguese"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["ko", "Korean"], ["zh", "Chinese (Simplified)"], ["ja", "Japanese"], ["ru", "Russian"], ["ar", "Arabic"], ["bn", "Bengali"], ["mr", "Marathi"], ["ta", "Tamil"], ["te", "Telugu"], ["kn", "Kannada"], ["ml", "Malayalam"], ["gu", "Gujarati"], ["pa", "Punjabi"], ["ur", "Urdu"], ["ne", "Nepali"], ["sw", "Swahili"], ["id", "Indonesian"], ["tl", "Filipino"], ["vi", "Vietnamese"], ["th", "Thai"], ["nl", "Dutch"], ["pl", "Polish"], ["uk", "Ukrainian"], ["ro", "Romanian"], ["tr", "Turkish"], ["he", "Hebrew"], ["el", "Greek"], ["am", "Amharic"], ["yo", "Yoruba"]];
function defaultLang() {
  const saved = L.get("lang", null); if (saved) return saved;
  for (const l of navigator.languages || [navigator.language || ""]) { const c = String(l).slice(0, 2).toLowerCase(); if (c !== "en" && LANGS.some((x) => x[0] === c)) return c; }
  return "hi";
}
const langName = (c) => (LANGS.find((x) => x[0] === c) || [c, c])[1];
function langSelect(id, cur) { return `<select id="${id}" aria-label="Language">${LANGS.map(([c, n]) => `<option value="${c}"${c === cur ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`; }
const gtLink = (text, lang) => `https://translate.google.com/?sl=en&tl=${encodeURIComponent(lang)}&text=${encodeURIComponent(text.slice(0, 4500))}&op=translate`;
const TR_CACHE = new Map();
async function translate(text, lang) {
  const key = lang + "|" + text; if (TR_CACHE.has(key)) return TR_CACHE.get(key);
  let out = null, via = null;
  try {
    if ("Translator" in self) {
      const a = await self.Translator.availability({ sourceLanguage: "en", targetLanguage: lang });
      if (a && a !== "unavailable") { const t = await self.Translator.create({ sourceLanguage: "en", targetLanguage: lang }); out = await t.translate(text); via = "your browser, on this device"; }
    }
  } catch (e) { out = null; }
  if (!out && SAMPLE) {
    try {
      const r = await SAMPLE(`Translate the following English text into ${langName(lang)}. It is from the Christian writer A. W. Tozer (or the Bible). Keep the meaning and reverent tone; use the natural Christian vocabulary a believer in that language would use. Reply with the translation only.\n\n${text}`, { modelTier: "quick" });
      out = (r && r.text || "").trim() || null; via = "Claude";
    } catch (e) { out = null; }
  }
  const res = out ? { text: out, via } : null;
  if (res) TR_CACHE.set(key, res);
  return res;
}
async function plainEnglish(text) {
  if (!SAMPLE) return null;
  try { const r = await SAMPLE(`Rewrite this passage by A. W. Tozer in plain, modern English for a thoughtful reader today. Keep every idea and his voice, keep it about the same length, explain nothing extra. Reply with the rewritten passage only.\n\n${text}`, { modelTier: "quick" }); return (r && r.text || "").trim() || null; } catch (e) { return null; }
}

/* ============ sheet ============ */
function openSheet(title, bodyHTML, onClose) {
  closeSheet();
  const root = $("#sheetRoot");
  root.innerHTML = `<div class="scrim" id="scrim"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="shead"><h3>${esc(title)}</h3><button class="x" id="sx" aria-label="Close">×</button></div><div class="sbody" id="sbody">${bodyHTML}</div></div>`;
  const close = () => { closeSheet(); onClose && onClose(); };
  $("#scrim").onclick = close; $("#sx").onclick = close;
  document.addEventListener("keydown", escClose);
  document.body.classList.add("locked");
  $("#sx").focus({ preventScroll: true });
}
function escClose(e) { if (e.key === "Escape") closeSheet(); }
function closeSheet() { document.body.classList.remove("locked"); $("#sheetRoot").innerHTML = ""; clearHighlight(); document.removeEventListener("keydown", escClose); }

async function openWord(word, ctx) {
  const lang = defaultLang();
  const recent = L.get("recent", []).filter((x) => x.w.toLowerCase() !== word.toLowerCase());
  recent.unshift({ w: word, t: Date.now() }); L.set("recent", recent.slice(0, 60));
  const saved = L.get("saved", []), isSaved = saved.some((x) => x.w.toLowerCase() === word.toLowerCase());
  openSheet(word, `
    <section id="sDef"><span class="label">Meaning</span><div class="long"><span class="spin"></span> Looking up</div></section>
    <section id="sEas" hidden></section>
    <section><div class="spread"><span class="label">Translate</span>${langSelect("sLang", lang)}</div><div id="sTrW" class="tr"><span class="spin"></span></div><p class="note" id="sTrVia" style="margin-top:6px"></p></section>
    ${ctx && ctx.text ? `<section><span class="label">This ${ctx.v ? "verse" : "paragraph"}</span><div class="row" style="margin-top:10px"><button class="btn" id="sTrP">Translate it</button>${SAMPLE && !ctx.v ? `<button class="btn" id="sPlain">Say it plainly</button>` : ""}${ctx.pi != null ? `<button class="btn" id="sKeep">${L.get("keep", []).some((k) => k.id === ctx.id && k.ch === ctx.ch && k.pi === ctx.pi) ? "Unmark" : "Mark it"}</button>` : ""}<button class="btn" id="sCopy">Copy</button></div><div id="sPOut"></div></section>` : ""}
    <section class="row"><button class="btn${isSaved ? "" : " primary"}" id="sSave">${isSaved ? "Saved to your words" : "Save word"}</button></section>`);
  const run = async () => {
    const l = $("#sLang") ? $("#sLang").value : lang; L.set("lang", l);
    const out = $("#sTrW"), via = $("#sTrVia"); if (!out) return;
    out.innerHTML = `<span class="spin"></span>`; via.textContent = "";
    const r = await translate(word, l);
    if (!$("#sTrW")) return;
    if (r) { out.textContent = r.text; via.textContent = `${langName(l)} · translated by ${r.via}.`; }
    else { out.innerHTML = `<a href="${esc(gtLink(word, l))}" target="_blank" rel="noopener">Open “${esc(word)}” in Google Translate (${esc(langName(l))}) ↗</a>`; via.textContent = "This browser can't translate on its own. Chrome on a computer can, without sending anything away."; }
  };
  $("#sLang").onchange = () => { run(); const p = $("#sPOut"); if (p) p.innerHTML = ""; };
  $("#sSave").onclick = () => { const s = L.get("saved", []); const i = s.findIndex((x) => x.w.toLowerCase() === word.toLowerCase()); if (i >= 0) { s.splice(i, 1); $("#sSave").textContent = "Save word"; $("#sSave").classList.add("primary"); } else { s.unshift({ w: word, t: Date.now(), from: ctx ? (ctx.title || "") : "" }); $("#sSave").textContent = "Saved to your words"; $("#sSave").classList.remove("primary"); } L.set("saved", s); };
  if (ctx && ctx.text) {
    $("#sCopy").onclick = () => copy(ctx.text + (ctx.work ? `\n— A. W. Tozer, ${ctx.title}` : ""));
    $("#sTrP").onclick = async () => {
      const l = $("#sLang").value, o = $("#sPOut"); o.innerHTML = `<div class="tr big"><span class="spin"></span></div>`;
      const r = await translate(ctx.text, l);
      if (!$("#sPOut")) return;
      o.innerHTML = r ? `<div class="tr big"></div><p class="note" style="margin-top:6px">${esc(langName(l))} · translated by ${esc(r.via)}.</p>` : `<p class="note" style="margin-top:10px"><a href="${esc(gtLink(ctx.text, l))}" target="_blank" rel="noopener">Open this ${ctx.v ? "verse" : "paragraph"} in Google Translate ↗</a></p>`;
      if (r) o.querySelector(".tr").textContent = r.text;
    };
    const pl = $("#sPlain"); if (pl) pl.onclick = async () => { const o = $("#sPOut"); o.innerHTML = `<div class="tr big"><span class="spin"></span></div>`; const r = await plainEnglish(ctx.text); if (!$("#sPOut")) return; o.innerHTML = r ? `<div class="tr big"></div><p class="note" style="margin-top:6px">Plain English by Claude. Tozer's own words are above.</p>` : `<p class="note">Couldn't reach Claude just now.</p>`; if (r) o.querySelector(".tr").textContent = r; };
    const kp = $("#sKeep"); if (kp) kp.onclick = () => { const k = L.get("keep", []); const i = k.findIndex((x) => x.id === ctx.id && x.ch === ctx.ch && x.pi === ctx.pi); if (i >= 0) k.splice(i, 1); else k.unshift({ id: ctx.id, ch: ctx.ch, pi: ctx.pi, text: ctx.text.slice(0, 600), title: ctx.title, work: ctx.work, t: Date.now() }); L.set("keep", k); const p = $(`#doc p[data-pi="${ctx.pi}"]`); if (p) p.classList.toggle("kept", i < 0); kp.textContent = i >= 0 ? "Mark it" : "Unmark"; };
  }
  run();
  const [e, ea] = await Promise.all([lookup(word), easton(word)]);
  const box = $("#sDef"); if (!box) return;
  if (!e) box.innerHTML = `<span class="label">Meaning</span><p class="long">No entry for “${esc(word)}”. It may be a name, an old spelling, or a scanning error.</p>`;
  else {
    const verbish = e.from || /(eth|est|ed|ing)$/i.test(word) || Object.prototype.hasOwnProperty.call(IRREG, word.toLowerCase());
    const senses = (verbish ? [...(e.n || [])].sort((x, y) => (y[0] === "v") - (x[0] === "v")) : (e.n || [])).slice(0, 5);
    box.innerHTML = `<span class="label">Meaning${e.word !== word.toLowerCase() ? ` · “${esc(word)}” is a form of “${esc(e.word)}”` : ""}</span>
      ${senses.map((s, i) => `<div class="sense"><i>${i + 1}</i><div><em>${posName(s[0])}</em> ${esc(stripEx(s[1]))}${s[2] && s[2].length ? `<div class="syn">Also: ${esc(s[2].join(", "))}</div>` : ""}</div></div>`).join("")}
      ${e.w ? `<details style="margin-top:12px" ${senses.length ? "" : "open"}><summary class="label" style="cursor:pointer">Webster's 1913 · as Tozer's generation knew it</summary><p class="long">${esc(webClean(e.w))}</p></details>` : ""}`;
  }
  if (ea) { const s = $("#sEas"); s.hidden = false; const t = ea[1]; s.innerHTML = `<span class="label">Easton's Bible Dictionary · ${esc(ea[0])}</span><p class="long">${esc(t.length > 900 ? t.slice(0, t.lastIndexOf(" ", 880)) + " …" : t)}</p>${t.length > 900 ? `<button class="btn link" id="eMore">Read the whole entry</button>` : ""}`; const m = $("#eMore"); if (m) m.onclick = () => { s.querySelector(".long").textContent = t; m.remove(); }; }
}

/* ============ Bible ============ */
async function bibleBooks() { if (!BOOKS) BOOKS = await getJSON("bible/books.json"); return BOOKS; }
async function chapterText(ver, code) { return getJSON(`bible/${ver}/${code}.json`); }
async function openRef(code, ch, v1, v2) {
  await bibleBooks();
  const ver = S.bible.ver, ref = `${bookName(code, 1)} ${ch}${v1 ? ":" + v1 + (v2 ? "–" + v2 : "") : ""}`;
  openSheet(ref, `<section id="rv"><span class="spin"></span></section><section class="row"><div class="seg" style="flex:1"><button data-rv="kjv" aria-pressed="${ver === "kjv"}">KJV</button><button data-rv="web" aria-pressed="${ver === "web"}">WEB</button></div><button class="btn" id="rOpen">Open chapter</button></section>`);
  const fill = async (vv) => {
    const d = await chapterText(vv, code), vs = d.c[ch - 1] || [];
    const a = v1 || 1, b = v1 ? (v2 || v1) : vs.length;
    $("#rv").innerHTML = `<span class="label">${vv === "kjv" ? "King James Version" : "World English Bible"}</span>` + vs.slice(a - 1, b).map((t, i) => `<p class="verse"><b>${a + i}</b>${fmtVerse(t)}</p>`).join("");
    $$("[data-rv]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.rv === vv)));
  };
  $$("[data-rv]").forEach((x) => (x.onclick = () => fill(x.dataset.rv)));
  $("#rOpen").onclick = () => { closeSheet(); S.bible.book = code; S.bible.ch = ch; S.bible.pick = null; S.bible.hl = v1; show("bible"); };
  fill(ver);
}
const fmtVerse = (t) => esc(t).replace(/\[([^\]]+)\]/g, '<span class="it">$1</span>').replace(/\n/g, "<br>");
async function vBible() {
  const v = $("#view"), B = await bibleBooks(), bb = S.bible;
  const seg = `<div class="seg"><button data-ver="kjv" aria-pressed="${bb.ver === "kjv"}">King James</button><button data-ver="web" aria-pressed="${bb.ver === "web"}">World English</button></div>`;
  if (!bb.book || (!bb.ch && !bb.pick)) {
    v.innerHTML = `<section class="box pad stack" style="gap:14px"><div><h2 class="pageh">Bible</h2><p class="note" style="margin-top:6px">Tozer quoted the King James Version. The World English Bible is a modern public-domain translation.</p></div>${seg}
      <form class="ctl" id="bgo"><input type="search" id="bref" placeholder="Go to: John 15 or Rom 8:28" aria-label="Go to a passage"><button class="btn">Go</button></form></section>
      <section class="box"><div class="sechead"><span class="label">Old Testament</span></div><div class="grid">${B.slice(0, 39).map(([c, n]) => `<button data-bk="${c}">${esc(n)}</button>`).join("")}</div></section>
      <section class="box"><div class="sechead"><span class="label">New Testament</span></div><div class="grid">${B.slice(39).map(([c, n]) => `<button data-bk="${c}">${esc(n)}</button>`).join("")}</div></section>`;
    bindVer();
    $$("[data-bk]").forEach((b) => (b.onclick = () => { bb.book = b.dataset.bk; bb.pick = true; bb.ch = null; vBible(); scrollTo(0, 0); }));
    $("#bgo").onsubmit = (e) => { e.preventDefault(); goRef($("#bref").value); };
    return;
  }
  const d = await chapterText(bb.ver, bb.book);
  if (bb.pick) {
    v.innerHTML = `<div class="rbar"><button class="ic" id="bBack" aria-label="All books">←</button><div class="rt"><span>${esc(bookName(bb.book))}</span></div></div>
      <section class="box"><div class="sechead"><span class="label">Chapters</span></div><div class="chs">${d.c.map((_, i) => `<button data-ch="${i + 1}">${i + 1}</button>`).join("")}</div></section>`;
    $("#bBack").onclick = () => { bb.book = null; bb.pick = null; vBible(); };
    $$("[data-ch]").forEach((b) => (b.onclick = () => { bb.ch = +b.dataset.ch; bb.pick = null; vBible(); scrollTo(0, 0); }));
    return;
  }
  const vs = d.c[bb.ch - 1] || [], paras = new Set(d.p[bb.ch - 1] || [1]), poet = d.poet && d.poet[bb.ch - 1];
  let html = "", cur = [];
  const flush = () => { if (cur.length) html += `<p class="${poet ? "poet" : ""}">${cur.join(poet ? "<br>" : " ")}</p>`; cur = []; };
  vs.forEach((t, i) => { if (!t) return; if (paras.has(i + 1) || poet) flush(); cur.push(`<span class="v" data-v="${i + 1}"><span class="vn">${i + 1}</span>${fmtVerse(t)}</span>`); });
  flush();
  const nb = B.findIndex((x) => x[0] === bb.book);
  v.innerHTML = `<div class="rbar"><button class="ic" id="bBack" aria-label="Chapters">←</button><div class="rt"><span>${esc(bookName(bb.book, 1))} ${bb.ch}</span></div><button id="bVer">${bb.ver.toUpperCase()}</button><button id="rListen">Listen</button><button class="ic" id="rSize" aria-label="Text size">Aa</button></div>
    <article class="box"><div class="doc vs" id="doc"><h2>${esc(bookName(bb.book, 1))} ${bb.ch}</h2>${html}</div>
    <div class="pager"><button id="bPrev"><small>← Previous</small><span>${bb.ch > 1 ? esc(bookName(bb.book)) + " " + (bb.ch - 1) : nb > 0 ? esc(B[nb - 1][1]) : ""}</span></button><button id="bNext"><small>Next →</small><span>${bb.ch < d.c.length ? esc(bookName(bb.book)) + " " + (bb.ch + 1) : nb < B.length - 1 ? esc(B[nb + 1][1]) + " 1" : ""}</span></button></div></article>`;
  $("#doc").addEventListener("click", (e) => {
    const vEl = e.target.closest(".v"); if (!vEl || String(getSelection() || "").trim().length > 1) return;
    const hit = wordAt(e.clientX, e.clientY); if (!hit) return; highlight(hit);
    openWord(hit.word, { v: vEl.dataset.v, text: vEl.textContent.replace(/^\d+/, ""), title: `${bookName(bb.book, 1)} ${bb.ch}:${vEl.dataset.v}` });
  });
  $("#bBack").onclick = () => { stopSpeech(); bb.pick = true; bb.ch = null; vBible(); };
  $("#bVer").onclick = () => { bb.ver = bb.ver === "kjv" ? "web" : "kjv"; L.set("ver", bb.ver); vBible(); };
  $("#rSize").onclick = cycleSize;
  $("#rListen").onclick = () => toggleSpeech($("#doc"), $("#rListen"));
  $("#bPrev").onclick = () => { if (bb.ch > 1) bb.ch--; else if (nb > 0) { bb.book = B[nb - 1][0]; bb.ch = 999; } else return; stopSpeech(); vBibleClamp(); };
  $("#bNext").onclick = () => { if (bb.ch < d.c.length) bb.ch++; else if (nb < B.length - 1) { bb.book = B[nb + 1][0]; bb.ch = 1; } else return; stopSpeech(); vBibleClamp(); };
  if (bb.hl) { const el = $(`.v[data-v="${bb.hl}"]`); if (el) { el.scrollIntoView({ block: "center" }); el.style.background = "var(--mark)"; } bb.hl = null; }
  L.set("bpos", { book: bb.book, ch: bb.ch });
}
async function vBibleClamp() { const d = await chapterText(S.bible.ver, S.bible.book); S.bible.ch = Math.min(S.bible.ch, d.c.length); await vBible(); scrollTo(0, 0); }
function bindVer() { $$("[data-ver]").forEach((b) => (b.onclick = () => { S.bible.ver = b.dataset.ver; L.set("ver", S.bible.ver); vBible(); })); }
async function goRef(s) {
  REF_RE.lastIndex = 0;
  const m = REF_RE.exec(s.trim().replace(/^(\d)(\w)/, "$1 $2"));
  let code = null, ch = 1, v1 = null;
  if (m) { code = refCode(m[1], m[2]); ch = +m[3]; v1 = m[4] ? +m[4] : null; }
  else { const B = await bibleBooks(); const t = s.trim().toLowerCase(); const b = B.find((x) => x[1].toLowerCase() === t || x[1].toLowerCase().startsWith(t)); if (b) { S.bible.book = b[0]; S.bible.pick = true; S.bible.ch = null; return vBible(); } }
  if (!code) { toast("Try a reference like John 15 or Psalm 63:8"); return; }
  S.bible.book = code; S.bible.ch = ch; S.bible.pick = null; S.bible.hl = v1; vBibleClamp();
}

/* ============ SEARCH ============ */
let ALL = null;
async function loadAll(onProg) {
  if (ALL) return ALL;
  const cat = await catalog(); const out = []; let n = 0;
  await Promise.all(cat.map(async (w) => { const d = await getJSON(`texts/${w.id}.json`); d.chapters.forEach((c, i) => out.push({ id: w.id, ch: i, t: c.t, d: c.d || "", work: w.title, ed: isEd(w), p: c.p })); onProg && onProg(++n, cat.length); }));
  ALL = out; return out;
}
function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q); if (i < 0) return esc(text.slice(0, 160));
  const a = Math.max(0, text.lastIndexOf(" ", Math.max(0, i - 70))), b = Math.min(text.length, text.indexOf(" ", i + q.length + 90) + 1 || text.length);
  return (a > 0 ? "… " : "") + esc(text.slice(a, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length, b)) + (b < text.length ? " …" : "");
}
async function vSearch() {
  const v = $("#view"), s = S.search;
  v.innerHTML = `<section class="box pad stack" style="gap:14px"><div><h2 class="pageh">Search</h2><p class="note" style="margin-top:6px">Every word Tozer wrote here, or the whole Bible.</p></div>
    <form class="ctl" id="sf"><input type="search" id="sq" value="${esc(s.q)}" placeholder="worship, the cross, humility…" aria-label="Search text"><button class="btn primary">Search</button></form>
    <div class="seg"><button data-sc="tozer" aria-pressed="${s.scope === "tozer"}">Tozer</button><button data-sc="bible" aria-pressed="${s.scope === "bible"}">Bible (${S.bible.ver.toUpperCase()})</button></div></section>
    <section class="box" id="sres">${s.res ? s.res : `<div class="empty">Try a phrase: “prevenient grace”, “the old cross”, “worship”.</div>`}</section>`;
  $$("[data-sc]").forEach((b) => (b.onclick = () => { s.scope = b.dataset.sc; s.res = null; if (s.q) runSearch(); else vSearch(); }));
  $("#sf").onsubmit = (e) => { e.preventDefault(); s.q = $("#sq").value.trim(); if (s.q) runSearch(); };
  bindHits();
}
function bindHits() {
  $$("[data-hit]").forEach((b) => (b.onclick = () => { const [id, ch] = b.dataset.hit.split("|"); openWork(id, +ch); }));
  $$("[data-bhit]").forEach((b) => (b.onclick = () => { const [c, ch, vv] = b.dataset.bhit.split("|"); S.bible.book = c; S.bible.ch = +ch; S.bible.pick = null; S.bible.hl = +vv; show("bible"); }));
}
async function runSearch() {
  const s = S.search, q = s.q.toLowerCase(), box = $("#sres");
  box.innerHTML = `<div class="empty"><span class="spin"></span> Searching <span id="sp"></span></div>`;
  const hits = [];
  if (s.scope === "tozer") {
    const all = await loadAll((n, t) => { const sp = $("#sp"); if (sp) sp.textContent = `${n} of ${t}`; });
    for (const c of all) { const pi = c.p.findIndex((p) => p.toLowerCase().includes(q)); if (pi >= 0 || c.t.toLowerCase().includes(q)) hits.push({ c, text: c.p[Math.max(0, pi)], count: c.p.reduce((a, p) => a + (p.toLowerCase().split(q).length - 1), 0) }); }
    hits.sort((a, b) => b.count - a.count);
    s.res = hits.length ? `<div class="sechead"><span class="label">${hits.length} place${hits.length === 1 ? "" : "s"}</span></div>` + hits.slice(0, 150).map((h) => `<button class="hit" data-hit="${h.c.id}|${h.c.ch}"><small>${esc(h.c.ed ? "Editorial · " + fmtDate(h.c.d) : h.c.work)} · ${esc(h.c.t)}</small><span>${snippet(h.text.replace(/^> /, ""), q)}</span></button>`).join("") : `<div class="empty">Nothing found for “${esc(s.q)}”.</div>`;
  } else {
    const B = await bibleBooks(); let n = 0;
    for (const [code, name] of B) { const d = await chapterText(S.bible.ver, code); d.c.forEach((vs, ci) => vs.forEach((t, vi) => { if (t.toLowerCase().includes(q)) hits.push({ code, name, ch: ci + 1, v: vi + 1, t }); })); const sp = $("#sp"); if (sp) sp.textContent = `${++n} of 66 books`; if (hits.length > 600) break; }
    s.res = hits.length ? `<div class="sechead"><span class="label">${hits.length}${hits.length > 600 ? "+" : ""} verse${hits.length === 1 ? "" : "s"}</span></div>` + hits.slice(0, 200).map((h) => `<button class="hit" data-bhit="${h.code}|${h.ch}|${h.v}"><small>${esc(h.name)} ${h.ch}:${h.v}</small><span>${snippet(h.t.replace(/[\[\]]/g, ""), q)}</span></button>`).join("") : `<div class="empty">Nothing found for “${esc(s.q)}”.</div>`;
  }
  if (S.view === "search") { $("#sres").innerHTML = s.res; bindHits(); }
}

/* ============ WORDS ============ */
async function vWords() {
  const v = $("#view"), saved = L.get("saved", []), recent = L.get("recent", []), keep = L.get("keep", []), lang = defaultLang();
  v.innerHTML = `
  <section class="box pad stack" style="gap:12px"><div><h2 class="pageh">Words</h2><p class="note" style="margin-top:6px">Look up any word, or translate a passage. Tap a word while reading and it comes here too.</p></div>
    <form class="ctl" id="wf"><input type="search" id="wq" placeholder="Look up a word…" aria-label="Look up a word"><button class="btn primary">Look up</button></form></section>
  <section class="box pad stack" style="gap:12px"><div class="spread"><span class="label">Translator</span>${langSelect("tLang", lang)}</div>
    <textarea id="tIn" aria-label="Text to translate" placeholder="Paste or type English here"></textarea>
    <div class="row"><button class="btn primary" id="tGo">Translate</button>${SAMPLE ? `<button class="btn" id="tPlain">Plain English</button>` : ""}</div><div id="tOut"></div></section>
  <section class="box"><div class="sechead"><span class="label">Saved words · ${saved.length}</span></div>${saved.length ? `<div class="pad chiprow">${saved.map((x) => `<button class="chip" data-wd="${esc(x.w)}">${esc(x.w)}</button>`).join("")}</div>` : `<div class="empty">Words you save appear here.</div>`}</section>
  ${keep.length ? `<section class="box"><div class="sechead"><span class="label">Marked passages · ${keep.length}</span></div>${keep.slice(0, 50).map((k) => `<button class="hit" data-hit="${k.id}|${k.ch}"><small>${esc(k.title)}</small><span>${esc(k.text.length > 240 ? k.text.slice(0, 236) + " …" : k.text)}</span></button>`).join("")}</section>` : ""}
  ${recent.length ? `<section class="box"><div class="sechead"><span class="label">Recently looked up</span></div><div class="pad chiprow">${recent.slice(0, 30).map((x) => `<button class="chip" data-wd="${esc(x.w)}">${esc(x.w)}</button>`).join("")}</div></section>` : ""}`;
  $("#wf").onsubmit = (e) => { e.preventDefault(); const w = $("#wq").value.trim().split(/\s+/)[0]; if (w) openWord(w, null); };
  $$("[data-wd]").forEach((b) => (b.onclick = () => openWord(b.dataset.wd, null)));
  bindHits();
  $("#tLang").onchange = () => L.set("lang", $("#tLang").value);
  $("#tGo").onclick = async () => {
    const t = $("#tIn").value.trim(), l = $("#tLang").value, o = $("#tOut"); if (!t) { $("#tIn").focus(); return; }
    L.set("lang", l); o.innerHTML = `<div class="tr big"><span class="spin"></span></div>`;
    const r = await translate(t, l);
    o.innerHTML = r ? `<div class="tr big"></div><p class="note" style="margin-top:6px">${esc(langName(l))} · translated by ${esc(r.via)}.</p>` : `<p class="note">This browser can't translate on its own. <a href="${esc(gtLink(t, l))}" target="_blank" rel="noopener">Open it in Google Translate ↗</a></p>`;
    if (r) o.querySelector(".tr").textContent = r.text;
  };
  const tp = $("#tPlain"); if (tp) tp.onclick = async () => { const t = $("#tIn").value.trim(), o = $("#tOut"); if (!t) return; o.innerHTML = `<div class="tr big"><span class="spin"></span></div>`; const r = await plainEnglish(t); o.innerHTML = r ? `<div class="tr big"></div>` : `<p class="note">Couldn't reach Claude just now.</p>`; if (r) o.querySelector(".tr").textContent = r; };
}

/* ============ footer + start ============ */
$("#foot").innerHTML = `Tozer's writings here are public domain in the United States: <i>The Pursuit of God</i> (1948, not renewed), <i>Paths to Power</i> (no year in its copyright notice), and his editorials and articles in <i>The Alliance Weekly</i> and <i>The Alliance Witness</i> (1950–63, not renewed). Bible: King James Version and World English Bible. Dictionary: Webster's Unabridged (1913), WordNet 3.1 (Princeton University), Easton's Bible Dictionary (1897). Your saved words and marks stay in this browser.`;
render();
