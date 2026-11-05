// Tests for the staff 1-Tap Review tool: netlify/lib/review-request.mjs and review.html.
//   node tools/test-review-request.mjs
// Nothing leaves this computer. GoHighLevel is a mock, the Netlify Blobs store is an in-memory double
// with the same conditional-write rules (onlyIfNew, onlyIfMatch), and the browser part runs review.html
// in a throwaway headless Chrome with jmirrigationco.com mapped to a local server.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createHandler, LIMITS } from "../netlify/lib/review-request.mjs";
import { memoryStore } from "./blobs-double.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  " + detail : ""}`); };

// ---------- test doubles (the Blobs store double is in tools/blobs-double.mjs) ----------
const WEBHOOK = "https://services.leadconnectorhq.com/hooks/TESTlocation/webhook-trigger/TEST-0000";
const KEY_A = "a".repeat(20) + "Staff_Key-A" + "b".repeat(12);
const KEY_B = "c".repeat(43); // a second listed key with another label: listed, but never allowed to send
const hash = (k) => createHash("sha256").update(k).digest("hex");
const ENV = { REVIEW_WEBHOOK_URL: WEBHOOK, REVIEW_STAFF_KEYS: `juan:${hash(KEY_A)}, crew-1:${hash(KEY_B)}` };

function harness({ env = ENV, upstream = "ok", limits } = {}) {
  const calls = [], logs = []; let clock = Date.UTC(2026, 10, 5, 15, 0, 0);
  const store = memoryStore();
  const h = {
    calls, logs, store, mode: upstream,
    advance(ms) { clock += ms; },
    handle: null,
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (h.mode === "fail") return new Response("no", { status: 500 });
    if (h.mode === "throw") throw new TypeError("fetch failed");
    if (h.mode === "hang") return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    return new Response("{}", { status: 200 });
  };
  h.handle = createHandler({ env, store, fetchImpl, now: () => clock, log: (r) => logs.push(JSON.stringify(r)), limits: { ...LIMITS, upstreamTimeoutMs: 50, ...limits } });
  return h;
}
let seq = 0;
const rid = () => `req-${String(++seq).padStart(4, "0")}-abcdefghijkl`;
function req({ key = KEY_A, body, method = "POST", origin = "https://jmirrigationco.com", type = "application/json", raw } = {}) {
  const headers = { "content-type": type };
  if (key) headers.authorization = `Bearer ${key}`;
  if (origin) headers.origin = origin;
  return new Request("https://jmirrigationco.com/api/review-request", { method, headers, body: method === "GET" ? undefined : raw ?? JSON.stringify(body ?? { request_id: rid(), full_name: "Pat Example", phone: "(720) 555-0123" }) });
}
const call = async (h, opts) => { const res = await h.handle(req(opts)); return { status: res.status, body: await res.json(), headers: res.headers }; };

// ---------- 1. configuration and access ----------
for (const [label, env] of [["no settings", {}], ["webhook not GoHighLevel", { ...ENV, REVIEW_WEBHOOK_URL: "https://example.com/hook" }], ["malformed staff keys", { ...ENV, REVIEW_STAFF_KEYS: "juan:nothex" }]]) {
  const h = harness({ env }); const r = await call(h);
  check(`not configured (${label}): 503, nothing sent`, r.status === 503 && r.body.code === "not_configured" && h.calls.length === 0);
}
{
  const h = harness();
  let r = await h.handle(req({ method: "GET" }));
  check("GET refused (405)", r.status === 405);
  r = await call(h, { origin: "https://evil.example" });
  check("other origin refused (403), nothing sent", r.status === 403 && h.calls.length === 0);
  for (const [label, key] of [["no key", null], ["wrong key", "z".repeat(43)], ["malformed key", "short"], ["key hash instead of key", hash(KEY_A)]]) {
    r = await call(h, { key });
    check(`authentication: ${label} → 401, nothing sent`, r.status === 401 && r.body.code === "unauthorized" && h.calls.length === 0);
  }
  r = await call(h, { key: KEY_A });
  check("authorized staff key → 200 sent", r.status === 200 && r.body.ok === true && r.body.code === "sent" && h.calls.length === 1);
  check("response not cacheable", r.headers.get("cache-control") === "no-store");
  check("upstream gets the webhook URL and a normalized payload only", h.calls[0].url === WEBHOOK && JSON.stringify(h.calls[0].body) === JSON.stringify({ full_name: "Pat Example", phone: "+17205550123" }), JSON.stringify(h.calls[0]));
  r = await call(h, { key: KEY_B });
  check("Juan only: another listed staff key → 403 sender_not_allowed, nothing sent", r.status === 403 && r.body.code === "sender_not_allowed" && h.calls.length === 1);
  const onlyCrew = harness({ env: { ...ENV, REVIEW_STAFF_KEYS: `crew-1:${hash(KEY_B)}` } });
  r = await call(onlyCrew, { key: KEY_B });
  check("Juan only: a non-Juan key as the only entry still cannot send", r.status === 403 && onlyCrew.calls.length === 0);
  const asJuan = harness({ env: { ...ENV, REVIEW_STAFF_KEYS: `Juan:${hash(KEY_B)}` } });
  r = await call(asJuan, { key: KEY_B });
  check("Juan only: a look-alike label (Juan) is a configuration error → 503, nothing sent", r.status === 503 && asJuan.calls.length === 0);
  const rpt = "rpt_" + "r".repeat(40);
  const reportAsStaff = harness({ env: { ...ENV, REVIEW_STAFF_KEYS: `juan:${hash(rpt)}` } });
  r = await call(reportAsStaff, { key: rpt });
  check("a report key (rpt_…) can never send, even if its plain hash is listed as juan", r.status === 401 && reportAsStaff.calls.length === 0);
  const revoked = harness({ env: { ...ENV, REVIEW_STAFF_KEYS: `crew-1:${hash(KEY_B)}` } });
  r = await call(revoked, { key: KEY_A });
  check("revoked key (removed from REVIEW_STAFF_KEYS) → 401", r.status === 401 && revoked.calls.length === 0);
}

// ---------- 2. input validation ----------
{
  const h = harness();
  const bad = [
    ["not JSON content type", { type: "text/plain" }, 415],
    ["invalid JSON", { raw: "{nope" }, 400],
    ["body too large", { raw: JSON.stringify({ request_id: rid(), full_name: "A".repeat(3000), phone: "7205550123" }) }, 413],
    ["missing request_id", { body: { full_name: "Pat Example", phone: "7205550123" } }, 400],
    ["bad request_id", { body: { request_id: "x", full_name: "Pat Example", phone: "7205550123" } }, 400],
    ["empty name", { body: { request_id: rid(), full_name: " ", phone: "7205550123" } }, 400],
    ["name with markup", { body: { request_id: rid(), full_name: "<script>x</script>", phone: "7205550123" } }, 400],
    ["phone too short", { body: { request_id: rid(), full_name: "Pat Example", phone: "555-0123" } }, 400],
    ["phone with letters", { body: { request_id: rid(), full_name: "Pat Example", phone: "720-CALL-NOW" } }, 400],
    ["non-US number", { body: { request_id: rid(), full_name: "Pat Example", phone: "+44 20 7946 0958" } }, 400],
    ["phone as a number type", { body: { request_id: rid(), full_name: "Pat Example", phone: 7205550123 } }, 200],
  ];
  for (const [label, opts, want] of bad) {
    const before = h.calls.length; const r = await call(h, opts);
    check(`input: ${label} → ${want}`, r.status === want && (want === 200 ? h.calls.length === before + 1 : h.calls.length === before), `${r.status} ${JSON.stringify(r.body)}`);
  }
  const r = await call(h, { body: { request_id: rid(), full_name: "José O’Brien-Núñez", phone: "1 (303) 549-0712" } });
  check("input: accented name and 1-prefixed number accepted", r.status === 200 && h.calls.at(-1).body.phone === "+13035490712");
}

// ---------- 3. duplicates ----------
{
  const h = harness();
  const id = rid();
  const [a, b] = await Promise.all([call(h, { body: { request_id: id, full_name: "Pat Example", phone: "7205550123" } }), call(h, { body: { request_id: id, full_name: "Pat Example", phone: "7205550123" } })]);
  check("same request sent twice at once: one sent, one 409 duplicate_request", h.calls.length === 1 && [a.status, b.status].sort().join() === "200,409");
  const again = await call(h, { body: { request_id: id, full_name: "Pat Example", phone: "7205550123" } });
  check("same request retried later: 409, not resent", again.status === 409 && again.body.code === "duplicate_request" && h.calls.length === 1);
  const sameNumber = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "+1 720.555.0123" } });
  check("same number, new tap, other format, within 24 h: 409 recently_sent", sameNumber.status === 409 && sameNumber.body.code === "recently_sent" && h.calls.length === 1);
  const otherStaff = await call(h, { key: KEY_B, body: { request_id: rid(), full_name: "Pat Example", phone: "7205550123" } });
  check("another listed staff key cannot send the same number either (403)", otherStaff.status === 403 && h.calls.length === 1);
  h.advance(24 * 3600000 + 1000);
  const later = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "7205550123" } });
  check("same number after 24 h: sent", later.status === 200 && h.calls.length === 2);
  const parallel = await Promise.all(Array.from({ length: 5 }, () => call(h, { body: { request_id: rid(), full_name: "Lee Example", phone: "7205550999" } })));
  check("same new number from 5 taps at once: exactly one sent", parallel.filter((r) => r.status === 200).length === 1 && h.calls.filter((c) => c.body.phone === "+17205550999").length === 1);
  check("phone numbers are not stored in plain text", ![...h.store.data.keys(), ...[...h.store.data.values()].map((v) => v.value)].some((s) => /720555|7205550/.test(s)));
}

// ---------- 4. rate limits ----------
{
  const h = harness();
  const phone = (i) => `720555${String(1000 + i)}`;
  const statuses = [];
  for (let i = 0; i < LIMITS.perHour + 1; i++) statuses.push((await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: phone(i) } })).status);
  check(`hourly limit: ${LIMITS.perHour} sent, then 429`, statuses.slice(0, LIMITS.perHour).every((s) => s === 200) && statuses.at(-1) === 429 && h.calls.length === LIMITS.perHour);
  const other = await call(h, { key: KEY_B, body: { request_id: rid(), full_name: "Pat Example", phone: phone(500) } });
  check("over the limit, another listed key cannot send around it (403)", other.status === 403 && h.calls.length === LIMITS.perHour);
  h.advance(3600000);
  const nextHour = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: phone(600) } });
  check("next hour: sends again", nextHour.status === 200);
  const burst = harness();
  const many = await Promise.all(Array.from({ length: 30 }, (_, i) => call(burst, { body: { request_id: rid(), full_name: "Pat Example", phone: phone(700 + i) } })));
  check(`30 taps at once: never more than ${LIMITS.perHour} sent`, burst.calls.length <= LIMITS.perHour && many.filter((r) => r.status === 429).length >= 30 - LIMITS.perHour, `sent=${burst.calls.length}`);
  const daily = harness({ limits: { perHour: 1000 } });
  const ds = [];
  for (let i = 0; i < LIMITS.perDay + 1; i++) ds.push((await call(daily, { body: { request_id: rid(), full_name: "Pat Example", phone: phone(800 + i) } })).status);
  check(`daily limit: ${LIMITS.perDay} sent, then 429`, daily.calls.length === LIMITS.perDay && ds.at(-1) === 429);
}

// ---------- 5. upstream failures ----------
{
  const h = harness({ upstream: "fail" });
  let r = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "7205550123" } });
  check("GoHighLevel 500 → 502 upstream_rejected, not success", r.status === 502 && r.body.ok === false && r.body.code === "upstream_rejected");
  h.mode = "ok";
  r = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "7205550123" } });
  check("after a refused send the number is released: retry sends", r.status === 200);
  h.mode = "throw";
  r = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "7205550456" } });
  check("GoHighLevel unreachable → 502 upstream_unreachable", r.status === 502 && r.body.code === "upstream_unreachable");
  h.mode = "ok";
  r = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "7205550456" } });
  check("after unreachable the number is released: retry sends", r.status === 200);
  h.mode = "hang";
  r = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "7205550789" } });
  check("GoHighLevel timeout → 504 upstream_unconfirmed, not success", r.status === 504 && r.body.ok === false && r.body.code === "upstream_unconfirmed");
  h.mode = "ok";
  r = await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "7205550789" } });
  check("after a timeout the number stays held (could already have been texted)", r.status === 409 && r.body.code === "recently_sent");
}

// ---------- 6. logs ----------
{
  const h = harness();
  await call(h, { body: { request_id: rid(), full_name: "Pat Example", phone: "7205550123" } });
  await call(h, { key: "z".repeat(43), body: { request_id: rid(), full_name: "Pat Example", phone: "7205550123" } });
  await call(h, { body: { request_id: rid(), full_name: "<bad>", phone: "1" } });
  const all = h.logs.join("\n");
  check("logs: one line per request with outcome and staff label", h.logs.length === 3 && /"outcome":"sent"/.test(all) && /"staff":"juan"/.test(all));
  check("logs: no name, phone, key or webhook", !/Pat|Example|720|555|0123|<bad>|TEST-0000|leadconnector/.test(all) && !all.includes(KEY_A) && !all.includes(hash(KEY_A)));
}

// ---------- 7. source ----------
{
  const page = fs.readFileSync(path.join(ROOT, "review.html"), "utf8");
  check("review.html contains no webhook URL", !/leadconnectorhq|\/hooks\//i.test(page));
  const tracked = fs.readdirSync(ROOT).filter((f) => /\.(html|js|json|toml)$/.test(f)).map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  check("no GoHighLevel webhook URL in any published top-level file", !/services\.leadconnectorhq\.com\/hooks\/[A-Za-z0-9]/.test(tracked));
}

// ---------- 8. review.html in a browser ----------
const CHROME = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
if (!CHROME) { console.log("SKIP  browser checks: no Chrome or Edge found"); }
else {
  const api = harness();
  let loseReply = false; // handle the request, then drop the answer
  let dropping = false; // drop every request while set (Chrome retries a reset connection once on its own)
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/review-request") {
      const chunks = []; for await (const c of req) chunks.push(c);
      if (dropping) return req.socket.destroy();
      const r = await api.handle(new Request("https://jmirrigationco.com" + url.pathname, { method: req.method, headers: { ...req.headers, origin: (req.headers.origin || "").replace(/^http:/, "https:") }, body: req.method === "POST" ? Buffer.concat(chunks) : undefined })); // origin: the local server stands in for HTTPS
      if (loseReply) return req.socket.destroy();
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(await r.text());
    }
    if (url.pathname !== "/review.html") { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html" }); fs.createReadStream(path.join(ROOT, "review.html")).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const PORT = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "jm-review-"));
  const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    `--host-resolver-rules=MAP jmirrigationco.com 127.0.0.1:${PORT}, MAP www.googletagmanager.com ~NOTFOUND`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ""; chrome.stderr.on("data", (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) resolve(m[0]); });
    setTimeout(() => reject(new Error("Chrome did not start")), 20000);
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
  const cdp = (m, p) => send(m, p, sessionId);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = async (expr) => { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error"); return r.result.result.value; };
  await cdp("Page.enable");
  const load = async (url) => { await cdp("Page.navigate", { url }); for (let i = 0; i < 50; i++) { await sleep(100); if (await js("document.readyState === 'complete'").catch(() => false)) break; } await sleep(200); };
  const view = () => js(`({ formHidden: document.getElementById('reviewForm').hidden, setup: !document.getElementById('setup').hidden,
    status: getComputedStyle(document.getElementById('status')).display !== 'none' ? document.getElementById('status').textContent : '',
    kind: document.getElementById('status').className, hash: location.hash, key: localStorage.getItem('jm-review-staff-key'),
    name: document.getElementById('full_name').value, btn: document.getElementById('submitBtn').disabled })`);
  const fill = (name, phone) => js(`document.getElementById('full_name').value = ${JSON.stringify(name)}; document.getElementById('phone').value = ${JSON.stringify(phone)}; true`);
  const tap = (times = 1) => js(`(() => { const b = document.getElementById('submitBtn'); for (let i = 0; i < ${times}; i++) b.click(); return true; })()`);
  const P = "http://jmirrigationco.com/review.html";

  await load(P);
  let v = await view();
  check("browser: without a staff key the form is hidden and set-up help shows", v.formHidden && v.setup);
  await load(`${P}#key=${KEY_A}`);
  v = await view();
  check("browser: staff link stores the key and removes it from the address bar", !v.formHidden && !v.setup && v.key === KEY_A && v.hash === "");
  await load(P);
  v = await view();
  check("browser: the key stays on this phone for later visits (one-tap use)", !v.formHidden && v.key === KEY_A);

  await fill("Pat Example", "720-555-0111"); await tap(2); await sleep(400);
  v = await view();
  check("browser: double tap sends one request and shows success after the server confirms", api.calls.length === 1 && /Sent!/.test(v.status) && /success/.test(v.kind) && v.name === "", JSON.stringify(v));

  await fill("Pat Example", "720-555-0111"); await tap(); await sleep(400);
  v = await view();
  check("browser: same number again shows 'last 24 hours', not success", api.calls.length === 1 && /24 hours/.test(v.status) && /error/.test(v.kind));

  await fill("Pat Example", "12"); await tap(); await sleep(300);
  v = await view();
  check("browser: invalid number shows a fix-it message, nothing sent", api.calls.length === 1 && /10-digit/.test(v.status) && v.name === "Pat Example");

  api.mode = "fail"; await fill("Pat Example", "720-555-0222"); await tap(); await sleep(400);
  v = await view();
  check("browser: GoHighLevel failure shows 'Not sent', never success, keeps the details", /^Not sent/.test(v.status) && !/Sent!/.test(v.status) && v.name === "Pat Example" && !v.btn);
  api.mode = "hang"; await tap(); await sleep(500);
  v = await view();
  check("browser: GoHighLevel timeout shows 'Not confirmed', never success", /^Not confirmed/.test(v.status));
  api.mode = "ok";

  dropping = true; await fill("Pat Example", "720-555-0333"); await tap(); await sleep(600); dropping = false;
  v = await view();
  const before = api.calls.length;
  check("browser: lost connection shows 'no connection', not success", /no connection/.test(v.status) && !/Sent!/.test(v.status), JSON.stringify(v));
  await tap(); await sleep(400);
  v = await view();
  check("browser: retry after a lost connection sends once", api.calls.length === before + 1 && /Sent!/.test(v.status), JSON.stringify(v) + " calls " + (api.calls.length - before));

  loseReply = true; const sentBefore = api.calls.length;
  await fill("Pat Example", "720-555-0555"); await tap(); await sleep(600); loseReply = false;
  await tap(); await sleep(400);
  v = await view();
  check("browser: sent but the answer was lost: the retry is recognised, the customer is texted once", api.calls.length === sentBefore + 1 && /Already handled/.test(v.status), JSON.stringify(v) + " calls " + (api.calls.length - sentBefore));

  await js(`localStorage.setItem('jm-review-staff-key', ${JSON.stringify("z".repeat(43))}), true`);
  await load(P); await fill("Pat Example", "720-555-0444"); await tap(); await sleep(400);
  v = await view();
  check("browser: rejected key is forgotten and the set-up help shows", v.key === null && v.setup && v.formHidden && /no longer valid/.test(v.status));

  await js(`localStorage.setItem('jm-review-staff-key', ${JSON.stringify(KEY_B)}), true`);
  const sentBy = api.calls.length;
  await load(P); await fill("Pat Example", "720-555-0666"); await tap(); await sleep(400);
  v = await view();
  check("browser: a non-Juan staff key is refused, forgotten, and nothing is sent", api.calls.length === sentBy && v.key === null && /only the owner's phone/.test(v.status), JSON.stringify(v));

  ws.close(); chrome.kill(); server.close();
  await sleep(300);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
