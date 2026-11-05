/* GET /api/review-metrics: daily 1-Tap Review counts (read only). See netlify/lib/review-report.mjs
   and docs/review-request-metrics.md. Reads the same Netlify Blobs store as review-request.mjs. */
import { getStore } from "@netlify/blobs";
import { createReportHandler } from "../lib/review-report.mjs";

export default async (request) => {
  let store;
  try {
    store = getStore({ name: "review-requests", consistency: "strong" });
  } catch {
    console.log(JSON.stringify({ event: "review_metrics_read", outcome: "store_unavailable", status: 503 }));
    return new Response(JSON.stringify({ ok: false, code: "not_configured" }), { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return createReportHandler({ env: process.env, store })(request);
};

export const config = { path: "/api/review-metrics", method: "GET" };
