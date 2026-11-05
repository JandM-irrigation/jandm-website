// Prints daily 1-Tap Review counts as CSV, for the monthly comparison with Google reviews
// (docs/review-request-metrics.md).
//   REVIEW_REPORT_KEY=<report key> node tools/review-metrics-report.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--site URL]
// The key is read from the environment so it never appears in the command line or shell history
// arguments. Default range: the last 28 days (Mountain Time). Read only: nothing is sent or changed.
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const key = process.env.REVIEW_REPORT_KEY || "";
if (!key) { console.error("Set REVIEW_REPORT_KEY to a report key (node tools/review-staff-key.mjs <label> --report)."); process.exit(1); }

const url = new URL("/api/review-metrics", arg("site") || "https://jmirrigationco.com");
url.searchParams.set("format", "csv");
for (const p of ["from", "to"]) if (arg(p)) url.searchParams.set(p, arg(p));

const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text}`); process.exit(1); }
process.stdout.write(text);
