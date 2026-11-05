// Builds the J&M Irrigation Services static site from tools/site-data.mjs and content/site.json.
//
//   node tools/build.mjs            public build: writes the pages into the repository root
//                                   (what Netlify publishes). A featured project with publish: false is left out.
//   node tools/build.mjs --preview  local review build in .preview/ (git-ignored): every page is
//                                   noindex, analytics is not loaded, and unconfirmed facts and the
//                                   unpublished featured project are included for review.
//
// The featured project is defined in tools/featured-project.mjs. Public builds include it only when it
// sets publish: true; an unpublished project can be kept in git-ignored .private/ until approved.
//
// No dependencies. The HTML is committed, so Netlify needs no build step. CMS edits to
// content/site.json still show on the live site through js/main.js; rebuild to bake them in.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SITE, BUSINESS_ID, EMAIL, FACTS, FACTS_CONFIRMED, LOGO_ALT, WORK, BEFORE_AFTER, SERVICES, NOT_SURE, CITIES, SCOPES,
} from "./site-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW = process.argv.includes("--preview");
const OUT = PREVIEW ? path.join(ROOT, ".preview") : ROOT;
const content = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "site.json"), "utf8"));
const PHONE = content.phone || "303-549-0712";
const HOURS = content.hours || "Mon–Sat, 7am–5pm";
const TEL = "tel:+1" + PHONE.replace(/\D/g, "").slice(-10);
const SMS = TEL.replace("tel:", "sms:");
const BANNER = (() => {
  const [m, d] = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", month: "numeric", day: "numeric" }).format(new Date()).split("/").map(Number);
  const t = m * 100 + d, md = (x) => { const [a, b] = String(x || "").split("-").map(Number); return a * 100 + b; };
  return (content.banners || []).find((b) => { const a = md(b.start), z = md(b.end); return b.text && a && z && (a <= z ? t >= a && t <= z : t >= a || t <= z); }) || null;
})();
const REVIEW_URL = /^https:\/\//.test(content.google_review_url || "") ? content.google_review_url : "";

// Unconfirmed business facts show only in the local review build until the owner confirms them.
const SHOW_FACTS = FACTS_CONFIRMED || PREVIEW;
const fact = (key) => (SHOW_FACTS ? FACTS[key] : "");
const FEATURED_FILE = [path.join(ROOT, "tools", "featured-project.mjs"), path.join(ROOT, ".private", "featured-project.mjs")].find((f) => fs.existsSync(f));
const featuredModule = FEATURED_FILE ? (await import(pathToFileURL(FEATURED_FILE).href)).default : null;
const featuredDef = featuredModule && (featuredModule.publish || PREVIEW) ? featuredModule : null;

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex").slice(0, 10);
const CSS_V = hash("assets/jm.css");
const JS_V = hash("js/main.js");
const svc = (key) => SERVICES.find((s) => s.key === key);
const city = (key) => CITIES.find((c) => c.key === key);
const abs = (p) => SITE + (p === "/" ? "/" : p);
const ARROW = '<svg class="arrow" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10h11m-4.5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function excerpt(text, max = 300) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return (end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "))) + " …";
}

function workImg(key, { eager = false, cls = "", sizes = "(min-width: 1024px) 55vw, 100vw" } = {}) {
  const p = WORK[key];
  const load = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"';
  return `<img class="${cls}" src="${p.src}" sizes="${sizes}" width="${p.w}" height="${p.h}" alt="${esc(p.alt)}" ${load}>`;
}

// A real J&M job photo for each service card and service page hero.
const SERVICE_PHOTO = { repair: "repair", install: "install", blowouts: "freeze", startup: "heads", sod: "sod" };

// Before/after comparison: the after photo underneath, the before photo clipped on top. The range
// input gives keyboard control; pointer dragging (mouse and touch) is handled in js/main.js.
function compareSlider(key, { sizes = "(min-width: 1024px) 33vw, 100vw" } = {}) {
  const p = BEFORE_AFTER[key];
  const img = (x) => `<img class="ba-img" src="${x.src}" sizes="${sizes}" width="900" height="1200" alt="${esc(x.alt)}" loading="lazy" decoding="async">`;
  return `<figure class="ba">
<div class="compare" data-compare style="--pos:50%">
${img(p.after)}
<div class="ba-before">${img(p.before)}</div>
<span class="ba-tag ba-tag--before" aria-hidden="true">Before</span><span class="ba-tag ba-tag--after" aria-hidden="true">After</span>
<span class="ba-handle" aria-hidden="true"><span></span></span>
<input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Compare before and after: ${esc(p.caption)}" aria-valuetext="Half before, half after">
</div>
<figcaption>${esc(p.caption)}</figcaption>
</figure>`;
}

// Image-led service cards (home, services hub and city pages).
function serviceCards(items = SERVICES, { cityName = "", headingLevel = 3 } = {}) {
  return `<ul class="cards cards--${items.length}">${items.map((s, i) => `<li class="card" data-reveal style="--i:${i}">
<a class="card__link" href="${s.path}">
<span class="card__media">${workImg(SERVICE_PHOTO[s.key], { cls: "card__img", sizes: i < 2 ? "(min-width: 1024px) 45vw, 100vw" : "(min-width: 1024px) 30vw, 100vw" })}</span>
<span class="card__body">
<h${headingLevel} class="card__name">${esc(s.rowName || s.name)}${cityName ? `<span class="visually-hidden"> in ${esc(cityName)}</span>` : ""}</h${headingLevel}>
<span class="card__text">${esc(s.rowSummary || s.summary)}</span>
<span class="card__go">See details ${ARROW}</span>
</span>
</a>
</li>`).join("")}</ul>`;
}

// A short strip of real job photos.
function photoStrip(keys, label) {
  return `<ul class="strip" aria-label="${esc(label)}">${keys.map((k, i) => `<li class="strip__item" data-reveal="image" style="--i:${i}">${workImg(k, { cls: "strip__img", sizes: "(min-width: 768px) 33vw, 100vw" })}</li>`).join("")}</ul>`;
}

const btn = (href, label, { variant = "primary", placement = "", attrs = "" } = {}) =>
  `<a class="btn btn--${variant}" href="${href}"${placement ? ` data-placement="${placement}"` : ""}${attrs}>${label}</a>`;
const callBtn = (placement, variant = "secondary") => btn(TEL, `Call ${esc(PHONE)}`, { variant, placement, attrs: " data-phone-link" });

/* ---------- forms ---------- */
function serviceOptions(selected = "") {
  return [...SERVICES, NOT_SURE].map((s) =>
    `<option value="${esc(s.value)}" data-slug="${s.slug}"${s.value === selected ? " selected" : ""}>${esc(s.name)}</option>`).join("");
}

function field(id, label, input, hint = "") {
  return `<div class="field">
<label for="${id}">${label}</label>${hint ? `<p class="field__hint" id="${id}-hint">${hint}</p>` : ""}
${input}
<p class="field__error" id="${id}-error" hidden></p>
</div>`;
}

const LOCATIONS = [...CITIES.map((c) => c.name), "Elsewhere in Douglas County", "Elsewhere in El Paso County", "Somewhere else"];

