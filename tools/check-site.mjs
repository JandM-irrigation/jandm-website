// Static checks for a build: URL contract, canonicals, sitemap, internal links, JSON-LD,
// headings, noindex state, old-logo references and unpublished-material leaks.
//   node tools/check-site.mjs            checks the public build in the repository root
//   node tools/check-site.mjs --preview  checks .preview/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW = process.argv.includes("--preview");
const DIR = PREVIEW ? path.join(ROOT, ".preview") : ROOT;
const SITE = "https://jmirrigationco.com";
const RETAINED = ["/", "/services.html", "/service-areas.html", "/about.html", "/contact.html", "/sprinkler-installation.html", "/sprinkler-repair.html", "/sprinkler-blowouts.html", "/spring-start-up.html", "/sod-installation.html", "/sprinkler-services-denver.html", "/sprinkler-services-aurora.html", "/sprinkler-services-commerce-city.html", "/sprinkler-services-thornton.html", "/sprinkler-services-parker.html", "/sprinkler-services-castle-rock.html", "/sprinkler-services-larkspur.html", "/sprinkler-services-colorado-springs.html", "/privacy.html", "/terms.html"];
// The featured project (tools/, or git-ignored .private/ while unpublished). An unpublished project must
// leave no page, photo or marker text in the public build.
const FEATURED_FILE = [path.join(ROOT, "tools", "featured-project.mjs"), path.join(ROOT, ".private", "featured-project.mjs")].find((f) => fs.existsSync(f));
const featured = FEATURED_FILE ? (await import(pathToFileURL(FEATURED_FILE).href)).default : null;
const PROJECT = featured ? featured.url : null;
// Claims that stay out of the public build until the owner confirms them (FACTS in site-data.mjs).
const UNCONFIRMED = ["$75", "1-year warranty", "blowout is free", "blowout is on us", "20+ years", "20 years"];
const fileFor = (u) => path.join(DIR, u === "/" ? "index.html" : u.slice(1));
const fails = []; let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

const pages = [...RETAINED, ...(PROJECT && (PREVIEW || featured.publish) ? [PROJECT] : []), "/404.html"];
if (PROJECT && !featured.publish) ok(PREVIEW || !fs.existsSync(fileFor(PROJECT)), "public build contains the unpublished project page");
ok(PREVIEW || featured?.publish || !fs.existsSync(path.join(DIR, "images", "projects")), "public build contains unpublished project images");
for (const u of RETAINED) ok(fs.existsSync(fileFor(u)), `missing retained URL ${u}`);

const sitemap = fs.readFileSync(path.join(DIR, "sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const EXPECTED = [...RETAINED, ...(PROJECT && featured.publish ? [PROJECT] : [])];
ok(JSON.stringify(locs.sort()) === JSON.stringify(EXPECTED.map((u) => SITE + u).sort()), `sitemap does not list exactly the 20 retained URLs plus any published project (${locs.length})`);

let links = 0;
for (const u of pages) {
  const html = fs.readFileSync(fileFor(u), "utf8");
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const ogUrl = (html.match(/<meta property="og:url" content="([^"]+)"/) || [])[1];
  if (u !== "/404.html") {
    ok(canonical === SITE + u, `${u}: canonical ${canonical}`);
    ok(ogUrl === canonical, `${u}: og:url differs from canonical`);
  }
  ok((html.match(/<h1[\s>]/g) || []).length === 1, `${u}: not exactly one h1`);
  ok(/<html lang="en">/.test(html) && /<main id="main">/.test(html) && /class="skip" href="#main"/.test(html), `${u}: landmark/skip link missing`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) ok(/\balt="[^"]+"/.test(m[0]) && /\bwidth="\d+"/.test(m[0]) && /\bheight="\d+"/.test(m[0]), `${u}: image missing alt or dimensions: ${m[0].slice(0, 80)}`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      for (const node of data["@graph"] || []) {
        if (node["@type"] === "BreadcrumbList") for (const it of node.itemListElement) ok(html.includes(`href="${it.item.replace(SITE, "")}"`) || it.position === node.itemListElement.length, `${u}: breadcrumb ${it.item} not a visible link`);
        if (node["@id"] === SITE + "/#business") ok(node.logo === SITE + "/images/brand/jm-official-logo-364.webp", `${u}: schema logo is not the official artwork`);
      }
    } catch (e) { ok(false, `${u}: JSON-LD does not parse`); }
  }
  ok(PREVIEW ? /<meta name="robots" content="noindex, nofollow">/.test(html) : (u === "/404.html" || !/name="robots"[^>]*noindex/.test(html)), `${u}: wrong noindex state for this build`);
  ok(!/logo\.svg|favicon\.svg|#mark"|site\.css/.test(html), `${u}: references the old substitute logo or old stylesheet`);
  ok(!/googletagmanager/.test(html) === PREVIEW, `${u}: analytics tag state wrong for this build`);
  if (!PREVIEW && featured && !featured.publish) for (const m of featured.leakMarkers) ok(!html.includes(m), `${u}: public build contains unpublished project material (${m})`);
  if (!PREVIEW) for (const m of UNCONFIRMED) ok(!html.includes(m), `${u}: public build contains an unconfirmed claim (${m})`);
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const target = m[1];
    if (target.startsWith("//")) continue;
    links++;
    const f = target === "/" ? path.join(DIR, "index.html") : path.join(DIR, target.slice(1));
    ok(fs.existsSync(f), `${u}: broken internal link ${target}`);
  }
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(",")) { const src = part.trim().split(" ")[0]; links++; ok(fs.existsSync(path.join(DIR, src.slice(1))), `${u}: missing srcset file ${src}`); }
  ok(!/(?:href|src)="(?!https?:|\/|#|tel:|sms:|mailto:)/.test(html), `${u}: relative URL found (breaks on nested paths)`);
}
console.log(`${PREVIEW ? "Preview" : "Public"} build: ${checks} checks, ${links} internal links/assets verified, ${fails.length} failure(s).`);
for (const f of fails) console.log("FAIL " + f);
process.exit(fails.length ? 1 : 0);
