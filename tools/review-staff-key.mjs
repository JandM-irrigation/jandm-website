// Creates a key for the 1-Tap Review tool. The owner runs this.
//   node tools/review-staff-key.mjs juan               Juan's SENDING key (Juan is the only sender)
//   node tools/review-staff-key.mjs <label> --report   a READ-ONLY report key, e.g. moa-report
//   label: a-z, 0-9, _ or -.
// A sending key prints:
//   - the REVIEW_STAFF_KEYS entry (juan:hash) to put in Netlify. Only the hash is stored there.
//   - the staff link to open once on Juan's phone. It contains the key: send it privately. Opening it
//     saves the key on that phone and removes it from the address bar. To revoke, replace the entry.
// A report key prints the REVIEW_REPORT_KEYS entry and the key itself (it starts with "rpt_").
// It can read /api/review-metrics only; it can never send (netlify/lib/review-auth.mjs).
import { randomBytes } from "node:crypto";
import { REPORT_PREFIX, SENDER, reportHash, sha256 } from "../netlify/lib/review-auth.mjs";

const label = process.argv[2] || "";
const report = process.argv.includes("--report");
if (!/^[a-z0-9_-]{1,32}$/.test(label)) {
  console.error("Usage: node tools/review-staff-key.mjs juan | <label> --report   (a-z, 0-9, _ or -, up to 32 characters)");
  process.exit(1);
}
if (!report && label !== SENDER) {
  console.error(`Only "${SENDER}" can send review requests. For read-only reporting use: node tools/review-staff-key.mjs ${label} --report`);
  process.exit(1);
}
const secret = randomBytes(32).toString("base64url");
if (report) {
  const key = REPORT_PREFIX + secret;
  console.log(`REVIEW_REPORT_KEYS entry (add to the comma-separated list in Netlify):\n  ${label}:${reportHash(key)}\n`);
  console.log(`Report key for ${label} (read only; keep it in a password manager; set it as REVIEW_REPORT_KEY when running tools/review-metrics-report.mjs):\n  ${key}`);
} else {
  const key = secret.startsWith(REPORT_PREFIX) ? `x${secret.slice(1)}` : secret; // never looks like a report key
  console.log(`REVIEW_STAFF_KEYS entry (the whole value in Netlify):\n  ${label}:${sha256(key)}\n`);
  console.log(`Staff link for ${label} (open once on Juan's phone; send privately):\n  https://jmirrigationco.com/review.html#key=${key}`);
}
