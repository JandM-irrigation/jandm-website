// Tests for 1-Tap Review measurement, reporting and retention: netlify/lib/review-metrics.mjs,
// review-report.mjs, review-auth.mjs and review-maintenance.mjs.
//   node tools/test-review-metrics.mjs
// Nothing leaves this computer: GoHighLevel is a mock and the Blobs store is tools/blobs-double.mjs.
// All names and numbers are fictional (555-01xx numbers are reserved for fiction).
import { createHash } from "node:crypto";
import { createHandler, LIMITS } from "../netlify/lib/review-request.mjs";
import { createReportHandler } from "../netlify/lib/review-report.mjs";
import { readReport, localDay, parseRange, toCsv, recordOutcome, rollUp, pruneMetrics, retentionStart } from "../netlify/lib/review-metrics.mjs";
import { pruneState, runMaintenance } from "../netlify/lib/review-maintenance.mjs";
import { reportHash } from "../netlify/lib/review-auth.mjs";
import { memoryStore } from "./blobs-double.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  " + detail : ""}`); };

const WEBHOOK = "https://services.leadconnectorhq.com/hooks/TESTlocation/webhook-trigger/TEST-0000";
const JUAN = "J".repeat(20) + "uan_Sending-Key" + "x".repeat(8);
const REPORT = "rpt_" + "R".repeat(24) + "eport_Key-" + "y".repeat(8);
const CREW = "c".repeat(43);
const hash = (k) => createHash("sha256").update(k).digest("hex");
const ENV = { REVIEW_WEBHOOK_URL: WEBHOOK, REVIEW_STAFF_KEYS: `juan:${hash(JUAN)}, crew-1:${hash(CREW)}`, REVIEW_REPORT_KEYS: `moa-report:${reportHash(REPORT)}` };
const NOON_MT = Date.UTC(2026, 10, 5, 19, 0, 0); // 2026-11-05 12:00 MST
const DAY = "2026-11-05";

function harness({ env = ENV, store = memoryStore(), limits, start = NOON_MT } = {}) {
  let clock = start; const calls = [], logs = [];
  const h = { store, calls, logs, mode: "ok", advance: (ms) => { clock += ms; }, now: () => clock };
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    if (h.mode === "fail") return new Response("no", { status: 500 });
    if (h.mode === "throw") throw new TypeError("fetch failed");
    if (h.mode === "hang") return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    return new Response("{}", { status: 200 });
  };
  const log = (r) => logs.push(JSON.stringify(r));
  h.send = createHandler({ env, store, fetchImpl, now: h.now, log, limits: { ...LIMITS, upstreamTimeoutMs: 30, ...limits } });
  h.report = createReportHandler({ env, store, now: h.now, log });
  return h;
}
let seq = 0;
const rid = () => `req-${String(++seq).padStart(4, "0")}-abcdefghijkl`;
const NAMES = ["Pat Example", "Lee Sample", "Sam Fictional"];
async function send(h, { key = JUAN, name = NAMES[0], phone = "720-555-0101", id = rid(), origin = "https://jmirrigationco.com", raw } = {}) {
  const headers = { "content-type": "application/json", origin };
  if (key) headers.authorization = `Bearer ${key}`;
  const res = await h.send(new Request("https://jmirrigationco.com/api/review-request", { method: "POST", headers, body: raw ?? JSON.stringify({ request_id: id, full_name: name, phone }) }));
  return { status: res.status, body: await res.json() };
}
async function report(h, { key = REPORT, query = `from=${DAY}&to=${DAY}`, method = "GET" } = {}) {
  const headers = key ? { authorization: `Bearer ${key}` } : {};
  const res = await h.report(new Request(`https://jmirrigationco.com/api/review-metrics?${query}`, { method, headers }));
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { /* CSV */ }
  return { status: res.status, body, text, headers: res.headers };
}
const metricKeys = (store) => [...store.data.keys()].filter((k) => k.startsWith("metrics/"));

