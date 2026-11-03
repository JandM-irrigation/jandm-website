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
};

// The five retained services, in the brief's order. `value` keeps the existing form values so
// delivered leads read the same as before; `slug` is the analytics enum.
export const SERVICES = [
  { key: "repair", name: "Sprinkler repair", path: "/sprinkler-repair.html", value: "Sprinkler repair", slug: "repair",
    summary: "Leaks, broken heads, uneven coverage or a zone that will not run. Get the problem checked before deciding on the repair." },
  { key: "install", name: "Sprinkler installation", path: "/sprinkler-installation.html", value: "New sprinkler system", slug: "installation",
    summary: "A new system planned for your yard, with zones, components and controller setup explained before work begins." },
  { key: "blowouts", name: "Sprinkler blowouts", path: "/sprinkler-blowouts.html", value: "Blowout", slug: "blowout",
    summary: "Seasonal winterization to clear water from your sprinkler system before freezing conditions." },
  { key: "startup", name: "Spring start-ups", path: "/spring-start-up.html", value: "Spring start-up", slug: "spring_startup",
    summary: "Water turned back on, zones checked and heads adjusted for the new season." },
  { key: "sod", name: "Sod installation", path: "/sod-installation.html", value: "Sod installation", slug: "sod",
    summary: "Soil preparation, fresh sod and a watering handoff for your new lawn." },
];
export const NOT_SURE = { name: "Not sure", value: "Not sure", slug: "not_sure" };

export const CITIES = [
  { key: "denver", name: "Denver", path: "/sprinkler-services-denver.html", label: "Denver" },
  { key: "aurora", name: "Aurora", path: "/sprinkler-services-aurora.html", label: "Aurora" },
  { key: "commerce-city", name: "Commerce City", path: "/sprinkler-services-commerce-city.html", label: "Commerce City" },
  { key: "thornton", name: "Thornton", path: "/sprinkler-services-thornton.html", label: "Thornton" },
  { key: "parker", name: "Parker", path: "/sprinkler-services-parker.html", label: "Parker" },
  { key: "castle-rock", name: "Castle Rock", path: "/sprinkler-services-castle-rock.html", label: "Castle Rock" },
  { key: "larkspur", name: "Larkspur", path: "/sprinkler-services-larkspur.html", label: "Larkspur" },
  { key: "colorado-springs", name: "Colorado Springs", path: "/sprinkler-services-colorado-springs.html", label: "Colorado Springs: larger projects" },
];

// Featured projects (the brief's reusable showcase shape) are kept in .private/featured-project.mjs,
// which git ignores, until the owner records publication permission. See tools/build.mjs.
