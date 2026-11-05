// Creates a key for the 1-Tap Review tool. The owner runs this.
//   node tools/review-staff-key.mjs <label>            a SENDING key, e.g. juan-phone
//   node tools/review-staff-key.mjs <label> --report   a READ-ONLY report key, e.g. moa-report
//   label: a-z, 0-9, _ or -.
// A sending key prints:
//   - the REVIEW_STAFF_KEYS entry (label:hash) to add in Netlify. Only the hash is stored there.
//   - the staff link to open once on that person's phone. It contains the key: send it privately,
//     never by a group chat or email list. Opening it saves the key on that phone and removes it from
//     the address bar. To revoke access, delete that entry in Netlify and redeploy.
// A report key prints the REVIEW_REPORT_KEYS entry and the key itself. It can read
// /api/review-metrics and can never send a review request.
import { randomBytes, createHash } from "node:crypto";

const label = process.argv[2] || "";
const report = process.argv.includes("--report");
if (!/^[a-z0-9_-]{1,32}$/.test(label)) {
  console.error("Usage: node tools/review-staff-key.mjs <label> [--report]   (a-z, 0-9, _ or -, up to 32 characters)");
  process.exit(1);
}
const key = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(key, "utf8").digest("hex");
if (report) {
  console.log(`REVIEW_REPORT_KEYS entry (add to the comma-separated list in Netlify):\n  ${label}:${hash}\n`);
  console.log(`Report key for ${label} (read only; keep it in a password manager, set it as REVIEW_REPORT_KEY when running tools/review-metrics-report.mjs):\n  ${key}`);
} else {
  console.log(`REVIEW_STAFF_KEYS entry (add to the comma-separated list in Netlify):\n  ${label}:${hash}\n`);
  console.log(`Staff link for ${label} (open once on their phone; send privately):\n  https://jmirrigationco.com/review.html#key=${key}`);
}
