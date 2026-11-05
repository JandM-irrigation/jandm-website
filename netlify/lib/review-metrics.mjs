/* Privacy-safe performance counts for the staff 1-Tap Review tool.

   1. Each request from Juan's sending key leaves one marker in the "review-requests" Netlify Blobs
      store:   metrics/v1/events/<YYYY-MM-DD, Mountain Time>/<outcome>/<random id>   value {}
      One marker per request, so concurrent taps never overwrite each other's counts.
   2. Every night (netlify/functions/review-maintenance.mjs) finished days are rolled into one
      daily aggregate:   metrics/v1/daily/<YYYY-MM-DD>   { counts: { <outcome>: n }, rolled: [ids] }
      and their markers are deleted. "rolled" lists the marker ids already added, so a run that
      stops half way can be repeated without counting anything twice.
   3. Aggregates are kept for 13 months (RETENTION_MONTHS), then deleted.

   The day and the outcome are the only information kept: no name, phone number (not even hashed),
   message text, staff key, request ID or webhook. Requests refused before Juan is identified are
   not counted (an anonymous caller must not be able to fill the store); they stay in the logs.

   Delivery: a 2xx answer from GoHighLevel means GoHighLevel ACCEPTED the webhook. It does not mean
   the text message was delivered. Delivery is visible only inside GoHighLevel, so this module
   never reports "delivered"; see docs/review-request-metrics.md. */
import { randomUUID } from "node:crypto";

export const TIME_ZONE = "America/Denver";
export const RETENTION_MONTHS = 13;
export const MAX_REPORT_DAYS = 92;
const EVENTS = "metrics/v1/events/";
const DAILY = "metrics/v1/daily/";

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
const groupOf = (stored) => GROUPS[stored === "webhook_accepted" ? "sent" : stored] || null;

export const DEFINITIONS = {
  attempts: "Every request from Juan's sending key, whatever the result.",
  webhook_accepted: "GoHighLevel answered 2xx: the webhook was accepted. NOT confirmation that a text was delivered.",
  duplicate: "Not sent: the same tap was already handled, or the number got a request in the last 24 hours.",
  rate_limited: "Not sent: over the hourly or daily limit (or the limit counter was busy; see the docs).",
  upstream_failure: "Not sent: GoHighLevel refused the request or could not be reached.",
  upstream_unconfirmed: "GoHighLevel did not answer in time. It may or may not have received the request.",
  invalid: "Not sent: missing or invalid name, phone number or request.",
  delivery_confirmed: "Not measured by the website (null). Read SMS delivery in GoHighLevel.",
};

const isDay = (d) => {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T00:00:00Z`) : NaN;
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d; // rejects 2026-02-30
};

export function localDay(ms, timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

// The first day still kept: the same date RETENTION_MONTHS earlier (clamped to the month's length).
export function retentionStart(today, months = RETENTION_MONTHS) {
  const [y, m, d] = today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/* Records one outcome. Never throws and never changes the answer to the caller: a failed write
   is logged (without request details) and the request result stands. */
export async function recordOutcome(store, code, ms, log = (r) => console.log(JSON.stringify(r))) {
  if (!GROUPS[code]) return false;
  try {
    await store.setJSON(`${EVENTS}${localDay(ms)}/${STORED[code] || code}/${randomUUID()}`, {}, { onlyIfNew: true });
    return true;
  } catch {
    log({ event: "review_metrics", outcome: "write_failed" });
    return false;
  }
}

async function listEvents(store) {
  const { blobs } = await store.list({ prefix: EVENTS });
  return blobs.map(({ key }) => {
    const [day, stored, id] = key.slice(EVENTS.length).split("/");
    return { key, day, stored, id };
  }).filter((e) => isDay(e.day) && groupOf(e.stored) && e.id);
}

/* Rolls every finished day (before today, Mountain Time) into its daily aggregate, then deletes
   that day's markers. Safe to repeat and to stop at any point. Returns { days, markers }. */
export async function rollUp(store, nowMs) {
  const today = localDay(nowMs);
  const byDay = new Map();
  for (const e of await listEvents(store)) if (e.day < today) byDay.set(e.day, [...(byDay.get(e.day) || []), e]);
  let markers = 0;
  for (const [day, events] of byDay) {
    let saved = false;
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      const current = await store.getWithMetadata(`${DAILY}${day}`, { type: "json" });
      const agg = current?.data || { counts: {}, rolled: [] };
      const rolled = new Set(agg.rolled);
      for (const e of events) if (!rolled.has(e.id)) { agg.counts[e.stored] = (agg.counts[e.stored] || 0) + 1; rolled.add(e.id); }
      agg.rolled = [...rolled];
      const result = await store.setJSON(`${DAILY}${day}`, agg, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
      saved = result.modified;
    }
    if (!saved) continue; // markers stay and are counted live; the next run tries again
    for (const e of events) { await store.delete(e.key); markers += 1; }
  }
  return { days: byDay.size, markers };
}

// Deletes aggregates and markers older than the retention period. Returns the number deleted.
export async function pruneMetrics(store, nowMs) {
  const keep = retentionStart(localDay(nowMs));
  let deleted = 0;
  for (const prefix of [DAILY, EVENTS]) {
    const { blobs } = await store.list({ prefix });
    for (const { key } of blobs) {
      const day = key.slice(prefix.length, prefix.length + 10);
      if (isDay(day) && day < keep) { await store.delete(key); deleted += 1; }
    }
  }
  return deleted;
}

const emptyRow = (date) => ({ date, attempts: 0, webhook_accepted: 0, duplicate: 0, rate_limited: 0, upstream_failure: 0, upstream_unconfirmed: 0, invalid: 0, delivery_confirmed: null });
const add = (row, stored, n) => { const g = groupOf(stored); if (g) { row[g] += n; row.attempts += n; } };

export function* daysBetween(from, to) {
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400000) yield new Date(t).toISOString().slice(0, 10);
}

// Daily rows for from..to inclusive (Mountain Time days): aggregates plus markers not yet rolled up.
export async function readReport(store, from, to) {
  const rows = new Map([...daysBetween(from, to)].map((d) => [d, emptyRow(d)]));
  const rolled = new Map();
  for (const [day, row] of rows) {
    const agg = (await store.getWithMetadata(`${DAILY}${day}`, { type: "json" }))?.data;
    if (!agg) continue;
    for (const [stored, n] of Object.entries(agg.counts || {})) add(row, stored, n);
    rolled.set(day, new Set(agg.rolled || []));
  }
  for (const e of await listEvents(store)) {
    const row = rows.get(e.day);
    if (row && !rolled.get(e.day)?.has(e.id)) add(row, e.stored, 1);
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
