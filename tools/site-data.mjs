// Content for the J&M Irrigation Services site. tools/build.mjs turns this into the static pages.
// Phone, hours, banners and reviews come from content/site.json (edited in the CMS at /admin).
//
// The facts below are advertised on the current live site but are unconfirmed for the relaunch.
// They appear only in the local review build until the owner confirms them as one group; then set
// FACTS_CONFIRMED to true (editing any wording first) and rebuild.
export const FACTS_CONFIRMED = false;

export const SITE = "https://jmirrigationco.com";
export const BUSINESS_ID = `${SITE}/#business`;
export const EMAIL = "jandm.irrigation24@gmail.com";

export const FACTS = {
  diagnostic: "Repairs start with a $75 diagnostic visit. We find the problem and give you the price to fix it. If you have us do the repair, the $75 is waived.", // PENDING
  diagnosticShort: "Repair visits start with a $75 diagnostic. It is waived if you have us do the repair.", // PENDING
  freeEstimate: "Estimates for new sprinkler systems are free.", // PENDING
  warranty: "Every new install comes with a 1-year warranty, and your first fall blowout is on us.", // PENDING
  firstBlowout: "If J&M installed your system, your first blowout is free.", // PENDING
  experience: "With more than 20 years of experience working on sprinkler systems,", // PENDING
};

export const LOGO_ALT = "J&M Irrigation Services — Do it right the first time.";

// Real J&M job photos already on the site (images/work).
export const WORK = {
  hero: { src: "/images/work/crew-hero.webp", w: 1080, h: 1350, alt: "J&M crew member walking a lawn while testing each sprinkler zone under pine trees" },
  install: { src: "/images/work/install-trench.webp", w: 1100, h: 1100, alt: "Freshly dug irrigation trench with new line along a ranch fence" },
  repair: { src: "/images/work/repair-split-pipe.webp", w: 1086, h: 1086, alt: "Split irrigation line spraying water in a dug-out hole in a lawn" },
  freeze: { src: "/images/work/freeze-cracked-pipe.webp", w: 1400, h: 1050, alt: "Cracked PVC sprinkler line leaking water in a dug-out hole after a freeze" },
  heads: { src: "/images/work/heads-rock-border.webp", w: 1100, h: 1100, alt: "Row of sprinkler heads running along a lawn beside a rock border" },
  sod: { src: "/images/work/sod-after-2.webp", w: 900, h: 1200, alt: "Side yard with an established green lawn and gravel border after new sod" },
  pines: { src: "/images/work/pines-fence.webp", w: 1400, h: 933, alt: "Pine trees and a ranch fence on a lawn J&M waters, with sprinklers running" },
  shed: { src: "/images/work/lawn-shed.webp", w: 1100, h: 1100, alt: "Sprinklers watering a wide lawn with pine trees and a shed" },
  zones: { src: "/images/work/zones-pines.webp", w: 1100, h: 1100, alt: "Sprinkler zones running across a lawn between pine trees" },
  patio: { src: "/images/work/patio-after.webp", w: 900, h: 1200, alt: "Finished backyard with planting bed, rock and lawn with sprinklers running" },
  street: { src: "/images/work/street-after.webp", w: 900, h: 1200, alt: "Lawn strip restored after a new sprinkler line went in" },
};

// Authentic before/after pairs from the original J&M site: each pair is the same property, same
// angle. Alt text and captions are the original site's wording.
export const BEFORE_AFTER = {
  patio: {
    caption: "Backyard lawn, planting bed and rock",
    before: { src: "/images/work/patio-before.webp", alt: "Before: Bare dirt around a new patio" },
    after: { src: "/images/work/patio-after.webp", alt: "After: Finished backyard with planting bed, rock and lawn with sprinklers running" },
  },
  street: {
    caption: "Street-side sprinkler line",
    before: { src: "/images/work/street-before.webp", alt: "Before: Crew laying new PVC sprinkler line in an open trench" },
    after: { src: "/images/work/street-after.webp", alt: "After: Lawn strip restored after the new sprinkler line went in" },
  },
  sod: {
    caption: "Bare dirt to new sod",
    before: { src: "/images/work/sod-before.webp", alt: "Before: Bare dirt side yard before sod" },
    after: { src: "/images/work/sod-after-2.webp", alt: "After: Same side yard with an established green lawn and gravel border" },
  },
};

// The five retained services. Revision 3 leads with new installations; repair and seasonal care follow. `value` keeps the existing form values so
// delivered leads read the same as before; `slug` is the analytics enum.
export const SERVICES = [
  { key: "install", name: "Sprinkler installation", path: "/sprinkler-installation.html", value: "New sprinkler system", slug: "installation",
    summary: "Complete new systems for new landscapes, larger lots and acreage, planned zone by zone before any trenching starts." },
  { key: "sod", name: "Sod installation", path: "/sod-installation.html", value: "Sod installation", slug: "sod",
    summary: "Soil preparation, fresh sod and a watering handoff for your new lawn." },
  { key: "repair", name: "Sprinkler repair", path: "/sprinkler-repair.html", value: "Sprinkler repair", slug: "repair",
    summary: "Leaks, broken heads, uneven coverage or a zone that will not run. Get the problem checked before deciding on the repair." },
  { key: "blowouts", name: "Sprinkler blowouts", path: "/sprinkler-blowouts.html", value: "Blowout", slug: "blowout",
    summary: "Seasonal winterization to clear water from your sprinkler system before freezing conditions." },
  { key: "startup", name: "Spring start-ups", path: "/spring-start-up.html", value: "Spring start-up", slug: "spring_startup",
    summary: "Water turned back on, zones checked and heads adjusted for the new season." },
];
export const NOT_SURE = { name: "Not sure", value: "Not sure", slug: "not_sure" };

// Priority markets first (Revision 3): Castle Rock and the rest of Douglas County, then Colorado
// Springs, then the Denver-area cities. `douglas` marks cities in Douglas County.
export const CITIES = [
  { key: "castle-rock", name: "Castle Rock", path: "/sprinkler-services-castle-rock.html", label: "Castle Rock", douglas: true },
  { key: "colorado-springs", name: "Colorado Springs", path: "/sprinkler-services-colorado-springs.html", label: "Colorado Springs" },
  { key: "parker", name: "Parker", path: "/sprinkler-services-parker.html", label: "Parker", douglas: true },
  { key: "larkspur", name: "Larkspur", path: "/sprinkler-services-larkspur.html", label: "Larkspur", douglas: true },
  { key: "denver", name: "Denver", path: "/sprinkler-services-denver.html", label: "Denver" },
  { key: "aurora", name: "Aurora", path: "/sprinkler-services-aurora.html", label: "Aurora" },
  { key: "thornton", name: "Thornton", path: "/sprinkler-services-thornton.html", label: "Thornton" },
  { key: "commerce-city", name: "Commerce City", path: "/sprinkler-services-commerce-city.html", label: "Commerce City" },
];

// Approximate project size, asked on the estimate forms to qualify larger installations.
export const SCOPES = ["A repair or small job", "A typical home yard", "A large lot (about half an acre or more)", "Acreage or several properties", "Not sure yet"];

// Featured projects (the brief's reusable showcase shape) are kept in .private/featured-project.mjs,
// which git ignores, until the owner records publication permission. See tools/build.mjs.
