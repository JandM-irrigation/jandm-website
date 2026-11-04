// Featured project: Spruce Mountain Ranch, Larkspur. Publication approved by Juan and the ranch property
// owner. tools/build.mjs builds the home feature, the case study and the service and city references from it.
// Photos: /images/projects/spruce-mountain-ranch (web-optimized derivatives only).

const PHOTOS = {
  terraced: { base: "ranch-terraced-lawn", widths: [640, 1280, 1920], ratio: [4, 3],
    alt: "Terraced lawn and trees on the grounds at Spruce Mountain Ranch.", pos: "50% 60%" },
  aerial: { base: "ranch-aerial", widths: [640, 1280, 1920], dims: [1920, 1087],
    alt: "Aerial view of fields, trees and buildings at Spruce Mountain Ranch." },
  paddocks: { base: "ranch-turf-paddocks", widths: [640, 1280, 1920], ratio: [4, 3],
    alt: "Lawn sloping toward fenced paddocks in mist at Spruce Mountain Ranch.", caption: "Turf and paddocks across the ranch grounds.", pos: "50% 55%" },
  timber: { base: "ranch-lawn-timber-structure", widths: [640, 1280, 1920], ratio: [4, 3],
    alt: "Lawn beside a timber structure at Spruce Mountain Ranch.", caption: "Lawn beside a timber structure.", pos: "55% 62%" },
  lane: { base: "ranch-paddock-lane", widths: [640, 1280, 1920], ratio: [4, 3],
    alt: "Lane between fenced paddocks at Spruce Mountain Ranch.", caption: "Lane between fenced paddocks.", pos: "50% 60%" },
  autumn: { base: "ranch-autumn-grounds", widths: [640, 1280, 1920], ratio: [4, 3],
    alt: "Red autumn foliage beside a lawn and path at Spruce Mountain Ranch.", caption: "Autumn on the ranch grounds.", pos: "50% 55%" },
  overlook: { base: "ranch-overlook", widths: [640, 1280, 1920], ratio: [4, 3],
    alt: "Autumn view across fields and trees at Spruce Mountain Ranch", caption: "Looking out across the property in autumn.", pos: "50% 60%" },
};
const SLUG = "spruce-mountain-ranch-irrigation";
const URL_PATH = `/projects/${SLUG}.html`;
const DIR = "/images/projects/spruce-mountain-ranch";