// ---------- 1. counting accuracy: one scripted day, every outcome ----------
{
  const h = harness({ limits: { perHour: 9 } }); // the 10th counted request is over the limit
  const ok1 = await send(h, { phone: "720-555-0101" });
  await send(h, { phone: "720-555-0102", name: NAMES[1] });
  await send(h, { phone: "720-555-0103", name: NAMES[2] });                 // 3 accepted
  await send(h, { phone: "720-555-0101" });                                 // duplicate: same number within 24 h
  const id = rid(); await send(h, { phone: "720-555-0104", id });           // 4th accepted
  await send(h, { phone: "720-555-0104", id });                             // duplicate: same tap
  await send(h, { phone: "12" });                                          // invalid
  await send(h, { raw: "{nope" });                                          // invalid
  h.mode = "fail"; await send(h, { phone: "720-555-0105" });                // upstream failure (rejected)
  h.mode = "throw"; await send(h, { phone: "720-555-0106" });               // upstream failure (unreachable)
  h.mode = "hang"; await send(h, { phone: "720-555-0107" });                // upstream unconfirmed
  h.mode = "ok"; await send(h, { phone: "720-555-0108" });                  // 5th accepted (9th against the hourly limit)
  const limited = await send(h, { phone: "720-555-0109" });                 // over the hourly limit
  await send(h, { key: "z".repeat(43) });                                   // unauthorized: not counted
  await send(h, { origin: "https://evil.example" });                        // other origin: not counted
  await send(h, { key: CREW, phone: "720-555-0110" });                      // listed but not Juan: refused, not counted
  const r = await report(h);
  const t = r.body.totals;
  const accepted2xx = h.calls.length - 3; // calls that GoHighLevel answered 2xx (3 calls failed or timed out)
  check("scripted day: accepted requests match GoHighLevel 2xx answers exactly", ok1.status === 200 && t.webhook_accepted === accepted2xx && t.webhook_accepted === 5, JSON.stringify(t));
  check("scripted day: duplicates counted (same tap + same number)", t.duplicate === 2, JSON.stringify(t));
  check("scripted day: invalid input counted", t.invalid === 2, JSON.stringify(t));
  check("scripted day: upstream failures counted (refused + unreachable)", t.upstream_failure === 2, JSON.stringify(t));
  check("scripted day: timeout counted as unconfirmed, not accepted, not failed", t.upstream_unconfirmed === 1, JSON.stringify(t));
  check("scripted day: rate limit counted", limited.status === 429 && t.rate_limited === 1, JSON.stringify(t));
  check("scripted day: attempts = every authenticated request (13)", t.attempts === 13 && t.attempts === t.webhook_accepted + t.duplicate + t.rate_limited + t.upstream_failure + t.upstream_unconfirmed + t.invalid, JSON.stringify(t));
  check("unauthorized, other-origin and non-Juan requests leave no marker", metricKeys(h.store).length === 13);
  check("the day row equals the totals", JSON.stringify({ ...r.body.days[0], date: undefined }) === JSON.stringify({ ...t, date: undefined }));
}

// ---------- 2. concurrency: counts are exact under parallel taps ----------
{
  const h = harness();
  await Promise.all(Array.from({ length: 25 }, (_, i) => send(h, { phone: `720555${String(1000 + i)}` })));
  let t = (await report(h)).body.totals;
  // PR #4 refuses (rate_limited) when its counter is heavily contended, so fewer than the limit may go out.
  check("25 parallel taps: every tap counted once, accepted = texts requested from GoHighLevel", t.attempts === 25 && t.webhook_accepted === h.calls.length && t.webhook_accepted <= LIMITS.perHour && t.webhook_accepted + t.rate_limited === 25, JSON.stringify(t));
  const h2 = harness(); const id = rid();
  await Promise.all(Array.from({ length: 5 }, () => send(h2, { id, phone: "720-555-0150" })));
  t = (await report(h2)).body.totals;
  check("same tap 5 times at once: 1 accepted, 4 duplicates, 1 text requested", t.webhook_accepted === 1 && t.duplicate === 4 && h2.calls.length === 1, JSON.stringify(t));
  const h3 = harness();
  await Promise.all(Array.from({ length: 5 }, () => send(h3, { phone: "720-555-0160" })));
  t = (await report(h3)).body.totals;
  check("same number from 5 new taps at once: 1 accepted, 4 duplicates", t.webhook_accepted === 1 && t.duplicate === 4 && h3.calls.length === 1, JSON.stringify(t));
}

