/* Nightly upkeep of the "review-requests" Blobs store (netlify/functions/review-maintenance.mjs).

   - Measurement: roll finished days into daily aggregates; delete aggregates older than 13 months.
   - Request-tool state from /api/review-request, deleted once it can no longer change a decision:
       phone/<keyed hash>   24-hour same-number hold; deleted 48 hours after it was set.
                            This is the only per-customer value in the store, so it is not kept.
       request/<id>         double-tap guard ({ at, staff }); deleted after 7 days.
       rate/<label>/h|d/<n> hourly and daily counters; deleted once two buckets old.
   Each step runs on its own: a failure is logged as a count-free line and the other steps go on.
   Logs carry counts only. */
import { pruneMetrics, rollUp } from "./review-metrics.mjs";

export const KEEP = { phoneHoldMs: 48 * 3600000, requestIdMs: 7 * 86400000 };

export async function pruneState(store, nowMs, keep = KEEP) {
  const deleted = { phone: 0, request: 0, rate: 0 };
  for (const prefix of ["phone/", "request/"]) {
    const limit = prefix === "phone/" ? keep.phoneHoldMs : keep.requestIdMs;
    const { blobs } = await store.list({ prefix });
    for (const { key } of blobs) {
      const at = (await store.getWithMetadata(key, { type: "json" }))?.data?.at;
      if (typeof at === "number" && nowMs - at > limit) { await store.delete(key); deleted[prefix.slice(0, -1)] += 1; }
    }
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
