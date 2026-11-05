/* Scheduled: every day at 09:00 UTC (2–3 AM Mountain Time, when the review tool is not in use).
   Rolls up and prunes the 1-Tap Review store; see netlify/lib/review-maintenance.mjs.
   Netlify runs scheduled functions on the published production deploy only, never on previews. */
import { getStore } from "@netlify/blobs";
import { runMaintenance } from "../lib/review-maintenance.mjs";

export default async () => {
  try {
    await runMaintenance(getStore({ name: "review-requests", consistency: "strong" }), Date.now());
  } catch {
    console.log(JSON.stringify({ event: "review_maintenance", outcome: "store_unavailable" }));
  }
};

export const config = { schedule: "0 9 * * *" };
