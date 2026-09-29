// One-off: prepares data/pursuit-of-god.json from the Standard Ebooks edition (public domain).
// Run: node tools/prep-books.mjs
import fs from "node:fs";
const SE = "https://raw.githubusercontent.com/standardebooks/a-w-tozer_the-pursuit-of-god/master/src/epub/";
const get = async (u) => { for (let i = 0; i < 4; i++) { try { const r = await fetch(u); if (r.ok) return await r.text(); } catch (e) {} await new Promise((r) => setTimeout(r, 800 * (i + 1))); } throw new Error("fetch failed " + u); };
const ent = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const tx = (x) => ent(x.replace(/<a[^>]*noteref[^>]*>[\s\S]*?<\/a>/g, "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")).replace(/⁠/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();

function body(x) {
  const out = [];
  const hdr = x.match(/<header>([\s\S]*?)<\/header>/);
  if (hdr) for (const q of hdr[1].matchAll(/<blockquote[^>]*epigraph[^>]*>([\s\S]*?)<\/blockquote>/g)) {
    const cite = q[1].match(/<cite>([\s\S]*?)<\/cite>/), b = q[1].replace(/<cite>[\s\S]*?<\/cite>/, "");
    out.push("> " + [...b.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => tx(m[1])).join(" ") + (cite ? " — " + tx(cite[1]) : ""));
  }
  let rest = x.replace(/<header>[\s\S]*?<\/header>/g, "").replace(/<hgroup>[\s\S]*?<\/hgroup>/g, "").replace(/<h\d[^>]*>[\s\S]*?<\/h\d>/g, "");
  rest = rest.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (_, b) => [...b.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => "<p>\u0001" + m[1] + "</p>").join(""));
  for (const m of rest.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) { const q = m[1].startsWith("\u0001"), t = tx(m[1].replace("\u0001", "")); if (t) out.push((q ? "> " : "") + t); }
  return out;
}
const opf = await get(SE + "content.opf");
const order = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => m[1]).filter((f) => /^(introduction|preface|chapter-\d+)/.test(f));
const chapters = [];
for (const f of order) {
  const x = await get(SE + "text/" + f);
  const n = x.match(/z3998:roman">([IVX]+)</), t = x.match(/<p epub:type="title">([\s\S]*?)<\/p>/) || x.match(/<title>([\s\S]*?)<\/title>/);
  let title = tx(t[1]).replace(/^[IVX]+: /, "");
  if (f.startsWith("introduction")) title = "Introduction by Samuel M. Zwemer";
  chapters.push({ t: (n ? n[1] + ". " : "") + title, p: body(x) });
}
fs.writeFileSync("data/pursuit-of-god.json", JSON.stringify({ id: "pursuit-of-god", title: "The Pursuit of God", year: 1948, chapters }));
console.log(chapters.map((c) => c.t + " (" + c.p.length + ")").join("\n"));