function leadForm({ name = "quote", idPrefix = "q", selected = "", cityName = "", extended = false, button = "Request a quote" } = {}) {
  const p = idPrefix;
  const opts = (list, sel = "") => list.map((x) => `<option${x === sel ? " selected" : ""}>${esc(x)}</option>`).join("");
  const core = [
    field(`${p}-name`, "Full name", `<input id="${p}-name" name="full_name" type="text" autocomplete="name" required aria-describedby="${p}-name-error">`),
    field(`${p}-phone`, "Phone", `<input id="${p}-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required aria-describedby="${p}-phone-error">`),
    field(`${p}-email`, "Email <span class=\"optional\">(optional)</span>", `<input id="${p}-email" name="email" type="email" autocomplete="email" aria-describedby="${p}-email-error">`),
    field(`${p}-city`, "Project location", `<select id="${p}-city" name="city" required aria-describedby="${p}-city-error"><option value="">Choose the city or area</option>${opts(LOCATIONS, cityName)}</select>`),
    field(`${p}-service`, "Project type", `<select id="${p}-service" name="service_needed" required aria-describedby="${p}-service-error"><option value="">Choose a project type</option>${serviceOptions(selected)}</select>`),
    field(`${p}-scope`, "Approximate size <span class=\"optional\">(optional)</span>", `<select id="${p}-scope" name="project_scope" aria-describedby="${p}-scope-error"><option value="">Choose the closest size</option>${SCOPES.map((s) => `<option data-slug="${s.slug}">${esc(s.label)}</option>`).join("")}</select>`),
    field(`${p}-message`, "Tell us more <span class=\"optional\">(optional)</span>", `<textarea id="${p}-message" name="message" rows="4" aria-describedby="${p}-message-error"></textarea>`),
  ];
  const more = extended ? [
    field(`${p}-language`, "Preferred language <span class=\"optional\">(optional)</span>", `<select id="${p}-language" name="language" aria-describedby="${p}-language-error"><option value="">No preference</option><option>English</option><option>Español</option></select>`),
  ] : [];
  return `<div class="lead" data-lead>
<form class="lead__form" name="${name}" method="POST" action="/" data-netlify="true" netlify-honeypot="company" data-lead-form data-form-id="${name}">
<input type="hidden" name="form-name" value="${name}">
<div class="hp" aria-hidden="true"><label>Leave this empty <input name="company" tabindex="-1" autocomplete="off"></label></div>
${[...core, ...more].join("\n")}
${SHOW_FACTS ? `<p class="price-note" data-price-note data-note-repair="${esc(FACTS.diagnosticShort)}" data-note-installation="${esc(FACTS.freeEstimate)}" hidden></p>\n` : ""}<button class="btn btn--primary btn--block" type="submit">${button}</button>
<p class="lead__error" data-form-error role="alert" hidden>Your request did not go through. Please try again, or call or text <a href="${TEL}" data-phone-link data-placement="form">${esc(PHONE)}</a>.</p>
</form>
<div class="lead__success" data-form-success tabindex="-1" hidden>
<p class="lead__success-title">Thanks. Your request has been received. J&amp;M will contact you about the next step.</p>
<p class="lead__preview" data-preview-note hidden>Preview only — this request was not sent.</p>
</div>
</div>`;
}

function quoteBlock({ heading = "Tell us about your project.", copy = "Share the location, the type of project and its rough size. J&amp;M will get back to you about the next step.", selected = "", cityName = "", id = "quote", button = "Request a quote" } = {}) {
  return `<section class="section section--forest" id="${id}" aria-labelledby="${id}-title">
<div class="wrap grid-12 quote">
<div class="quote__intro">
<h2 id="${id}-title">${heading}</h2>
<p>${copy}</p>
<ul class="contact-list">
<li><span class="label">Call or text</span> <a href="${TEL}" data-phone-link data-phone-text data-placement="quote">${esc(PHONE)}</a></li>
<li><span class="label">Text</span> <a href="${SMS}" data-sms-link data-placement="quote">Send a text</a></li>
<li><span class="label">Hours</span> <span data-hours>${esc(HOURS)}</span></li>
<li><span class="label">Language</span> English or Spanish</li>
</ul>
</div>
<div class="quote__form">${leadForm({ selected, cityName, idPrefix: id, button })}</div>
</div>
</section>`;
}

/* ---------- shared layout ---------- */
function nav(current) {
  const items = [
    ["/services.html", "Services"],
    ...(featured ? [[featured.url, featured.navLabel]] : []),
    ["/service-areas.html", "Service Areas"],
    ["/about.html", "About"],
    ["/contact.html", "Contact"],
  ];
  return items.map(([href, label]) => `<li><a href="${href}"${href === current ? ' aria-current="page"' : ""}>${label}</a></li>`).join("");
}

// Full official lockup at its source proportions (168×182 CSS px; CSS scales it to 152×165 below 1024px).
function logoImg(eager = false) {
  return `<img class="logo" src="/images/brand/jm-official-logo-168.webp" srcset="/images/brand/jm-official-logo-168.webp 1x, /images/brand/jm-official-logo-336.webp 2x" width="168" height="182" alt="${esc(LOGO_ALT)}"${eager ? "" : ' loading="lazy" decoding="async"'}>`;
}

function header(current) {
  return `<header class="masthead">
<div class="wrap masthead__inner">
<a class="masthead__brand" href="/">${logoImg(true)}</a>
<nav class="masthead__nav" aria-label="Main"><ul>${nav(current)}</ul></nav>
<div class="masthead__actions">
<a class="masthead__phone" href="${TEL}" data-phone-link data-placement="header"><span data-phone-text>${esc(PHONE)}</span></a>
${btn("/contact.html#quote", "Request a quote", { placement: "header" })}
</div>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle hidden>
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<span>Menu</span>
</button>
</div>
<nav class="mobile-menu" id="mobile-menu" aria-label="Main (mobile)">
<ul class="wrap">${nav(current)}<li><a href="${TEL}" data-phone-link data-placement="menu">Call&nbsp;<span data-phone-text>${esc(PHONE)}</span></a></li></ul>
</nav>
</header>`;
}

function footer() {
  return `<footer class="footer">
<div class="wrap footer__grid">
<div class="footer__brand">
<a class="footer__logo" href="/">${logoImg()}</a>
<p>Sprinkler repair, installation, seasonal service and sod across Denver and the Front Range. Hablamos español.</p>
</div>
<div>
<h2 class="footer__title">Contact</h2>
<ul class="footer__list">
<li><a href="${TEL}" data-phone-link data-placement="footer">Call&nbsp;<span data-phone-text>${esc(PHONE)}</span></a></li>
<li><a href="${SMS}" data-sms-link data-placement="footer">Text ${esc(PHONE)}</a></li>
<li><a href="mailto:${EMAIL}">${EMAIL}</a></li>
<li><span data-hours>${esc(HOURS)}</span></li>
</ul>
</div>
<div>
<h2 class="footer__title">Services</h2>
<ul class="footer__list">${SERVICES.map((s) => `<li><a href="${s.path}">${s.name}</a></li>`).join("")}</ul>
</div>
<div>
<h2 class="footer__title">Service areas</h2>
<ul class="footer__list">${CITIES.map((c) => `<li><a href="${c.path}">${esc(c.name)}</a></li>`).join("")}</ul>
</div>
</div>
<div class="wrap footer__base">
<p>© <span data-year>2026</span> J&amp;M Irrigation Services</p>
<ul><li><a href="/about.html">About</a></li><li><a href="/privacy.html">Privacy</a></li><li><a href="/terms.html">Terms</a></li></ul>
</div>
<p class="wrap footer__credit">Website by <a href="https://moasolutions.net">MOA-Solutions</a></p>
</footer>
<div class="actionbar" role="region" aria-label="Quick contact">
<a class="actionbar__call" href="${TEL}" data-phone-link data-placement="bottom-bar">Call</a>
<a class="actionbar__quote" href="/contact.html#quote" data-placement="bottom-bar">Request a quote</a>
</div>`;
}

function breadcrumbs(items) {
  if (!items || items.length < 2) return "";
  return `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${items.map((it, i) =>
    i === items.length - 1 ? `<li><span aria-current="page">${esc(it.name)}</span></li>` : `<li><a href="${it.path}">${esc(it.name)}</a></li>`).join("")}</ol></nav>`;
}

const businessNode = (full = false) => {
  const node = {
    "@type": "HomeAndConstructionBusiness",
    "@id": BUSINESS_ID,
    name: "J&M Irrigation Services",
    url: SITE + "/",
    logo: SITE + "/images/brand/jm-official-logo-364.webp",
    telephone: "+1-" + PHONE,
  };
  if (!full) return node;
  return {
    ...node,
    image: [SITE + "/images/brand/jm-official-logo-364.webp", SITE + WORK.hero.src],
    email: EMAIL,
    slogan: "Do It Right the First Time",
    address: { "@type": "PostalAddress", addressLocality: "Denver", addressRegion: "CO", addressCountry: "US" },
    areaServed: [...CITIES.map((c) => ({ "@type": "City", name: `${c.name}, CO` })), { "@type": "AdministrativeArea", name: "Douglas County, CO" }],
    openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "07:00", closes: "17:00" }],
    knowsLanguage: ["en", "es"],
    makesOffer: SERVICES.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s.name, url: abs(s.path) } })),
  };
};

