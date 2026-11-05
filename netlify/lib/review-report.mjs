/* GET /api/review-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv] : daily 1-Tap Review counts.

   Least privilege: only a REPORT key (REVIEW_REPORT_KEYS, see netlify/lib/review-auth.mjs) can read.
   Juan's sending key cannot read here, and a report key can never send. Read only: this endpoint
   changes nothing. Answers JSON by default, CSV with ?format=csv. Range: at most 92 days;
   default the last 28. */
import { authenticateReporter, parseKeys } from "./review-auth.mjs";
import { parseRange, readReport, toCsv } from "./review-metrics.mjs";

const headers = (type) => ({ "Content-Type": type, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: headers("application/json; charset=utf-8") });

export function createReportHandler({ env, store, now = Date.now, log = (r) => console.log(JSON.stringify(r)) }) {
  return async function handle(request) {
    const done = (status, outcome, response, reader = null) => { log({ event: "review_metrics_read", outcome, status, reader }); return response; };
    if (request.method !== "GET") return done(405, "method_not_allowed", json(405, { ok: false, code: "method_not_allowed" }));

    const keys = parseKeys(env.REVIEW_REPORT_KEYS);
    if (!keys) return done(503, "not_configured", json(503, { ok: false, code: "not_configured" }));
    const reader = authenticateReporter(request, keys);
    if (!reader) return done(401, "unauthorized", json(401, { ok: false, code: "unauthorized" }));

    const params = new URL(request.url).searchParams;
    const range = parseRange(params, now());
    if (!range) return done(400, "invalid_range", json(400, { ok: false, code: "invalid_range", hint: "from/to as YYYY-MM-DD, at most 92 days" }), reader.label);

    let report;
    try { report = await readReport(store, range.from, range.to); } catch { return done(503, "store_unavailable", json(503, { ok: false, code: "store_unavailable" }), reader.label); }
    if (params.get("format") === "csv") return done(200, "ok", new Response(toCsv(report), { status: 200, headers: headers("text/csv; charset=utf-8") }), reader.label);
    return done(200, "ok", json(200, { ok: true, ...report }), reader.label);
  };
}
