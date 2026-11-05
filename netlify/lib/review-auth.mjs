/* Keys for the 1-Tap Review tool. Two kinds, authenticated separately, each good for one thing only.

   SENDING key  (REVIEW_STAFF_KEYS, used only by /api/review-request)
     Entry "label:sha256(key)". Only the label SENDER ("juan") may send: any other label is
     refused even when its hash matches, so adding a key to the list cannot add a sender.
   REPORT key   (REVIEW_REPORT_KEYS, used only by /api/review-metrics)
     The key starts with "rpt_"; the entry is "label:sha256(REPORT_DOMAIN + key)". It can read the
     daily counts and nothing else:
     - /api/review-request refuses any "rpt_" key before looking at the lists;
     - its hash is computed differently, so a report entry pasted into REVIEW_STAFF_KEYS by mistake
       matches nothing, and a sending key can never match a report entry;
     - /api/review-metrics never reads REVIEW_STAFF_KEYS.
   Create both with tools/review-staff-key.mjs. Hashes are compared in constant time. */
import { createHash, timingSafeEqual } from "node:crypto";

export const SENDER = "juan";
export const REPORT_PREFIX = "rpt_";
export const REPORT_DOMAIN = "jm-review-report-v1:";

export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
export const reportHash = (key) => sha256(REPORT_DOMAIN + key);

// "label:sha256hex, …" → [{ label, hash }] or null when empty or any entry is malformed.
export function parseKeys(raw) {
  const entries = String(raw || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [label, hash] = s.split(":");
    return /^[a-z0-9_-]{1,32}$/.test(label || "") && /^[a-f0-9]{64}$/.test(hash || "") ? { label, hash: Buffer.from(hash, "hex") } : null;
  });
  return entries.length && entries.every(Boolean) ? entries : null;
}

const bearer = (request) => (request.headers.get("authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{32,128})$/)?.[1] || null;
const match = (keys, hex) => {
  const presented = Buffer.from(hex, "hex");
  return keys.find((k) => timingSafeEqual(k.hash, presented)) || null;
};

/* Sending: { label, sender } for a listed sending key, else null. sender is true only for SENDER;
   the caller must refuse when it is false. A report key is never a sending key. */
export function authenticateSender(request, keys) {
  const token = bearer(request);
  if (!token || token.startsWith(REPORT_PREFIX) || !keys) return null;
  const entry = match(keys, sha256(token));
  return entry ? { label: entry.label, sender: entry.label === SENDER } : null;
}

// Reporting: { label } for a listed report key, else null.
export function authenticateReporter(request, keys) {
  const token = bearer(request);
  if (!token || !token.startsWith(REPORT_PREFIX) || !keys) return null;
  const entry = match(keys, reportHash(token));
  return entry ? { label: entry.label } : null;
}