export default {
  publish: true,
  slug: SLUG,
  url: URL_PATH,
  navLabel: "Our Work",
  imageDir: DIR,

  setup(ctx) {
    const { esc, ARROW, svc, city, SITE, BUSINESS_ID, quoteBlock, relatedLinks } = ctx;

    const picture = (key, { sizes = "100vw", eager = false, cls = "" } = {}) => {
      const p = PHOTOS[key];
      const largest = p.widths[p.widths.length - 1];
      const [w, h] = p.dims || [largest, Math.round((largest * p.ratio[1]) / p.ratio[0])];
      const srcset = p.widths.map((x) => `${DIR}/${p.base}-${x}.webp ${x}w`).join(", ");
      const src = `${DIR}/${p.base}-${p.widths[Math.min(1, p.widths.length - 1)]}.webp`;
      const load = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"';
      const style = p.pos ? ` style="object-position:${p.pos}"` : "";
      return `<img class="${cls}" src="${src}" srcset="${srcset}" sizes="${sizes}" width="${w}" height="${h}" alt="${esc(p.alt)}" ${load}${style}>`;
    };
    const aerial = ({ eager = false, sizes = "(min-width: 1024px) 66vw, 100vw" } = {}) => {
      const load = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"';
      return `<picture class="aerial">
<source media="(max-width: 767px)" srcset="${DIR}/ranch-aerial-portrait-640.webp" width="640" height="797">
<img src="${DIR}/ranch-aerial-1280.webp" srcset="${DIR}/ranch-aerial-640.webp 640w, ${DIR}/ranch-aerial-1280.webp 1280w, ${DIR}/ranch-aerial-1920.webp 1920w" sizes="${sizes}" width="1920" height="1087" alt="${esc(PHOTOS.aerial.alt)}" ${load}>
</picture>`;
    };

    const refSection = ({ eyebrow, title, text, photo, caption, link }) => `<section class="section section--rule" aria-labelledby="project-title">
<div class="wrap grid-12 project-ref${photo ? "" : " project-ref--text"}">
${photo ? `<figure class="project-ref__media">${picture(photo, { sizes: "(min-width: 1024px) 33vw, 100vw" })}<figcaption>${esc(caption)}</figcaption></figure>` : ""}
<div class="project-ref__text">
<p class="eyebrow">${eyebrow}</p>
<h2 id="project-title" class="h3">${title}</h2>
<p>${text}</p>
<a class="text-link" href="${URL_PATH}">${link} ${ARROW}</a>
</div>
</div>
</section>`;

    const SERVICE_REFS = {
      repair: { text: "Sprinkler repairs are part of J&amp;M's work at Spruce Mountain Ranch in Larkspur.", photo: "lane", caption: "Lane between fenced paddocks at the ranch. A view of the property, not a repair photo." },
      install: { text: "J&amp;M performs sprinkler installation at Spruce Mountain Ranch as part of its work across approximately 500 acres of the roughly 1,200-acre property.", photo: "terraced", caption: "Terraced lawn and trees on the ranch grounds." },
      blowouts: { text: "J&amp;M also performs irrigation maintenance at Spruce Mountain Ranch." },
      startup: { text: "J&amp;M also performs irrigation maintenance at Spruce Mountain Ranch." },
      sod: { text: "Sod installation is part of J&amp;M's work at Spruce Mountain Ranch.", photo: "timber", caption: "Lawn beside a timber structure on the ranch grounds. A view of the property, not a photo of new sod." },
    };

    const fig = (key, cls, sizes) => `<figure class="${cls}">${picture(key, { sizes })}<figcaption>${esc(PHOTOS[key].caption)}</figcaption></figure>`;
    const scopeRows = [
      ["Sprinkler installation", "Sprinkler installation is part of J&amp;M's work at the ranch.", svc("install").path],
      ["Irrigation maintenance", "J&amp;M also performs irrigation maintenance within its overall work area. This does not describe a service schedule or a contract to manage the whole property.", ""],
      ["Sprinkler repairs", "Repair work is another part of J&amp;M's work at the property.", svc("repair").path],
      ["Sod installation", "J&amp;M's scope also includes sod installation.", svc("sod").path],
    ];

    return {
      homeHero: () => `${picture("terraced", { eager: true, sizes: "(min-width: 1024px) 56vw, 100vw", cls: "hero__img" })}<figcaption>Spruce Mountain Ranch · Larkspur, Colorado</figcaption>`,

      homeFeature: () => `<section class="feature" id="our-work" aria-labelledby="featured-title">
<div class="wrap grid-12 feature__grid">
<div class="feature__media">${aerial()}</div>
<div class="feature__panel">
<p class="eyebrow eyebrow--light">Featured project · Larkspur, Colorado</p>
<h2 id="featured-title">Spruce Mountain Ranch</h2>
<p class="feature__lead">Irrigation and sod work across approximately 500 acres of a roughly 1,200-acre property.</p>
<dl class="feature__facts">
<div><dt>Approx. 500 acres</dt><dd>J&amp;M work area</dd></div>
<div><dt>Approx. 1,200 acres</dt><dd>Entire property</dd></div>
</dl>
<p>J&amp;M's work at Spruce Mountain Ranch includes sprinkler installation, irrigation maintenance, repairs and sod installation. Juan considers it his proudest project.</p>
<p>The 500 acres describe J&amp;M's overall work area; the services performed vary by area.</p>
<a class="btn btn--light" href="${URL_PATH}">Explore the ranch project</a>
</div>
</div>
</section>`,

      faqLargerProperties: "J&amp;M's work at Spruce Mountain Ranch in Larkspur covers approximately 500 acres of the roughly 1,200-acre property. Tell us about your project so we can confirm whether it is a fit.",

      serviceRef: (key) => SERVICE_REFS[key] ? refSection({ eyebrow: "Project reference", title: "Spruce Mountain Ranch, Larkspur", ...SERVICE_REFS[key], link: "See the ranch project" }) : "",
      relatedLink: (key) => (SERVICE_REFS[key] ? [URL_PATH, "Spruce Mountain Ranch project"] : null),

      cityRef: (key) => key === "larkspur" ? refSection({
        eyebrow: "Featured project in Larkspur", title: "Spruce Mountain Ranch", photo: "paddocks", caption: PHOTOS.paddocks.caption, link: "Explore the ranch project",
        text: "J&amp;M's work at Spruce Mountain Ranch covers approximately 500 acres of the roughly 1,200-acre property and includes sprinkler installation, irrigation maintenance, sprinkler repairs and sod installation.",
      }) : ["castle-rock", "parker", "colorado-springs"].includes(key) ? refSection({
        eyebrow: key === "colorado-springs" ? "Large-property work nearby" : "Featured project in Douglas County", title: "Spruce Mountain Ranch, Larkspur", photo: "terraced", caption: "Terraced lawn and trees on the ranch grounds.", link: "Explore the ranch project",
        text: "In Larkspur, J&amp;M's work at Spruce Mountain Ranch covers approximately 500 acres of the roughly 1,200-acre property: sprinkler installation, irrigation maintenance, repairs and sod installation.",
      }) : "",

      serviceAreasNote: () => `<p class="note">In Larkspur, J&amp;M's work includes <a href="${URL_PATH}">Spruce Mountain Ranch</a>.</p>`,
      aboutLine: () => `<p>The project Juan is proudest of is <a href="${URL_PATH}">Spruce Mountain Ranch</a> in Larkspur, where J&amp;M's work covers approximately 500 acres of the roughly 1,200-acre property.</p>`,

      page: () => ({
        file: URL_PATH.slice(1), path: URL_PATH, type: "project", navCurrent: URL_PATH,
        crumbs: [{ name: "Home", path: "/" }, { name: "Our Work", path: "/#our-work" }, { name: "Spruce Mountain Ranch", path: URL_PATH }],
        title: "Spruce Mountain Ranch Irrigation Project | J&M Irrigation",
        description: "See J&M's sprinkler installation, irrigation maintenance, repairs and sod work at Spruce Mountain Ranch in Larkspur, Colorado.",
        schemaExtra: {
          mainEntity: {
            "@type": "Article",
            headline: "Spruce Mountain Ranch",
            description: "Sprinkler installation, irrigation maintenance, repairs and sod work in Larkspur, Colorado.",
            author: { "@id": BUSINESS_ID },
            publisher: { "@id": BUSINESS_ID },
            image: `${SITE}${DIR}/ranch-aerial-1920.webp`,
            about: ["Sprinkler installation", "Irrigation maintenance", "Sprinkler repairs", "Sod installation"].map((s) => ({ "@type": "Thing", name: s })),
            contentLocation: { "@type": "Place", name: "Larkspur, Colorado" },
          },
        },
        ogType: "article",
        ogImage: `${DIR}/ranch-aerial-1280.webp`,
        body: `<section class="case-hero">
<div class="wrap">
<h1>Spruce Mountain Ranch</h1>
<p class="lead">Sprinkler installation, irrigation maintenance, repairs and sod work in Larkspur, Colorado.</p>
</div>
<div class="wrap case-hero__media">${aerial({ eager: true, sizes: "(min-width: 1280px) 1184px, 100vw" })}</div>
<div class="wrap">
<dl class="facts">
<div><dt>Location</dt><dd>Larkspur, Colorado</dd></div>
<div><dt>Overall property</dt><dd>Approximately 1,200 acres</dd></div>
<div><dt>J&amp;M work area</dt><dd>Approximately 500 acres</dd></div>
</dl>
<p class="clarify">Services vary within J&amp;M's work area. Not every acre received every service.</p>
</div>
</section>

<section class="section" aria-labelledby="story-title">
<div class="wrap prose">
<h2 id="story-title">A project Juan is proud to stand behind.</h2>
<p>Spruce Mountain Ranch is an approximately 1,200-acre property in Larkspur, Colorado. J&amp;M's work covers approximately 500 acres of the property and includes sprinkler installation, irrigation maintenance, sprinkler repairs and sod installation. Juan considers it his proudest project.</p>
<p>This photo story shows the property's grounds and setting. The photographs do not map J&amp;M's work boundary or identify the service performed in each pictured area.</p>
</div>
</section>

<section class="section section--pale" aria-labelledby="scope-title">
<div class="wrap">
<h2 id="scope-title">What J&amp;M does here.</h2>
<ul class="rows rows--static">${scopeRows.map(([t, d, href]) => `<li class="row row--static"><h3 class="row__name">${t}</h3><p class="row__text">${d}${href ? ` <a href="${href}">About ${t.toLowerCase()}</a>.` : ""}</p></li>`).join("")}</ul>
</div>
</section>

<section class="section" aria-labelledby="photos-title">
<div class="wrap">
<h2 id="photos-title">Around the property</h2>
<div class="story">
${fig("paddocks", "story__lead", "(min-width: 1024px) 66vw, 100vw")}
<div class="story__pair">
${fig("timber", "", "(min-width: 768px) 50vw, 100vw")}
${fig("lane", "", "(min-width: 768px) 50vw, 100vw")}
</div>
${fig("autumn", "story__read", "(min-width: 1024px) 720px, 100vw")}
${fig("overlook", "story__wide", "(min-width: 1280px) 1184px, 100vw")}
</div>
</div>
</section>

${quoteBlock({ heading: "Planning sprinkler or sod work?", copy: "Tell J&amp;M about your property, location and the work you have in mind. We will confirm whether the project is a fit.", button: "Discuss your project" })}

${relatedLinks("Related", [[svc("install").path, "Sprinkler installation"], [svc("repair").path, "Sprinkler repair"], [svc("sod").path, "Sod installation"], [city("larkspur").path, "Larkspur service area"]])}`,
      }),
    };
  },
};