function schemaFor(page) {
  const graph = [businessNode(page.type === "home")];
  graph.push({
    "@type": page.schemaType || "WebPage",
    "@id": abs(page.path) + "#webpage",
    url: abs(page.path),
    name: page.title,
    description: page.description,
    isPartOf: { "@type": "WebSite", "@id": SITE + "/#website", url: SITE + "/", name: "J&M Irrigation Services" },
    ...(page.schemaExtra || {}),
  });
  if (page.crumbs && page.crumbs.length > 1) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: page.crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })),
    });
  }
  if (page.service) {
    graph.push({
      "@type": "Service",
      name: page.service.name,
      serviceType: page.service.name,
      url: abs(page.path),
      provider: { "@id": BUSINESS_ID },
      areaServed: [...CITIES.filter((c) => c.key !== "colorado-springs" || page.service.springs).map((c) => ({ "@type": "City", name: `${c.name}, CO` })), { "@type": "AdministrativeArea", name: "Douglas County, CO" }],
    });
  }
  if (page.faqs && page.faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: page.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a.replace(/<[^>]+>/g, "") } })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

const ANALYTICS = `<script>
/* Google Analytics loads only on the production host, so previews and test copies send nothing. */
if (location.hostname === "jmirrigationco.com") {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", "G-NTW0DE5RLP");
  var ga = document.createElement("script"); ga.async = true; ga.src = "https://www.googletagmanager.com/gtag/js?id=G-NTW0DE5RLP"; document.head.appendChild(ga);
}
</script>`;

