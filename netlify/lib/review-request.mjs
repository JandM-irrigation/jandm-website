/* Server side of the staff 1-Tap Review tool (review.html), used by netlify/functions/review-request.mjs.

   A review request is sent only when:
   - the caller presents a sending key whose SHA-256 hash is listed in REVIEW_STAFF_KEYS under the
     label "juan" (Juan is the only sender; other labels are refused: netlify/lib/review-auth.mjs);
   - the name and US phone number are valid;
   - the same tap was not already handled (request_id), the same number was not sent a request in the
     last 24 hours, and that staff key is under its hourly and daily limits.
   Only then is the request forwarded to the GoHighLevel webhook in REVIEW_WEBHOOK_URL, which never
   reaches the browser.

   Environment (Netlify → Site configuration → Environment variables, scope: Functions, marked secret):
     REVIEW_WEBHOOK_URL  the GoHighLevel inbound-webhook URL (https://services.leadconnectorhq.com/hooks/…)
     REVIEW_STAFF_KEYS   comma-separated "label:sha256hex" entries. Only "juan" can send.
                         Create the entry with: node tools/review-staff-key.mjs juan
   Either missing or invalid: every request is refused (503) and nothing is sent.

   Logs carry the staff label, the outcome and the request ID only: never a name or phone number.
   Every request from an authenticated staff key is also counted by day and outcome only
   (netlify/lib/review-metrics.mjs); counting never changes what is sent or answered. */
import { createHmac } from "node:crypto";
import { authenticateSender, parseKeys } from "./review-auth.mjs";
import { recordOutcome } from "./review-metrics.mjs";

export const ORIGIN = "https://jmirrigationco.com";
export const LIMITS = { perHour: 20, perDay: 60, samePhoneHours: 24, upstreamTimeoutMs: 10000, maxBodyBytes: 2048 };
const WEBHOOK = /^https:\/\/services\.leadconnectorhq\.com\/hooks\/[A-Za-z0-9/_-]+$/;
const REQUEST_ID = /^[A-Za-z0-9-]{16,64}$/;
const NAME = /^[\p{L}][\p{L}\p{M} .'’-]{0,78}[\p{L}.]$/u;


// US numbers only (the business and its customers are in Colorado). Returns +1XXXXXXXXXX or null.
export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/[\s().+-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const ten = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : null;
}

export function normalizeName(raw) {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  return NAME.test(name) ? name : null;
}

const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
});

/* store: a Netlify Blobs store (or a test double) with getWithMetadata, setJSON (onlyIfNew / onlyIfMatch)
   and delete. fetchImpl: fetch. now: () => milliseconds. log: (record) => void. */
export function createHandler({ env, store, fetchImpl = fetch, now = Date.now, log = (r) => console.log(JSON.stringify(r)), limits = LIMITS }) {
  return async function handle(request) {
    const started = now();
    const out = async (status, code, extra = {}, staff = null, requestId = null) => {
      log({ event: "review_request", outcome: code, status, staff, request_id: requestId, ms: now() - started });
      if (staff) await recordOutcome(store, code, started, log);
      return reply(status, { ok: status === 200, code, ...extra });
    };

    if (request.method !== "POST") return out(405, "method_not_allowed");
    const origin = request.headers.get("origin");
    if (origin && origin !== ORIGIN) return out(403, "bad_origin");

    const webhook = env.REVIEW_WEBHOOK_URL || "";
    const keys = parseKeys(env.REVIEW_STAFF_KEYS);
    if (!WEBHOOK.test(webhook) || !keys) return out(503, "not_configured");

    // Authentication: a listed sending key (never a report key), compared by hash in constant time.
    // Authorization: Juan only. Another listed label is refused and not counted.
    const staff = authenticateSender(request, keys);
    if (!staff) return out(401, "unauthorized");
    if (!staff.sender) return out(403, "sender_not_allowed", {}, staff.label);

    // Input validation
    if (!/^application\/json\b/i.test(request.headers.get("content-type") || "")) return out(415, "json_required", {}, staff.label);
    const text = await request.text();
    if (Buffer.byteLength(text) > limits.maxBodyBytes) return out(413, "too_large", {}, staff.label);
    let body;
    try { body = JSON.parse(text); } catch { return out(400, "invalid_json", {}, staff.label); }
    const requestId = typeof body?.request_id === "string" && REQUEST_ID.test(body.request_id) ? body.request_id : null;
    if (!requestId) return out(400, "invalid_request_id", {}, staff.label);
    const name = normalizeName(body.full_name);
    const phone = normalizePhone(body.phone);
    if (!name || !phone) return out(400, "invalid_input", { fields: [...(name ? [] : ["full_name"]), ...(phone ? [] : ["phone"])] }, staff.label, requestId);

    // 1. The same tap (a double tap, a retried network request) is handled once.
    const claimed = await store.setJSON(`request/${requestId}`, { at: now(), staff: staff.label }, { onlyIfNew: true });
    if (!claimed.modified) return out(409, "duplicate_request", {}, staff.label, requestId);

    // 2. Per-staff limits (atomic counters).
    const t = now();
    for (const [bucket, max] of [[`rate/${staff.label}/h/${Math.floor(t / 3600000)}`, limits.perHour], [`rate/${staff.label}/d/${Math.floor(t / 86400000)}`, limits.perDay]]) {
      if (!(await increment(store, bucket, max))) return out(429, "rate_limited", {}, staff.label, requestId);
    }

    // 3. One request per phone number per 24 hours. The number is stored only as a keyed hash.
    const phoneKey = `phone/${createHmac("sha256", webhook).update(phone).digest("hex")}`;
    const holdMs = limits.samePhoneHours * 3600000;
    const prior = await store.getWithMetadata(phoneKey, { type: "json" });
    if (prior && prior.data && t - prior.data.at < holdMs) return out(409, "recently_sent", {}, staff.label, requestId);
    const hold = await store.setJSON(phoneKey, { at: t }, prior ? { onlyIfMatch: prior.etag } : { onlyIfNew: true });
    if (!hold.modified) return out(409, "recently_sent", {}, staff.label, requestId);

    // 4. Forward to GoHighLevel. Success is reported only on a 2xx answer.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), limits.upstreamTimeoutMs);
    let res;
    try {
      res = await fetchImpl(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: name, phone }), signal: abort.signal });
    } catch (error) {
      clearTimeout(timer);
      if (abort.signal.aborted) {
        // GoHighLevel may still have received it: keep the 24-hour hold so a retry cannot text twice.
        return out(504, "upstream_unconfirmed", {}, staff.label, requestId);
      }
      await store.delete(phoneKey); // no connection was made: nothing was sent, a retry is safe
      return out(502, "upstream_unreachable", {}, staff.label, requestId);
    }
    clearTimeout(timer);
    if (!res.ok) {
      await store.delete(phoneKey);
      return out(502, "upstream_rejected", { upstream_status: res.status }, staff.label, requestId);
    }
    return out(200, "sent", {}, staff.label, requestId);
  };
}

// Adds one to a counter unless it is already at max. Compare-and-set, retried on a concurrent write.
async function increment(store, key, max) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await store.getWithMetadata(key, { type: "json" });
    const count = current?.data?.count || 0;
    if (count >= max) return false;
    const result = await store.setJSON(key, { count: count + 1 }, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (result.modified) return true;
  }
  return false; // heavy contention: refuse rather than exceed the limit
}