// ---------- 3. days are Mountain Time, including across the DST change ----------
{
  check("23:30 MST on Nov 5 counts on Nov 5", localDay(Date.UTC(2026, 10, 6, 6, 30)) === "2026-11-05");
  check("00:30 MST on Nov 6 counts on Nov 6", localDay(Date.UTC(2026, 10, 6, 7, 30)) === "2026-11-06");
  check("23:30 MDT on Jul 1 counts on Jul 1", localDay(Date.UTC(2026, 6, 2, 5, 30)) === "2026-07-01");
  const h = harness({ start: Date.UTC(2026, 10, 6, 6, 30) });
  await send(h); h.advance(2 * 3600000); await send(h, { phone: "720-555-0170" });
  const r = await report(h, { query: "from=2026-11-04&to=2026-11-07" });
  check("report rows: one per day, each request on its own Mountain Time day", r.body.days.length === 4 && r.body.days.map((d) => d.webhook_accepted).join() === "0,1,1,0", JSON.stringify(r.body.days));
  const outside = await report(h, { query: "from=2026-11-07&to=2026-11-08" });
  check("markers outside the range are not counted", outside.body.totals.attempts === 0);
}

// ---------- 4. failures of the measurement never change the request ----------
{
  const base = memoryStore();
  const broken = { ...base, data: base.data, setJSON: async (key, ...rest) => { if (key.startsWith("metrics/")) throw new Error("blob write failed"); return base.setJSON(key, ...rest); } };
  const h = harness({ store: broken });
  const r = await send(h);
  check("metrics write fails: the request is still sent and answered 200", r.status === 200 && r.body.code === "sent" && h.calls.length === 1);
  check("metrics write failure is logged without request details", h.logs.some((l) => l === JSON.stringify({ event: "review_metrics", outcome: "write_failed" })));
  const again = await send(h, { phone: "720-555-0101" });
  check("metrics write fails: duplicate protection still holds", again.status === 409 && h.calls.length === 1);
  const failingRead = harness({ store: { ...base, list: async () => { throw new Error("list failed"); } } });
  const rr = await report(failingRead);
  check("report store failure: 503, no stack or detail", rr.status === 503 && rr.body.code === "store_unavailable" && !/list failed/.test(rr.text));
  check("recordOutcome ignores outcomes outside the reporting groups", (await recordOutcome(memoryStore(), "unauthorized", NOON_MT)) === false);
}

