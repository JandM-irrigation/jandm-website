// Marks a hosted preview as noindex. Netlify runs this only for deploy previews and branch deploys
// (see netlify.toml); production has no build step and is never touched.
//   node tools/mark-noindex.mjs [site-folder]   (default: the repository root, as Netlify publishes it)
// Adds <meta name="robots" content="noindex, nofollow"> to every HTML page and an
// X-Robots-Tag: noindex header for every path through Netlify's _headers file. robots.txt is left
// crawlable on purpose: a crawler has to fetch a page to see its noindex.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CONTEXT === "production") {
  console.error("Refusing to mark the production deploy noindex.");
  process.exit(1);
}
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const SKIP = new Set([".git", "node_modules", ".private", ".preview", "netlify", "tools"]);
const META = '<meta name="robots" content="noindex, nofollow">';

let pages = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".html")) {
      let html = fs.readFileSync(full, "utf8");
      html = html.replace(/<meta name="robots"[^>]*>\s*/g, "");
      if (!/<head[^>]*>/i.test(html)) throw new Error(`No <head> in ${full}`);
      fs.writeFileSync(full, html.replace(/<head([^>]*)>/i, (m) => `${m}\n${META}`));
      pages++;
    }
  }
})(ROOT);

const headersFile = path.join(ROOT, "_headers");
const existing = fs.existsSync(headersFile) ? fs.readFileSync(headersFile, "utf8") + "\n" : "";
fs.writeFileSync(headersFile, `${existing}/*\n  X-Robots-Tag: noindex, nofollow\n`);
console.log(`Marked ${pages} pages noindex and added an X-Robots-Tag header (context: ${process.env.CONTEXT || "local"}).`);
