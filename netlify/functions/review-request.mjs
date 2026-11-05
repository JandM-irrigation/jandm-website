/* POST /api/review-request: the staff 1-Tap Review tool's only way to send a review request.
   Staff authentication, validation, duplicate and rate limits, and the GoHighLevel call are in
   netlify/lib/review-request.mjs. State (request IDs, 24-hour phone holds, per-staff counters) is
   kept in a Netlify Blobs store; no names or phone numbers are stored or logged. */
import { getStore } from "@netlify/blobs";
import { createHandler } from "../lib/review-request.mjs";

export default async (request) => {
  let store;
  try {
    store = getStore({ name: "review-requests", consistency: "strong" });
  } catch {
    // Without its store the function cannot enforce duplicate and rate limits, so it sends nothing.
    console.log(JSON.stringify({ event: "review_request", outcome: "store_unavailable", status: 503 }));
    return new Response(JSON.stringify({ ok: false, code: "not_configured" }), { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return createHandler({ env: process.env, store })(request);
};

export const config = { path: "/api/review-request", method: "POST" };
