/* Privacy-safe performance counts for the staff 1-Tap Review tool.

   Each request from an authenticated staff key leaves one tiny marker in the "review-requests"
   Netlify Blobs store:   metrics/v1/<YYYY-MM-DD, Mountain Time>/<outcome>/<random id>   value {}
   The day and the outcome are the only information kept. There is no name, phone number (not even
   hashed), message text, staff key, request ID or webhook. One marker per request means concurrent
   taps never overwrite each other's counts, and a day is counted by listing its markers.

   Requests without a valid staff key are not counted here (an anonymous caller must not be able
   to fill the store); they stay visible in the function logs as before.

   Delivery: a 2xx answer from GoHighLevel means GoHighLevel ACCEPTED the webhook. It does not mean
   the text message was delivered. Delivery is visible only inside GoHighLevel, so this module
   never reports "delivered"; see docs/review-request-metrics.md. */
import { randomUUID } from "node:crypto";

export const TIME_ZONE = "America/Denver";
const PREFIX = "metrics/v1/";
const isDay = (d) => {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00Z`) : NaN;
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d; // rejects 2026-02-30
};
export const MAX_REPORT_DAYS = 92;

// Handler outcome code → reporting group. Outcomes not listed here are not recorded.
export const GROUPS = {
  sent: "webhook_accepted",
  duplicate_request: "duplicate",
  recently_sent: "duplicate",
  rate_limited: "rate_limited",
  upstream_rejected: "upstream_failure",
  upstream_unreachable: "upstream_failure",
  upstream_unconfirmed: "upstream_unconfirmed",
  json_required: "invalid",
  too_large: "invalid",
  invalid_json: "invalid",
  invalid_request_id: "invalid",
  invalid_input: "invalid",
};
// Stored under its own name so a marker can never read as "sent" or "delivered".
const STORED = { sent: "webhook_accepted" };
const READ = Object.fromEntries(Object.entries(STORED).map(([code, stored]) => [stored, code]));

export const DEFINITIONS = {
  attempts: "Every request from an authenticated staff key, whatever the result.",
  webhook_accepted: "GoHighLevel answered 2xx: the webhook was accepted. NOT confirmation that a text was delivered.",
  duplicate: "Not sent: the same tap was already handled, or the number got a request in the last 24 hours.",
  rate_limited: "Not sent: the staff key was over its hourly or daily limit.",
  upstream_failure: "Not sent: GoHighLevel refused the request or could not be reached.",
  upstream_unconfirmed: "GoHighLevel did not answer in time. It may or may not have received the request.",
  invalid: "Not sent: missing or invalid name, phone number or request.",
  delivery_confirmed: "Not measured by the website (null). Read SMS delivery in GoHighLevel.",
};

export function localDay(ms, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/* Records one outcome. Never throws and never changes the answer to the caller: a failed write
   is logged (without request details) and the request result stands. */
export async function recordOutcome(store, code, ms, log = (r) => console.log(JSON.stringify(r))) {
  if (!GROUPS[code]) return false;
  try {
    const key = `${PREFIX}${localDay(ms)}/${STORED[code] || code}/${randomUUID()}`;
    await store.setJSON(key, {}, { onlyIfNew: true });
    return true;
  } catch {
    log({ event: "review_metrics", outcome: "write_failed" });
    return false;
  }
}

const emptyRow = (date) => ({ date, attempts: 0, webhook_accepted: 0, duplicate: 0, rate_limited: 0, upstream_failure: 0, upstream_unconfirmed: 0, invalid: 0, delivery_confirmed: null });

export function* daysBetween(from, to) {
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400000) yield new Date(t).toISOString().slice(0, 10);
}

// Daily rows for from..to inclusive (YYYY-MM-DD, Mountain Time days), plus totals.
export async function readReport(store, from, to) {
  const rows = new Map([...daysBetween(from, to)].map((d) => [d, emptyRow(d)]));
  const { blobs } = await store.list({ prefix: PREFIX });
  for (const { key } of blobs) {
    const [day, stored] = key.slice(PREFIX.length).split("/");
    const row = rows.get(day);
    const group = GROUPS[READ[stored] || stored];
    if (!row || !group) continue;
    row[group] += 1;
    row.attempts += 1;
  }
  const days = [...rows.values()];
  const totals = emptyRow(null);
  delete totals.date;
  for (const row of days) for (const k of Object.keys(totals)) if (k !== "delivery_confirmed") totals[k] += row[k];
  return { time_zone: TIME_ZONE, from, to, definitions: DEFINITIONS, days, totals };
}

// Validates a ?from=&to= range; defaults to the last 28 days ending today (Mountain Time).
export function parseRange(params, nowMs) {
  const to = params.get("to") || localDay(nowMs);
  const from = params.get("from") || localDay(Date.parse(`${to}T12:00:00Z`) - 27 * 86400000, "UTC");
  if (!isDay(from) || !isDay(to)) return null;
  const span = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  return span >= 1 && span <= MAX_REPORT_DAYS ? { from, to } : null;
}

const CSV_COLUMNS = ["date", "attempts", "webhook_accepted", "duplicate", "rate_limited", "upstream_failure", "upstream_unconfirmed", "invalid", "delivery_confirmed"];
export function toCsv(report) {
  const cell = (v) => (v === null ? "not_measured" : String(v));
  return [CSV_COLUMNS.join(","), ...report.days.map((row) => CSV_COLUMNS.map((c) => cell(row[c])).join(","))].join("\n") + "\n";
}
