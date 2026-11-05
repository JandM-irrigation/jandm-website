// Creates a staff key for the 1-Tap Review tool. The owner runs this, once per staff member or device.
//   node tools/review-staff-key.mjs <label>        label: a-z, 0-9, _ or -, e.g. juan-phone
// Prints:
//   - the REVIEW_STAFF_KEYS entry (label:hash) to add in Netlify. Only the hash is stored there.
//   - the staff link to open once on that person's phone. It contains the key: send it privately,
//     never by a group chat or email list. Opening it saves the key on that phone and removes it from
//     the address bar. To revoke access, delete that entry in Netlify and redeploy.
import { randomBytes, createHash } from "node:crypto";

const label = process.argv[2] || "";
if (!/^[a-z0-9_-]{1,32}$/.test(label)) {
  console.error("Usage: node tools/review-staff-key.mjs <label>   (a-z, 0-9, _ or -, up to 32 characters)");
  process.exit(1);
}
const key = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(key, "utf8").digest("hex");
console.log(`REVIEW_STAFF_KEYS entry (add to the comma-separated list in Netlify):\n  ${label}:${hash}\n`);
console.log(`Staff link for ${label} (open once on their phone; send privately):\n  https://jmirrigationco.com/review.html#key=${key}`);
