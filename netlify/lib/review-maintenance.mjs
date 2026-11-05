/* Nightly upkeep of the "review-requests" Blobs store (netlify/functions/review-maintenance.mjs).

   - Measurement: roll finished days into daily aggregates; delete aggregates older than 13 months.
   - Request-tool state from /api/review-request, deleted once it can no longer change a decision:
       phone/v2/<bucket>/…  24-hour same-number holds, in day buckets; a bucket is deleted by key
                            name once every hold in it is at least 48 hours old (48–72 h after it
                            was set). Never read-then-delete: see netlify/lib/phone-hold.mjs.
                            These keyed hashes are the only per-customer value in the store.
       request/<id>         double-tap guard ({ at, staff }); deleted after 7 days.
       rate/<label>/h|d/<n> hourly and daily counters; deleted once two buckets old.
   Each step runs on its own: a failure is logged as a count-free line and the other steps go on.
   Logs carry counts only. */
import { pruneMetrics, rollUp } from "./review-metrics.mjs";
import { pruneHolds } from "./phone-hold.mjs";
import { LIMITS } from "./review-request.mjs";

export const KEEP = { phoneHoldMs: 48 * 3600000, requestIdMs: 7 * 86400000 };

export async function pruneState(store, nowMs, keep = KEEP) {
  const deleted = { phone: await pruneHolds(store, nowMs, keep.phoneHoldMs, LIMITS.samePhoneHours * 3600000), request: 0, rate: 0 };
  // Double-tap guards are written once (onlyIfNew) and never refreshed, so read-then-delete is safe.
  const { blobs: requests } = await store.list({ prefix: "request/" });
  for (const { key } of requests) {
    const at = (await store.getWithMetadata(key, { type: "json" }))?.data?.at;
    if (typeof at === "number" && nowMs - at > keep.requestIdMs) { await store.delete(key); deleted.request += 1; }
  }
  const hour = Math.floor(nowMs / 3600000), day = Math.floor(nowMs / 86400000);
  const { blobs } = await store.list({ prefix: "rate/" });
  for (const { key } of blobs) {
    const m = key.match(/^rate\/[a-z0-9_-]+\/([hd])\/(\d+)$/);
    if (m && Number(m[2]) < (m[1] === "h" ? hour : day) - 1) { await store.delete(key); deleted.rate += 1; }
  }
  return deleted;
}

export async function runMaintenance(store, nowMs, log = (r) => console.log(JSON.stringify(r))) {
  const summary = { event: "review_maintenance" };
  const steps = [["rollup", () => rollUp(store, nowMs)], ["metrics_pruned", () => pruneMetrics(store, nowMs)], ["state_pruned", () => pruneState(store, nowMs)]];
  for (const [name, step] of steps) {
    try { summary[name] = await step(); } catch { summary[name] = "failed"; }
  }
  log(summary);
  return summary;
}