// ---------- 5. privacy ----------
{
  const h = harness();
  const ids = [rid(), rid()];
  await send(h, { id: ids[0], name: "Pat Example", phone: "(720) 555-0123" });
  await send(h, { id: ids[1], name: "Lee Sample", phone: "303-555-0188" });
  await send(h, { name: "Lee Sample", phone: "303-555-0188" });
  const keys = metricKeys(h.store);
  const values = keys.map((k) => h.store.data.get(k).value);
  check("markers hold only day, outcome and a random id", keys.every((k) => /^metrics\/v1\/events\/\d{4}-\d{2}-\d{2}\/[a-z_]+\/[0-9a-f-]{36}$/.test(k)), keys.join(" "));
  check("marker values are empty", values.every((v) => v === "{}"));
  const json = await report(h);
  const csv = await report(h, { query: `from=${DAY}&to=${DAY}&format=csv` });
  const everything = [...keys, ...values, json.text, csv.text, ...h.logs].join("\n");
  const forbidden = ["Pat", "Example", "Lee", "Sample", "555", "0123", "0188", "7205550123", JUAN, REPORT, hash(JUAN), hash(REPORT), "leadconnector", "TEST-0000", ...ids];
  check("no name, phone, staff or report key, key hash, webhook or request ID in markers or reports", forbidden.every((f) => !everything.replace(/"request_id":"req-[^"]+"/g, "").includes(f)), forbidden.filter((f) => everything.includes(f)).join(","));
  check("logs keep the request ID only on the request log line (unchanged from PR #4)", h.logs.filter((l) => l.includes(ids[0])).every((l) => l.startsWith('{"event":"review_request"')));
  check("the reporting log records only the outcome and the report key's label", h.logs.filter((l) => l.includes("review_metrics_read")).every((l) => /^\{"event":"review_metrics_read","outcome":"ok","status":200,"reader":"moa-report"\}$/.test(l)));
}

// ---------- 6. labels: accepted is never "delivered" ----------
{
  const h = harness();
  await send(h);
  const r = await report(h); const csv = await report(h, { query: `from=${DAY}&to=${DAY}&format=csv` });
  const fields = Object.keys(r.body.totals);
  check("report has webhook_accepted and no 'sent' or 'delivered' count", fields.includes("webhook_accepted") && !fields.some((f) => /^(sent|delivered)$/.test(f)));
  check("delivery_confirmed is null (not measured), never a number", r.body.totals.delivery_confirmed === null && r.body.days.every((d) => d.delivery_confirmed === null));
  check("definitions say accepted is not delivery", /NOT confirmation that a text was delivered/.test(r.body.definitions.webhook_accepted));
  check("markers are stored as webhook_accepted, never sent/delivered", metricKeys(h.store).every((k) => !/\/(sent|delivered)\//.test(k)) && metricKeys(h.store).some((k) => k.includes("/webhook_accepted/")));
  check("CSV header and delivery column", csv.text.split("\n")[0] === "date,attempts,webhook_accepted,duplicate,rate_limited,upstream_failure,upstream_unconfirmed,invalid,delivery_confirmed" && /,not_measured$/.test(csv.text.trim()));
  check("CSV is served as text/csv, not cached", /^text\/csv/.test(csv.headers.get("content-type")) && csv.headers.get("cache-control") === "no-store");
}

// ---------- 7. report access: Juan's key or a read-only report key ----------
{
  const h = harness();
  check("report: no key → 401", (await report(h, { key: null })).status === 401);
  check("report: wrong key → 401", (await report(h, { key: "z".repeat(43) })).status === 401);
  check("least privilege: Juan's sending key cannot read the report (401)", (await report(h, { key: JUAN })).status === 401);
  check("least privilege: a non-Juan staff key cannot read the report (401)", (await report(h, { key: CREW })).status === 401);
  const plainHash = harness({ env: { ...ENV, REVIEW_REPORT_KEYS: `moa-report:${hash(REPORT)}` } });
  check("report keys use their own hash: a plain-SHA-256 entry does not authenticate", (await report(plainHash)).status === 401);
  const sendingAsReport = harness({ env: { ...ENV, REVIEW_REPORT_KEYS: `juan:${reportHash(JUAN)}` } });
  check("a sending key (no rpt_ prefix) is never a report key", (await report(sendingAsReport, { key: JUAN })).status === 401);
  check("report: read-only report key → 200", (await report(h, { key: REPORT })).status === 200);
  check("report: POST refused (405)", (await report(h, { method: "POST" })).status === 405);
  const r = await send(h, { key: REPORT });
  check("a report key can never send a review request (401, nothing sent, nothing counted)", r.status === 401 && h.calls.length === 0 && metricKeys(h.store).length === 0);
  const leaked = harness({ env: { ...ENV, REVIEW_STAFF_KEYS: `juan:${hash(JUAN)}, juan:${reportHash(REPORT)}, crew-2:${hash(REPORT)}` } });
  const r2 = await send(leaked, { key: REPORT });
  check("a report key cannot send even if its hashes are pasted into REVIEW_STAFF_KEYS (401)", r2.status === 401 && leaked.calls.length === 0);
  check("no report keys configured → 503 (staff keys alone are not enough)", (await report(harness({ env: { ...ENV, REVIEW_REPORT_KEYS: "" } }), { key: JUAN })).status === 503);
  for (const q of ["from=2026-02-30&to=2026-03-01", "from=2026-11-05&to=2026-11-04", "from=2026-01-01&to=2026-12-31", "from=nov&to=dec", "from=2026-11-05T00:00&to=2026-11-05"]) {
    check(`report: invalid range rejected (${q})`, (await report(h, { query: q })).status === 400);
  }
  const d = await report(h, { query: "" });
  check("report: default range is the last 28 days ending today", d.body.days.length === 28 && d.body.to === DAY && d.body.from === "2026-10-09", `${d.body.from}..${d.body.to}`);
  check("parseRange accepts 92 days, refuses 93", parseRange(new URLSearchParams("from=2026-01-01&to=2026-04-02"), NOON_MT) !== null && parseRange(new URLSearchParams("from=2026-01-01&to=2026-04-03"), NOON_MT) === null);
}

// ---------- 8. CSV and report helpers ----------
{
  const store = memoryStore();
  await recordOutcome(store, "sent", NOON_MT);
  await recordOutcome(store, "recently_sent", NOON_MT);
  const rep = await readReport(store, DAY, DAY);
  check("readReport groups outcomes", rep.totals.webhook_accepted === 1 && rep.totals.duplicate === 1 && rep.totals.attempts === 2);
  check("toCsv: one header + one row per day", toCsv(rep).trim().split("\n").length === 2);
}

// ---------- 9. daily aggregates: roll-up is exact and repeatable ----------
{
  const h = harness();
  await send(h, { phone: "720-555-0201" }); await send(h, { phone: "720-555-0202" }); await send(h, { phone: "720-555-0201" }); await send(h, { phone: "1" });
  const before = (await report(h)).body.totals;
  h.advance(86400000); // next day
  await send(h, { phone: "720-555-0203" });
  const r1 = await rollUp(h.store, h.now());
  const keys = [...h.store.data.keys()];
  check("roll-up: yesterday's markers become one daily aggregate", r1.markers === 4 && keys.includes("metrics/v1/daily/2026-11-05") && !keys.some((k) => k.startsWith("metrics/v1/events/2026-11-05/")));
  check("roll-up: today's markers are left alone", keys.some((k) => k.startsWith("metrics/v1/events/2026-11-06/")) && !keys.includes("metrics/v1/daily/2026-11-06"));
  const after = (await report(h)).body.totals;
  check("roll-up: report for the rolled day is unchanged", JSON.stringify(before) === JSON.stringify(after), JSON.stringify([before, after]));
  await rollUp(h.store, h.now()); await rollUp(h.store, h.now());
  check("roll-up: repeating it changes nothing", JSON.stringify((await report(h)).body.totals) === JSON.stringify(before));
  const both = await report(h, { query: "from=2026-11-05&to=2026-11-06" });
  check("report: aggregate days and live days add up", both.body.totals.webhook_accepted === 3 && both.body.totals.attempts === 5, JSON.stringify(both.body.totals));
  await recordOutcome(h.store, "sent", NOON_MT); // a late marker for a day already rolled up
  check("report: a late marker for a rolled day is still counted", (await report(h)).body.totals.webhook_accepted === before.webhook_accepted + 1);
  await rollUp(h.store, h.now());
  check("roll-up: the late marker is merged once", (await report(h)).body.totals.webhook_accepted === before.webhook_accepted + 1);
  const agg = h.store.data.get("metrics/v1/daily/2026-11-05").value;
  check("aggregate holds only outcome counts and random marker ids", /^\{"counts":\{("[a-z_]+":\d+,?)+\},"rolled":\[("[0-9a-f-]{36}",?)+\]\}$/.test(agg), agg);
}
{
  // Stops half way: aggregate written, markers not deleted. The next run must not double count.
  const h = harness();
  await send(h, { phone: "720-555-0211" }); await send(h, { phone: "720-555-0212" });
  const q = { query: "from=2026-11-05&to=2026-11-05" };
  const before = (await report(h, q)).body.totals;
  h.advance(86400000);
  const real = h.store.delete; h.store.delete = async () => { throw new Error("delete failed"); };
  let threw = false; try { await rollUp(h.store, h.now()); } catch { threw = true; }
  check("interrupted roll-up: report still exact (aggregate + unrolled markers not double counted)", threw && JSON.stringify((await report(h, q)).body.totals) === JSON.stringify(before));
  h.store.delete = real;
  await rollUp(h.store, h.now());
  check("interrupted roll-up: the next run finishes without double counting", JSON.stringify((await report(h, q)).body.totals) === JSON.stringify(before) && !metricKeys(h.store).some((k) => k.includes("/events/2026-11-05/")));
}

// ---------- 10. retention: 13 months of aggregates, no customer data kept ----------
{
  check("retention start: 13 months back", retentionStart("2026-11-05") === "2025-10-05");
  check("retention start: clamps to the month's last day", retentionStart("2027-03-31") === "2026-02-28" && retentionStart("2028-02-29") === "2027-01-29");
  const store = memoryStore();
  for (const d of ["2025-10-04", "2025-10-05", "2026-11-04"]) await store.setJSON(`metrics/v1/daily/${d}`, { counts: { webhook_accepted: 1 }, rolled: [] });
  await store.setJSON("metrics/v1/events/2025-09-01/webhook_accepted/00000000-0000-4000-8000-000000000000", {});
  const n = await pruneMetrics(store, NOON_MT);
  const left = [...store.data.keys()].sort().join(",");
  check("prune: aggregates older than 13 months deleted, the rest kept", n === 2 && left === "metrics/v1/daily/2025-10-05,metrics/v1/daily/2026-11-04", left);
  const rep = await readReport(store, "2025-10-05", "2025-10-05");
  check("prune: the oldest kept day still reports", rep.totals.webhook_accepted === 1);
}
{
  const h = harness();
  await send(h, { phone: "720-555-0301" });
  h.advance(30 * 3600000); await send(h, { phone: "720-555-0302" });
  const blocked = await send(h, { phone: "720-555-0302" });
  h.advance(20 * 3600000); // first hold is now 50 h old, second 20 h
  const d = await pruneState(h.store, h.now());
  const keys = [...h.store.data.keys()];
  check("state prune: same-number hold deleted after 48 h, the current one kept", blocked.status === 409 && d.phone === 1 && keys.filter((k) => k.startsWith("phone/")).length === 1);
  const still = await send(h, { phone: "720-555-0302" });
  check("state prune: duplicate protection still holds for the kept hold", still.status === 409 && h.calls.length === 2);
  const hour = Math.floor(h.now() / 3600000), day = Math.floor(h.now() / 86400000);
  check("state prune: old rate counters deleted, current ones kept", d.rate >= 1 && keys.filter((k) => k.startsWith("rate/")).every((k) => { const m = k.match(/\/([hd])\/(\d+)$/); return Number(m[2]) >= (m[1] === "h" ? hour : day) - 1; }));
  h.advance(8 * 86400000);
  const d2 = await pruneState(h.store, h.now());
  const rest = [...h.store.data.keys()];
  check("state prune: double-tap guards deleted after 7 days", d2.request >= 3 && !rest.some((k) => k.startsWith("request/")));
  check("after maintenance no per-customer value is left (no phone holds)", !rest.some((k) => k.startsWith("phone/")));
}
{
  const h = harness();
  await send(h, { name: "Pat Example", phone: "720-555-0401" });
  h.advance(3 * 86400000);
  const logs = []; const summary = await runMaintenance(h.store, h.now(), (r) => logs.push(JSON.stringify(r)));
  check("maintenance: rolls up, prunes and logs counts only", summary.rollup.markers === 1 && typeof summary.metrics_pruned === "number" && summary.state_pruned.phone === 1 && logs.length === 1 && !/Pat|Example|555|0401|leadconnector|req-/.test(logs[0]), logs[0]);
  const broken = { ...memoryStore(), list: async () => { throw new Error("list failed"); } };
  const s2 = await runMaintenance(broken, h.now(), () => {});
  check("maintenance: a failing step is reported as failed and the run completes", s2.rollup === "failed" && s2.metrics_pruned === "failed" && s2.state_pruned === "failed");
  const final = [...h.store.data.entries()].map(([k, v]) => k + v.value).join("\n");
  check("after maintenance the store holds no name, number, key or webhook", ![/Pat/, /Example/, /7205550401/, /leadconnector/, /TEST-0000/].some((re) => re.test(final)) && !final.includes(JUAN) && !final.includes(hash(JUAN)), final);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
