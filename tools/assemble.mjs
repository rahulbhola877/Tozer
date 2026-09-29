// Builds index.html (the site) and ../tozer-artifact.html (Claude artifact form) from src/
import fs from "node:fs";
const head = fs.readFileSync("src/head.html", "utf8"), body = fs.readFileSync("src/body.html", "utf8"), js = fs.readFileSync("src/app.js", "utf8");
const page = head + "\n" + body + "\n<script>\n" + js + "\n</script>\n";
const meta = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Read every public-domain writing of A. W. Tozer alongside the Bible, with a built-in dictionary and translator.">
<meta name="theme-color" content="#F1F1EE" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111214" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
`;
const [h1, h2] = [page.slice(0, page.indexOf("</style>") + 8), page.slice(page.indexOf("</style>") + 8)];
fs.writeFileSync("index.html", meta + h1 + "\n</head>\n<body>\n" + h2 + "</body>\n</html>\n");
fs.writeFileSync("../tozer-artifact.html", page);
console.log("ok", page.length);