function layout(page) {
  const robots = PREVIEW ? '<meta name="robots" content="noindex, nofollow">' : page.noindex ? '<meta name="robots" content="noindex">' : "";
  const og = page.ogImage || WORK.hero.src;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${robots}${page.path ? `<link rel="canonical" href="${abs(page.path)}">` : ""}
<meta property="og:type" content="${page.ogType || "website"}">
<meta property="og:site_name" content="J&amp;M Irrigation Services">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
${page.path ? `<meta property="og:url" content="${abs(page.path)}">` : ""}
<meta property="og:image" content="${SITE}${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1F4D3A">
<link rel="icon" type="image/png" sizes="16x16" href="/images/brand/jm-favicon-16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/images/brand/jm-favicon-32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/images/brand/jm-favicon-48.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&amp;family=Manrope:wght@700;800&amp;display=swap">
<link rel="stylesheet" href="/assets/jm.css?v=${CSS_V}">
<script>document.documentElement.classList.add("js");setTimeout(function(){document.documentElement.classList.add("reveal-all")},3000);</script>
${PREVIEW ? "" : ANALYTICS}
${page.path ? `<script type="application/ld+json">${schemaFor(page)}</script>` : ""}
</head>
<body data-page-type="${page.type}">
<a class="skip" href="#main">Skip to content</a>
${PREVIEW ? `<p class="preview-flag">Local review build. Not published.</p>` : ""}
<div class="banner" data-banner role="region" aria-label="Seasonal announcement"${BANNER ? "" : " hidden"}><p class="wrap banner__inner"><span class="banner__text" data-banner-text>${esc(BANNER?.text || "")}</span> <a class="banner__cta" data-banner-link data-placement="banner" href="${BANNER?.button_link ? "/" + esc(String(BANNER.button_link).replace(/^\//, "")) : "/contact.html#quote"}">${esc(BANNER?.button_text || "Learn more")}</a></p></div>
${header(page.navCurrent || page.path)}
${breadcrumbs(page.crumbs)}
<main id="main">
${page.body}
</main>
${footer()}
<script src="/js/main.js?v=${JS_V}" defer></script>
</body>
</html>
`;
}

/* ---------- reusable sections ---------- */
function faqList(faqs) {
  return `<div class="faq">${faqs.map(([q, a]) => `<details class="faq__item"><summary>${esc(q)}</summary><div class="faq__body"><p>${a}</p></div></details>`).join("")}</div>`;
}

function steps() {
  return `<ol class="steps">
<li><h3>Tell us what you need.</h3><p>Call, text or send a quote request.</p></li>
<li><h3>Discuss the work.</h3><p>We will explain the next step and the price before you decide.</p></li>
<li><h3>Check the result.</h3><p>Each sprinkler zone is tested before we leave.</p></li>
</ol>`;
}

function pageHero({ eyebrow = "", h1, lead, image, actions = true, selected = "", variant = "" }) {
  return `<section class="hero${image ? "" : " hero--text"}${variant ? ` hero--${variant}` : ""}">
<div class="wrap grid-12 hero__grid">
<div class="hero__text">
${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}
<h1>${h1}</h1>
<p class="lead">${lead}</p>
${actions ? `<div class="actions">${btn("/contact.html#quote", "Request a quote", { variant: "accent", placement: "hero" })}${callBtn("hero")}</div>` : ""}
</div>
${image ? `<figure class="hero__media">${image}</figure>` : ""}
</div>
</section>`;
}

function relatedLinks(title, links) {
  return `<section class="section" aria-labelledby="related-title">
<div class="wrap">
<h2 id="related-title" class="h3">${title}</h2>
<ul class="link-list">${links.map(([href, label]) => `<li><a href="${href}">${esc(label)} ${ARROW}</a></li>`).join("")}</ul>
</div>
</section>`;
}

/* ---------- featured project hooks ---------- */
const featured = featuredDef ? { ...featuredDef, ...featuredDef.setup({ esc, ARROW, svc, city, SITE, BUSINESS_ID, quoteBlock, relatedLinks }) } : null;

/* ---------- pages ---------- */
const pages = [];

/* Home */
{
  const reviews = (content.reviews || []).filter((r) => !r.sample && r.text).slice(0, 2);
  const larger = featured ? featured.faqLargerProperties : "Tell us about your property and the work you have in mind so we can confirm whether it is a fit.";
  const faqs = [
    ["What kind of projects does J&M take on?", "New sprinkler systems for new landscapes, larger lots and acreage, full replacements of old systems, and sod installed with the new system. J&amp;M also repairs systems and handles fall blowouts and spring start-ups."],
    ["Which areas do you prioritize for new installations?", "Castle Rock and the rest of Douglas County, including Parker and Larkspur, and Colorado Springs. J&amp;M also serves Denver, including Green Valley Ranch, Aurora, Thornton and Commerce City."],
    ["Can you work on an existing system?", "Yes. J&amp;M repairs systems installed by other companies."],
    ["Do you work on larger properties?", larger],
    ["¿Hablan español?", "Sí. Puede llamar o enviar un mensaje en español."],
  ];
  const heroImage = featured
    ? featured.homeHero()
    : workImg("hero", { eager: true, cls: "hero__img hero__img--crew", sizes: "(min-width: 1024px) 50vw, 100vw" });
  const body = `<section class="hero hero--home">
<div class="wrap grid-12 hero__grid">
<div class="hero__text">
<p class="availability">Castle Rock · Douglas County · Colorado Springs · Hablamos español</p>
<h1>New Sprinkler Systems for Castle Rock, Douglas County &amp; Colorado Springs</h1>
<p class="lead">J&amp;M plans and installs complete irrigation systems for new landscapes, larger lots and acreage, then tests every zone before handing it over.</p>
<div class="actions">${btn("/contact.html#quote", "Plan a new system", { variant: "accent", placement: "hero" })}${callBtn("hero", "ghost")}</div>
<p class="support">Need a repair or seasonal service? <a href="${svc("repair").path}">Sprinkler repair</a> · <a href="${svc("blowouts").path}">Blowouts</a></p>
</div>
<div class="hero__media">
<figure class="hero__main">${heroImage}</figure>
<figure class="hero__inset">${workImg("zones", { cls: "hero__inset-img", sizes: "(min-width: 1024px) 18vw, 40vw" })}</figure>
</div>
</div>
</section>

<section class="section" aria-labelledby="install-title">
<div class="wrap grid-12 split">
<div class="split__main" data-reveal>
<h2 id="install-title">Irrigation installations, planned before the first trench.</h2>
<p class="intro">A large system only works if the layout is right. J&amp;M walks the property with you, plans zones around sun, shade, slopes and soil, then installs the pipe, valves, heads and controller and runs every zone before leaving.</p>
<h3>Projects J&amp;M takes on</h3>
<ul class="ticks"><li>New systems for new landscapes and new builds</li><li>Larger lots and acreage</li><li>Full replacements of old or failing systems</li><li>New sod installed with the system, watered from day one</li></ul>
<div class="actions">${btn(svc("install").path, "How installations work", { variant: "primary", placement: "install" })}${btn("/contact.html#quote", "Plan a new system", { variant: "secondary", placement: "install" })}</div>
</div>
<figure class="split__side split__photo" data-reveal="image">${workImg("install", { cls: "split__img", sizes: "(min-width: 1024px) 40vw, 100vw" })}</figure>
</div>
</section>

${featured ? featured.homeFeature() : ""}

<section class="section proof" aria-labelledby="proof-title">
<div class="wrap">
<div class="section-head">
<h2 id="proof-title">See the difference.</h2>
<p>Real J&amp;M jobs, photographed before and after. Drag the handle, or use the arrow keys, to compare.</p>
</div>
<div class="proof__grid">${["patio", "street", "sod"].map((k) => compareSlider(k)).join("")}</div>
</div>
</section>

<section class="section section--pale" aria-labelledby="services-title">
<div class="wrap">
<div class="section-head section-head--split">
<h2 id="services-title">Installations first. Repairs and seasonal care too.</h2>
<a class="text-link" href="/services.html">All services ${ARROW}</a>
</div>
${serviceCards()}
</div>
</section>

<section class="season" aria-labelledby="season-title">
<div class="wrap grid-12 season__grid">
<div class="season__text" data-reveal>
<h2 id="season-title">Keep the system healthy between seasons.</h2>
<p>Water left in sprinkler lines expands when it freezes. On the Front Range, a single cold night can crack pipes, valves and backflow devices. In spring, a careful start-up catches problems before they waste water.</p>
<div class="actions">${btn(svc("blowouts").path, "Book a blowout", { variant: "accent", placement: "season" })}${btn(svc("startup").path, "Spring start-ups", { variant: "ghost", placement: "season" })}</div>
</div>
<figure class="season__media" data-reveal="image">${workImg("shed", { cls: "season__img", sizes: "(min-width: 1024px) 50vw, 100vw" })}</figure>
</div>
</section>

<section class="section" aria-labelledby="people-title">
<div class="wrap grid-12 people">
<div class="people__intro" data-reveal>
<h2 id="people-title">Do it right the first time.</h2>
<p>Juan's approach is straightforward: plan the work, explain it before it starts and check the system before leaving. That matters most on a large installation, where a poor layout costs water and repairs for years.</p>
<a class="text-link" href="/about.html">Meet J&amp;M ${ARROW}</a>
<div class="people__steps">${steps()}</div>
</div>
<div class="mosaic" aria-label="J&amp;M job photos" role="group">
<figure class="mosaic__a" data-reveal="image">${workImg("pines", { cls: "mosaic__img", sizes: "(min-width: 1024px) 45vw, 100vw" })}</figure>
<figure class="mosaic__b" data-reveal="image" style="--i:1">${workImg("patio", { cls: "mosaic__img", sizes: "(min-width: 1024px) 22vw, 50vw" })}</figure>
<figure class="mosaic__c" data-reveal="image" style="--i:2">${workImg("street", { cls: "mosaic__img", sizes: "(min-width: 1024px) 22vw, 50vw" })}</figure>
</div>
</div>
</section>

${reviews.length ? `<section class="section section--forest reviews" aria-labelledby="reviews-title">
<div class="wrap">
<h2 id="reviews-title">From J&amp;M customers.</h2>
<div class="quotes" data-reviews>${reviews.map((r) => `<figure class="quote-col"><blockquote><p>${esc(excerpt(r.text))}</p></blockquote><figcaption>${esc(r.name)}${r.when ? `, ${esc(r.when)}` : ""} · Google review</figcaption></figure>`).join("")}</div>
${REVIEW_URL ? `<a class="text-link" href="${REVIEW_URL}" data-review-link rel="noopener" target="_blank">Read J&amp;M's reviews on Google ${ARROW}</a>` : ""}
</div>
</section>` : ""}

<section class="section" aria-labelledby="areas-title">
<div class="wrap grid-12 areas">
<div class="areas__intro">
<h2 id="areas-title">Castle Rock, Douglas County and Colorado Springs.</h2>
<p>New installations are J&amp;M's focus in Castle Rock and across Douglas County, including Parker and Larkspur, and in Colorado Springs. J&amp;M is based in Denver and also serves Denver, including Green Valley Ranch, Aurora, Thornton and Commerce City.</p>
<a class="text-link" href="/service-areas.html">All service areas ${ARROW}</a>
</div>
<ul class="area-links">${CITIES.map((c) => `<li><a href="${c.path}">${esc(c.label)}</a></li>`).join("")}</ul>
</div>
</section>

<section class="section section--pale" aria-labelledby="faq-title">
<div class="wrap grid-12 faq-wrap">
<h2 id="faq-title">Before you request a quote.</h2>
${faqList(faqs)}
</div>
</section>

${quoteBlock()}`;
  pages.push({
    file: "index.html", path: "/", type: "home",
    title: "New Sprinkler Systems in Castle Rock & Colorado Springs | J&M Irrigation",
    description: "Irrigation system installation for larger lots and acreage in Castle Rock, Douglas County and Colorado Springs, plus repairs, blowouts and sod. Call 303-549-0712.",
    faqs, body, ogImage: WORK.hero.src,
  });
}

/* Service pages */
const SERVICE_PAGES = [
  {
    key: "repair", file: "sprinkler-repair.html", photo: "repair", gallery: ["heads", "zones", "freeze"],
    title: "Sprinkler Repair in Denver, CO | J&M Irrigation",
    description: "Dry spots, leaks or a zone that won't run? J&M finds the cause, explains the price before the repair and checks the zone after. Call or text 303-549-0712.",
    h1: "Sprinkler Repair in Denver, CO",
    lead: "We find the real cause of the problem so you are not calling someone again next month.",
    intro: "Juan started J&amp;M after seeing too many homeowners pay twice for repairs that should have been done right the first time. We check the whole zone, not just the broken part.",
    listTitle: "Signs your system needs a repair",
    list: ["Brown or dry patches in part of the lawn", "Soggy spots or standing water", "A water bill that jumped for no clear reason", "Heads that will not pop up, spray the sidewalk or do not turn", "A zone that will not turn on or will not shut off", "A controller that is blank or skipping zones"],
    scopeTitle: "What we repair",
    scope: "Sprinkler heads, leaking pipes and fittings, valves, wiring and controllers, and coverage problems.",
    process: [["Diagnose", "We check the system to find what is causing the problem."], ["Explain and price", "We show you what we found and give you the price before any repair."], ["Repair what you approve", "We do the work you authorize, nothing extra without asking."], ["Check the zone", "We run the repaired zones to confirm they work before we leave."]],
    pricing: fact("diagnostic"),
    faqs: [
      ["Can you fix a system another company installed?", "Yes. J&amp;M repairs systems installed by other companies."],
      ["What should I tell J&M when I reach out?", "What you are seeing (dry spots, a leak, a zone that will not run), where the property is and roughly when the problem started."],
      ["Will you do more work than I agreed to?", "No. If we find more than expected, we explain it and give you the price before doing any additional work."],
      ...(SHOW_FACTS ? [["Why is there a $75 diagnostic fee?", "Finding the real cause takes time and testing. The fee is waived when you have us do the repair."]] : []),
    ],
    related: ["install", "startup", "blowouts"],
  },
  {
    key: "install", file: "sprinkler-installation.html", photo: "install", proof: ["street", "patio"],
    title: "Sprinkler System Installation in Castle Rock, Colorado Springs & Denver | J&M Irrigation",
    description: "New irrigation systems for larger lots, acreage and new landscapes in Castle Rock, Douglas County, Colorado Springs and Denver: zone plan, install, controller, full test.",
    h1: "Sprinkler System Installation for Castle Rock, Douglas County, Colorado Springs &amp; Denver",
    lead: "Complete new irrigation systems for new landscapes, larger lots and acreage, planned for your soil, slopes and Colorado's weather.",
    intro: "A sprinkler system is only as good as its install. On a large property a poor layout means dry spots, wasted water and years of repairs, so J&amp;M plans every zone around the land before trenching starts.",
    listTitle: "Projects J&amp;M takes on",
    list: ["New systems for new landscapes and new builds", "Larger lots and acreage", "Full replacements of old or failing systems", "New sod installed with the system"],
    scopeTitle: "What to have ready for an estimate",
    scope: "The property's location and rough size, the areas that need water, whether there is an old system, and whether new sod is planned. J&amp;M can install the system and lay the sod together, so the new lawn is watered from day one.",
    process: [["Walkthrough and estimate", ("We look at the yard with you and give you an estimate. " + fact("freeEstimate")).trim()], ["Zone plan", "Zones are laid out for sun, shade and slopes, and we explain the components and controller before work begins."], ["Installation", "Trenching, pipe, valves and sprinkler heads."], ["Controller setup", "The controller is set up and programmed for your zones."], ["Final test", "Every zone is run and checked before we leave."]],
    pricing: `${fact("freeEstimate")} ${fact("warranty")}`.trim(),
    faqs: [
      ...(SHOW_FACTS ? [["Is the estimate free?", FACTS.freeEstimate]] : []),
      ["Do you install systems on larger properties and acreage?", "Yes. Larger installations are J&amp;M's focus, especially in Castle Rock, Douglas County and Colorado Springs. Share the location and rough size in your request so we can plan the walkthrough."],
      ["Can you install sod at the same time?", "Yes. Doing both together saves time and makes sure the new lawn is watered from day one."],
      ...(SHOW_FACTS ? [["Do you offer a warranty?", FACTS.warranty]] : []),
    ],
    related: ["sod", "repair", "blowouts"],
  },
  {
    key: "blowouts", file: "sprinkler-blowouts.html", photo: "freeze", gallery: ["repair", "heads", "zones"],
    title: "Sprinkler Blowouts & Winterization in Denver, CO | J&M Irrigation",
    description: "Clear the water from your sprinkler system before freezing weather. J&M blowouts across Denver and the Front Range. Call or text 303-549-0712.",
    h1: "Sprinkler Blowouts &amp; Winterization in Denver, CO",
    lead: "Protect your sprinkler system from cracked pipes and costly spring repairs.",
    intro: "Water left in sprinkler lines expands when it freezes. On the Front Range, a single cold night can crack pipes, valves and backflow devices. A blowout clears the water out with compressed air.",
    listTitle: "What affects the price",
    list: ["How many zones your system has", "How easy the shutoff and backflow device are to reach", "Anything that needs fixing before the system can be cleared"],
    scopeTitle: "When to book",
    scope: "Book before freezing weather arrives. Most Front Range homeowners book in October, and spots fill quickly once cold weather is in the forecast. Weather varies, so there is no date that is guaranteed to be safe.",
    process: [["Shut off", "We shut off the water to the system."], ["Clear each zone", "Each zone is cleared with compressed air."], ["Drain the backflow", "The backflow device is drained."], ["Controller off", "Your controller is set to off for the winter."]],
    pricing: fact("firstBlowout"),
    faqs: [
      ["Do I need to be home?", "It is best if you are. That way we can reach the shutoff and backflow, and walk you through anything we find."],
      ...(SHOW_FACTS ? [["Is my first blowout free?", FACTS.firstBlowout]] : []),
      ["Can I skip a year?", "It is a gamble. One hard freeze can cause repairs that cost much more than a blowout."],
    ],
    related: ["startup", "repair", "install"],
  },
  {
    key: "startup", file: "spring-start-up.html", photo: "heads", gallery: ["zones", "shed", "pines"],
    title: "Spring Sprinkler Start-Ups in Denver, CO | J&M Irrigation",
    description: "J&M turns your sprinkler system back on, checks the backflow, runs every zone and adjusts heads for the season. Repairs are priced before any work.",
    h1: "Spring Sprinkler Start-Ups in Denver, CO",
    lead: "We turn your system back on, check every zone and adjust it for the new season.",
    intro: "Turning sprinklers on after winter is more than flipping a switch. Freezes, snowplows and settling ground can damage heads and lines, and a careful start-up catches problems before they waste water.",
    listTitle: "When to book",
    list: ["Usually April or May, after the last hard freeze", "We schedule around the weather; there is no guaranteed last-freeze date"],
    scopeTitle: "If something is broken",
    scope: "We show you what we found, explain it and give you a price before we fix anything.",
    process: [["Water on slowly", "The water is turned back on slowly to protect the pipes."], ["Backflow check", "We check the backflow device. This is a visual check, not a certified backflow test."], ["Run every zone", "Each zone runs while we look for leaks and broken heads."], ["Adjust heads", "Heads are adjusted for coverage."], ["Program the controller", "Your controller is set for spring."]],
    pricing: "",
    faqs: [
      ["What if you find something broken?", "We will show you, explain it and give you a price before we fix anything."],
      ["Do I need a start-up if my system was blown out?", "Yes. A blowout protects the system over winter; the start-up turns it back on and checks it for the season."],
    ],
    related: ["repair", "blowouts", "install"],
  },
  {
    key: "sod", file: "sod-installation.html", photo: "sod", proof: ["sod"], gallery: ["shed", "pines"],
    title: "Sod Installation in Denver, CO | J&M Irrigation",
    description: "Site assessment, soil and grading prep, fresh sod and sprinklers set for new-lawn watering, with a watering handoff. J&M Irrigation, Denver and the Front Range.",
    h1: "Sod Installation in Denver, CO",
    lead: "Fresh sod on properly prepared soil, with the sprinklers to keep it alive.",
    intro: "New sod only thrives if the ground under it is ready and the watering is right. Because J&amp;M does both sod and irrigation, your new lawn is set up from the start.",
    listTitle: "What affects the quote",
    list: ["The size of the area", "How much old grass or weeds need removing", "How much soil preparation and grading the ground needs", "Whether the sprinkler system needs work first"],
    scopeTitle: "Good for",
    scope: "New-build homes with bare dirt, tired lawns that need a fresh start, and yards getting a new sprinkler system.",
    process: [["Site assessment", "We look at the area, the soil and the existing watering."], ["Removal when needed", "Old grass or weeds are removed when the job calls for it."], ["Soil and grading", "The ground is prepared and graded."], ["Laying sod", "Fresh sod is laid."], ["Irrigation setup", "Your sprinklers are set for new-lawn watering."], ["Watering handoff", "We talk you through watering and when to switch to a normal schedule."]],
    pricing: "",
    faqs: [
      ["Does my yard need a working sprinkler system first?", "New sod needs reliable watering from day one. We can check your existing system or install a new one with the sod."],
      ["How soon can I walk on it?", "Stay off it for about 2 weeks while the roots take hold."],
      ["How much should I water new sod?", "We set your controller for new sod and tell you when to switch to a normal schedule."],
    ],
    related: ["install", "repair", "startup"],
  },
];

for (const sp of SERVICE_PAGES) {
  const s = svc(sp.key);
  const pathName = "/" + sp.file;
  const crumbs = [{ name: "Home", path: "/" }, { name: "Services", path: "/services.html" }, { name: s.name, path: pathName }];
  const projectRef = featured ? featured.serviceRef(sp.key) : "";
  const projectLink = featured ? featured.relatedLink(sp.key) : null;
  const proof = sp.proof ? `<section class="section proof proof--${sp.proof.length}" aria-labelledby="proof-title">
<div class="wrap">
<div class="section-head">
<h2 id="proof-title">Before and after</h2>
<p>Real J&amp;M jobs, photographed before and after. Drag the handle, or use the arrow keys, to compare.</p>
</div>
<div class="proof__grid">${sp.proof.map((k) => compareSlider(k, { sizes: sp.proof.length > 1 ? "(min-width: 768px) 45vw, 100vw" : "(min-width: 768px) 50vw, 100vw" })).join("")}</div>
</div>
</section>` : "";
  const gallery = sp.gallery && !sp.proof ? `<section class="section section--tight" aria-label="J&amp;M job photos"><div class="wrap">${photoStrip(sp.gallery, "J&M job photos")}</div></section>` : "";
  const body = `${pageHero({ eyebrow: "", h1: sp.h1, lead: sp.lead, image: workImg(sp.photo, { eager: true, cls: "hero__img" }), variant: "service" })}

<section class="section" aria-labelledby="about-service">
<div class="wrap grid-12 split">
<div class="split__main">
<h2 id="about-service" class="visually-hidden">About this service</h2>
<p class="intro">${sp.intro}</p>
<h3>${sp.listTitle}</h3>
<ul class="ticks">${sp.list.map((x) => `<li>${x}</li>`).join("")}</ul>
</div>
<div class="split__side">
<h3>${sp.scopeTitle}</h3>
<p>${sp.scope}</p>
${sp.pricing ? `<h3>Pricing and terms</h3><p>${sp.pricing}</p>` : ""}
</div>
</div>
</section>

<section class="section section--pale" aria-labelledby="process-title">
<div class="wrap">
<h2 id="process-title">How the work goes</h2>
<ol class="process">${sp.process.map(([t, d], i) => `<li data-reveal style="--i:${i}"><h3>${t}</h3><p>${d}</p></li>`).join("")}</ol>
</div>
</section>

${proof}${gallery}

${projectRef}

<section class="section" aria-labelledby="faq-title">
<div class="wrap grid-12 faq-wrap">
<h2 id="faq-title">Questions we hear a lot</h2>
${faqList(sp.faqs)}
</div>
</section>

${quoteBlock({ heading: `Request a quote for ${s.name.toLowerCase()}.`, copy: "Leave your name and phone number. J&amp;M will get back to you about the next step.", selected: s.value })}

${relatedLinks("Related", [...sp.related.map((k) => [svc(k).path, svc(k).name]), ...(projectLink ? [projectLink] : []), ["/service-areas.html", "Service areas"], ["/contact.html", "Contact J&M"]])}`;
  pages.push({
    file: sp.file, path: pathName, type: "service", crumbs, navCurrent: "/services.html",
    title: sp.title, description: sp.description, faqs: sp.faqs, service: { name: s.name, springs: ["install", "sod"].includes(sp.key) },
    body, ogImage: WORK[sp.photo].src,
  });
}

/* City pages */
const CITY_PAGES = {
  denver: {
    title: "Sprinkler Repair & Installation in Denver, CO | J&M Irrigation",
    description: "Denver is home base for J&M: sprinkler repair, installation, blowouts, spring start-ups and sod. Call or text 303-549-0712 in English or Spanish.",
    eyebrow: "Denver, Colorado · Home base",
    h1: "Sprinkler Repair &amp; Installation in Denver, CO",
    lead: "Denver is home for J&amp;M. Based in the Green Valley Ranch area, we install, repair and winterize sprinkler systems across the city and lay new sod.",
    note: "Not sure which service you need? Describe what you are seeing and we will point you to the right next step.",
  },
  aurora: {
    title: "Sprinkler Repair & Installation in Aurora, CO | J&M Irrigation",
    description: "Sprinkler repair, installation, blowouts, spring start-ups and sod in Aurora, CO. Request a quote or call or text 303-549-0712.",
    eyebrow: "Aurora, Colorado",
    h1: "Sprinkler Repair &amp; Installation in Aurora, CO",
    lead: "J&amp;M repairs, installs and winterizes sprinkler systems and lays new sod for Aurora homeowners.",
    note: "Tell us what your property needs and we will confirm the next step and the price before any work.",
  },
  "commerce-city": {
    title: "Sprinkler & Sod Installation in Commerce City, CO | J&M Irrigation",
    description: "New sprinkler systems and sod, repairs and seasonal service in Commerce City, CO. Request a quote or call or text 303-549-0712.",
    eyebrow: "Commerce City, Colorado",
    h1: "Sprinkler &amp; Sod Installation in Commerce City, CO",
    lead: "Starting from bare dirt? J&amp;M can install the sprinkler system and lay the sod as one project, or take care of a single repair.",
    note: "Planning both a system and sod? Mention it in your request so we can quote them together.",
  },
  thornton: {
    title: "Sprinkler Repair, Blowouts & Installs in Thornton, CO | J&M Irrigation",
    description: "Sprinkler repairs, fall blowouts, spring start-ups, new systems and sod in Thornton, CO. Request a quote or call or text 303-549-0712.",
    eyebrow: "Thornton, Colorado",
    h1: "Sprinkler Repair, Blowouts &amp; Installs in Thornton, CO",
    lead: "J&amp;M fixes sprinkler systems in Thornton, blows them out before the freeze and installs new systems and sod.",
    note: "Booking a blowout? Let us know how many zones your system has, if you know.",
  },
  parker: {
    title: "Sprinkler Systems in Parker, CO | J&M Irrigation",
    description: "Sprinkler installation, repair, blowouts, spring start-ups and sod in Parker, CO. Request a quote or call or text 303-549-0712.",
    eyebrow: "Parker · Douglas County, Colorado",
    h1: "Sprinkler Systems in Parker, CO, Done Right",
    lead: "J&amp;M installs new sprinkler systems in Parker, from typical yards to larger lots, with zones planned around slopes and sun. Repairs and seasonal service too.",
    note: "Tell us whether you need a new system, a repair or seasonal service, and we will confirm the next step.",
  },
  "castle-rock": {
    title: "Sprinkler System Installation in Castle Rock, CO | J&M Irrigation",
    description: "New irrigation systems for Castle Rock and Douglas County properties, from sloped lots to acreage, plus repairs, blowouts and sod. Call or text 303-549-0712.",
    eyebrow: "Castle Rock · Douglas County, Colorado",
    h1: "Sprinkler System Installation in Castle Rock, CO",
    lead: "New irrigation systems for Castle Rock homes, larger lots and acreage. Sloped ground needs zones planned so the top of the yard does not dry out while the bottom stays soggy, and J&amp;M plans every zone around the land.",
    note: "Planning a new system? Share the location and the rough size of the property in your request so we can plan the walkthrough.",
    cta: "Plan a new system in Castle Rock",
  },
  larkspur: {
    title: "Irrigation Services for Larkspur, CO Properties | J&M Irrigation",
    description: "Sprinkler installation, repairs, seasonal service and sod for Larkspur, CO properties, from single repairs to larger lots. Call or text 303-549-0712.",
    eyebrow: "Larkspur · Douglas County, Colorado",
    h1: "Irrigation Services for Larkspur, CO Properties",
    lead: "From full installs on larger lots to single repairs, J&amp;M works on Larkspur properties of different sizes.",
    note: "Have a larger property? Tell us about the project so we can confirm whether it is a fit.",
  },
  "colorado-springs": {
    title: "Sprinkler Systems & Larger Projects in Colorado Springs, CO | J&M Irrigation",
    description: "In Colorado Springs, J&M takes on larger projects: new sprinkler systems, sod installation and jobs with several repairs at once. Tell us about your project.",
    eyebrow: "Colorado Springs, Colorado · New installations",
    h1: "Sprinkler Systems &amp; Larger Projects in Colorado Springs, CO",
    lead: "In Colorado Springs, J&amp;M focuses on larger projects: new irrigation systems for new landscapes, larger lots and acreage, sod installation and jobs with several repairs at once. Tell us about the property and we will let you know if it is a fit.",
    note: "Routine single repairs and seasonal visits are not offered in Colorado Springs. Describe the property, the location and the work you have in mind, and we will confirm whether the project is a fit before scheduling.",
    services: [
      { ...svc("install"), rowSummary: "New sprinkler systems for larger projects, planned around the property." },
      { ...svc("sod"), rowSummary: "Sod installation as part of a larger project, with irrigation set up for the new lawn." },
      { ...svc("repair"), rowName: "Larger repair jobs", rowSummary: "Systems that need several repairs at once. Single-head repairs are not offered here." },
    ],
    cta: "Discuss your project",
  },
};

for (const c of CITIES) {
  const cp = CITY_PAGES[c.key];
  const crumbs = [{ name: "Home", path: "/" }, { name: "Service Areas", path: "/service-areas.html" }, { name: c.name, path: c.path }];
  const projectNote = featured ? featured.cityRef(c.key) : "";
  const others = CITIES.filter((o) => o.key !== c.key);
  const body = `${pageHero({ eyebrow: cp.eyebrow, h1: cp.h1, lead: cp.lead, image: "" })}

<section class="section" aria-labelledby="city-services">
<div class="wrap">
<h2 id="city-services">${c.key === "colorado-springs" ? "Larger projects in Colorado Springs" : `Services in ${esc(c.name)}`}</h2>
${serviceCards(cp.services || SERVICES, { cityName: c.name })}
<p class="note">${cp.note}</p>
</div>
</section>

${projectNote}

<section class="section section--pale" aria-labelledby="how-title">
<div class="wrap grid-12 people">
<div class="people__intro"><h2 id="how-title">How to get started</h2><p>Call or text <a href="${TEL}" data-phone-link data-placement="body"><span data-phone-text>${esc(PHONE)}</span></a> in English or Spanish, or send the form below.</p></div>
<div class="people__steps">${steps()}</div>
</div>
</section>

${quoteBlock({ heading: cp.cta ? `${cp.cta}.` : `Request a quote in ${esc(c.name)}.`, cityName: c.name, copy: c.key === "colorado-springs" ? "Share the project type and its rough size. We will confirm whether the project is a fit." : undefined })}

<section class="section" aria-labelledby="nearby-title">
<div class="wrap">
<h2 id="nearby-title" class="h3">J&amp;M also works in</h2>
<ul class="area-links area-links--inline">${others.map((o) => `<li><a href="${o.path}">${esc(o.label)}</a></li>`).join("")}</ul>
</div>
</section>`;
  pages.push({ file: c.path.slice(1), path: c.path, type: "city", crumbs, navCurrent: "/service-areas.html", title: cp.title, description: cp.description, body });
}

/* Services hub */
pages.push({
  file: "services.html", path: "/services.html", type: "info",
  crumbs: [{ name: "Home", path: "/" }, { name: "Services", path: "/services.html" }],
  title: "Sprinkler & Sod Services in Denver, CO | J&M Irrigation",
  description: "Sprinkler repair, installation, blowouts, spring start-ups and sod installation across Denver and the Front Range. English or Spanish.",
  body: `${pageHero({ h1: "Sprinkler and sod services in Denver and the Front Range", lead: "New irrigation systems are J&amp;M's focus, from new landscapes to larger lots and acreage. Repairs, seasonal service and sod round out the work. Pick a service, or call and we will point you in the right direction.", image: "" })}
<section class="section" aria-labelledby="services-title">
<div class="wrap">
<h2 id="services-title">Five services</h2>
${serviceCards()}
</div>
</section>
<section class="section section--pale" aria-labelledby="terms-title">
<div class="wrap grid-12 split">
${SHOW_FACTS ? `<div class="split__main"><h2 id="terms-title">Pricing and terms</h2><p>${FACTS.freeEstimate} ${FACTS.diagnostic}</p><p>${FACTS.warranty}</p></div>
<div class="split__side"><h3>Systems installed by others</h3><p>J&amp;M repairs systems installed by other companies.</p></div>` : `<div class="split__main"><h2 id="terms-title">Systems installed by others</h2><p>J&amp;M repairs systems installed by other companies.</p></div>`}
</div>
</section>
${quoteBlock()}`,
});

/* Service areas hub */
pages.push({
  file: "service-areas.html", path: "/service-areas.html", type: "info",
  crumbs: [{ name: "Home", path: "/" }, { name: "Service Areas", path: "/service-areas.html" }],
  title: "Service Areas: Castle Rock, Douglas County, Colorado Springs & Denver | J&M Irrigation",
  description: "J&M installs new irrigation systems in Castle Rock, Douglas County and Colorado Springs, and serves Denver, Aurora, Thornton and Commerce City.",
  body: `${pageHero({ h1: "Sprinkler installation across Douglas County, Colorado Springs and Denver", lead: "New installations are J&amp;M's focus in Castle Rock and across Douglas County, including Parker and Larkspur, and in Colorado Springs. J&amp;M is based in Denver and also serves Denver, including Green Valley Ranch, Aurora, Thornton and Commerce City. Do not see your city? Call and ask.", image: "" })}
<section class="section" aria-labelledby="areas-title">
<div class="wrap">
<h2 id="areas-title">Choose your city</h2>
<ul class="area-links area-links--large">${CITIES.map((c) => `<li><a href="${c.path}">${esc(c.label)}</a></li>`).join("")}</ul>
${featured ? featured.serviceAreasNote() : ""}
</div>
</section>
${quoteBlock()}`,
});

/* About */
pages.push({
  file: "about.html", path: "/about.html", type: "info",
  crumbs: [{ name: "Home", path: "/" }, { name: "About", path: "/about.html" }],
  title: "About J&M Irrigation Services | Denver, CO",
  description: `Family-owned${SHOW_FACTS ? ", with 20+ years of experience" : ""}. Juan started J&M so homeowners never pay twice for the same job.`,
  ogImage: WORK.pines.src,
  body: `${pageHero({ h1: "Built on doing it right the first time", lead: "A family-owned company with a simple promise: do the job right, so customers only pay once.", image: workImg("pines", { eager: true, cls: "hero__img" }) })}
<section class="section" aria-labelledby="story-title">
<div class="wrap grid-12 split">
<div class="split__main">
<h2 id="story-title">Why Juan started J&amp;M</h2>
<p>${SHOW_FACTS ? FACTS.experience : "Working on sprinkler systems,"} Juan kept seeing the same thing. Homeowners were paying for a job, then paying again when it did not hold up.</p>
<p>That did not sit right with him. So he started J&amp;M Irrigation Services, a family-owned company with a simple promise: do the job right the first time, so customers only pay once.</p>
<p>Today, J&amp;M installs, repairs and maintains sprinkler systems and lays fresh sod for homeowners from Thornton to Colorado Springs.</p>
${featured ? featured.aboutLine() : ""}
</div>
<figure class="split__side pull">
<blockquote><p>We pride ourselves on helping people, saving them money, and doing the service right the first time.</p></blockquote>
<figcaption>Juan, owner</figcaption>
</figure>
</div>
</section>
<section class="section section--pale" aria-labelledby="values-title">
<div class="wrap">
<h2 id="values-title">What we stand for</h2>
<dl class="values">
<div><dt>Honesty</dt><dd>Clear prices and straight answers, even when the fix is small.</dd></div>
<div><dt>Quality</dt><dd>We fix the cause, not just the symptom.</dd></div>
<div><dt>Family</dt><dd>We treat your home the way we would want ours treated.</dd></div>
<div><dt>Hablamos español</dt><dd>Our team speaks English and Spanish. Call or text in whichever you prefer.</dd></div>
</dl>
</div>
</section>
${quoteBlock()}`,
});

/* Contact */
pages.push({
  file: "contact.html", path: "/contact.html", type: "contact",
  crumbs: [{ name: "Home", path: "/" }, { name: "Contact", path: "/contact.html" }],
  title: "Request a Quote | J&M Irrigation, Denver, CO",
  description: "Request a sprinkler or sod quote from J&M Irrigation. Call or text 303-549-0712, Mon–Sat 7am–5pm. Hablamos español.",
  body: `<section class="section section--first" id="quote" aria-labelledby="contact-title">
<div class="wrap grid-12 quote">
<div class="quote__intro">
<h1 id="contact-title">Request a quote</h1>
<p class="lead">Tell us where the property is, what kind of project it is and roughly how large. J&amp;M will get back to you about the next step.</p>
${SHOW_FACTS ? `<p>${FACTS.freeEstimate} ${FACTS.diagnostic}</p>` : ""}
<ul class="contact-list">
<li><span class="label">Call or text</span> <a href="${TEL}" data-phone-link data-phone-text data-placement="contact">${esc(PHONE)}</a></li>
<li><span class="label">Email</span> <a href="mailto:${EMAIL}">${EMAIL}</a></li>
<li><span class="label">Hours</span> <span data-hours>${esc(HOURS)}</span>. Closed Sunday.</li>
<li><span class="label">Language</span> English or Spanish</li>
<li><span class="label">Service area</span> Castle Rock, Douglas County (including Parker and Larkspur) and Colorado Springs, plus Denver, Aurora, Thornton and Commerce City</li>
</ul>
</div>
<div class="quote__form">${leadForm({ name: "estimate", idPrefix: "e", extended: true })}</div>
</div>
</section>`,
});

/* Legal pages: keep their existing wording, restyled */
const legal = (file, title, description, h1, updated, sections) => pages.push({
  file, path: "/" + file, type: "info",
  crumbs: [{ name: "Home", path: "/" }, { name: h1, path: "/" + file }],
  title, description,
  body: `<section class="section section--first"><div class="wrap prose">
<h1>${h1}</h1>
<p class="meta">Last updated: ${updated}</p>
${sections.map(([h, p]) => `<h2>${h}</h2>${p}`).join("\n")}
</div></section>`,
});
legal("privacy.html", "Privacy Policy | J&M Irrigation", "How J&M Irrigation Services collects and uses the information you share through this website.", "Privacy Policy", "November 2026", [
  ["What we collect", "<p>When you request a quote, we collect what you enter: your name and phone number, the service you need and, on the contact page, your email, city, preferred language and message if you give them.</p>"],
  ["How we use it", "<p>Only to respond to your request, schedule work and follow up about your service. We do not sell or rent your information.</p>"],
  ["How it's stored", "<p>Requests are delivered through our website host's form service and by email, and may be copied to our customer management system. We keep them only as long as we need them.</p>"],
  ["Website analytics", `<p>We use Google Analytics to understand how visitors use this site, such as which pages are viewed, how people find us and whether a quote request was sent or a phone link was tapped. It uses cookies and collects information like your general location, device and browser. We never send your name, phone number, email or message to Google Analytics. You can opt out with <a href="https://tools.google.com/dlpage/gaoptout">Google's opt-out browser add-on</a>.</p>`],
  ["Cookies and other services", "<p>Apart from Google Analytics, this site does not use advertising or tracking cookies. Fonts load from Google Fonts. The review excerpts on our home page are copied from our Google reviews. These services may log basic technical data such as your IP address.</p>"],
  ["Your choices", `<p>To see, correct or delete your information, email <a href="mailto:${EMAIL}">${EMAIL}</a> or call <a href="${TEL}" data-phone-link data-placement="body">${esc(PHONE)}</a>.</p>`],
  ["Changes to this policy", `<p>If we update this policy, we will post the new version on this page with a new "last updated" date. See also our <a href="/terms.html">Terms &amp; Conditions</a>.</p>`],
]);
legal("terms.html", "Terms & Conditions | J&M Irrigation", "The terms for using jmirrigationco.com, the website of J&M Irrigation Services.", "Terms &amp; Conditions", "October 2026", [
  ["About these terms", `<p>These terms apply to your use of jmirrigationco.com, the website of J&amp;M Irrigation Services ("J&amp;M," "we," "us"). By using this site, you agree to them.</p>`],
  ["Using our website", "<p>The content on this site is general information about our services. Project photos show the kind of work we do, and results vary with each property, its soil and its existing system. Seasonal tips, such as when to book a blowout, are general guidance and not a guarantee for your system.</p>"],
  ["Quotes and estimates", "<p>Sending a quote request through this site does not create a contract or reserve a spot on our schedule. Prices and offers shown here can change. The price for your job is the one we confirm with you directly before work starts.</p>"],
  ["Our work and warranty", "<p>The work we do for you, including the warranty on new installations, is covered by what we agree with you for that job, not by these website terms.</p>"],
  ["Reviews", "<p>The reviews on this site come from Google and are each customer's own opinion.</p>"],
  ["Website analytics", `<p>This site uses Google Analytics, which sets cookies to measure how visitors use it. Our <a href="/privacy.html">Privacy Policy</a> explains what is collected and how to opt out.</p>`],
  ["Links to other sites", "<p>This site links to other services, such as Google. We do not control those sites and are not responsible for their content or how they handle your information.</p>"],
  ["Accuracy and availability", "<p>We work to keep this site accurate and up to date, but it is provided as is. We cannot promise it will always be available or free of errors.</p>"],
  ["Changes to these terms", `<p>If we update these terms, we will post the new version on this page with a new "last updated" date.</p>`],
  ["Contact", `<p>Questions? Email <a href="mailto:${EMAIL}">${EMAIL}</a> or call <a href="${TEL}" data-phone-link data-placement="body">${esc(PHONE)}</a>.</p>`],
]);

/* 404 (served for unknown routes, so every URL in it is absolute) */
pages.push({
  file: "404.html", path: null, type: "info", noindex: true,
  title: "Page Not Found | J&M Irrigation",
  description: "That page could not be found. Visit the J&M Irrigation Services home page or call 303-549-0712 for sprinkler help.",
  body: `<section class="section section--first"><div class="wrap prose">
<h1>We could not find that page</h1>
<p class="lead">It may have moved. Try the home page or the services list, or call and we will help directly.</p>
<div class="actions">${btn("/", "Go to the home page")}${callBtn("body")}</div>
<ul class="link-list">${SERVICES.map((s) => `<li><a href="${s.path}">${s.name} ${ARROW}</a></li>`).join("")}</ul>
</div></section>`,
});

/* Featured project page (only when the featured project is visible in this build) */
if (featured) pages.push(featured.page());

/* ---------- write ---------- */
fs.mkdirSync(OUT, { recursive: true });
for (const page of pages) {
  const file = path.join(OUT, page.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, layout(page));
}

const sitemapUrls = pages.filter((p) => p.path && !p.noindex && (p.type !== "project" || featuredModule?.publish));
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((p) => `<url><loc>${abs(p.path)}</loc></url>`).join("\n")}
</urlset>
`);

if (!PREVIEW) {
  if (featuredModule && !featuredModule.publish && fs.existsSync(path.join(ROOT, featuredModule.url.slice(1)))) {
    throw new Error("An unpublished featured project page exists in the public build: " + featuredModule.url);
  }
} else {
  // Copy the public assets the pages use, plus the photos of an unpublished featured project, into the preview.
  for (const dir of ["assets", "js", "content", "images/brand", "images/work", "images/projects"]) {
    if (fs.existsSync(path.join(ROOT, dir))) fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
  }
  if (featured && !featured.publish) {
    const src = path.join(ROOT, featured.assetSource);
    const dest = path.join(OUT, featured.imageDir.slice(1));
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src).filter((f) => f.endsWith(".webp"))) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
  fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");
}
console.log(`${PREVIEW ? "Preview" : "Public"} build: ${pages.length} pages written to ${path.relative(ROOT, OUT) || "."}${featured && !featured.publish ? " (includes the unpublished featured project)" : ""}.`);
