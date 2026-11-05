// Form and analytics tests with mocked delivery. Nothing leaves this computer.
//   node tools/test-forms.mjs
// Serves the public build on 127.0.0.1 and maps jmirrigationco.com to it inside a throwaway
// headless Chrome profile, so the production code path runs against a mock form endpoint.
// Checks: invalid, accepted, double submit, failed, network error, preview host, analytics
// unavailable, contact-click intent events and that no personal data reaches analytics.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".png": "image/png" };
const PUBLIC = new Set(["assets", "js", "content", "images"]);

let mode = "ok";
let posts = [];
const server = http.createServer((req, res) => {
  if (req.method === "POST") {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      posts.push(body);
      if (mode === "drop") return req.socket.destroy();
      res.writeHead(mode === "ok" ? 200 : 500, { "Content-Type": "text/html" }); res.end("ok");
    });
    return;
  }
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const top = p.split("/")[1];
  const file = path.join(ROOT, p);
  if ((!p.endsWith(".html") && !PUBLIC.has(top)) || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "jm-forms-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
  `--host-resolver-rules=MAP jmirrigationco.com 127.0.0.1:${PORT}, MAP www.googletagmanager.com ~NOTFOUND, MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
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
await cdp("Page.enable");
// Stop tel:/sms: links from leaving the page, without stopping the site's own listeners.
await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `addEventListener("click", e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"]'); if (a) e.preventDefault(); }, true);` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (expr) => { const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error"); return r.result.result.value; };
async function load(url) { await cdp("Page.navigate", { url }); for (let i = 0; i < 50; i++) { await sleep(100); if (await js("document.readyState === 'complete' && !!document.querySelector('form[data-lead-form]')").catch(() => false)) break; } await sleep(300); }

const NAME = "Testy McTestface", PHONE = "720-555-0199";
const fill = (name = NAME, phone = PHONE) => js(`(() => { const f = document.querySelector('form[data-lead-form]');
  f.querySelector('[name=full_name]').focus();
  f.querySelector('[name=full_name]').value = ${JSON.stringify(name)};
  f.querySelector('[name=phone]').value = ${JSON.stringify(phone)};
  f.querySelector('[name=city]').value = 'Castle Rock';
  f.querySelector('[name=project_scope]').value = 'Acreage or several properties';
  f.querySelector('[name=email]').value = 'testy@example.com';
  f.querySelector('[name=message]').value = 'New system for a 5 acre lot';
  const s = f.querySelector('[name=service_needed]'); s.value = 'Sprinkler repair'; s.dispatchEvent(new Event('change')); return true; })()`);
const submit = () => js(`document.querySelector('form[data-lead-form] button[type=submit]').click(), true`);
const events = (name) => js(`(window.dataLayer || []).filter(a => a && a[0] === 'event'${name ? ` && a[1] === ${JSON.stringify(name)}` : ""}).map(a => [a[1], a[2]])`);
const state = () => js(`(() => { const w = document.querySelector('[data-lead]'); const f = w.querySelector('form');
  return { formHidden: f.hidden, success: !w.querySelector('[data-form-success]').hidden, title: !w.querySelector('.lead__success-title').hidden,
    preview: !w.querySelector('[data-preview-note]').hidden, error: !f.querySelector('[data-form-error]').hidden,
    name: f.querySelector('[name=full_name]').value, btnDisabled: f.querySelector('button[type=submit]').disabled,
    invalid: [...f.querySelectorAll('[aria-invalid=true]')].map(e => e.name), focus: document.activeElement && (document.activeElement.name || document.activeElement.className) }; })()`);

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };
const PROD = "http://jmirrigationco.com";

// 1. Invalid submission
mode = "ok"; posts = [];
await load(`${PROD}/sprinkler-repair.html`);
await submit(); await sleep(300);
let s = await state();
check("invalid: nothing sent", posts.length === 0);
check("invalid: inline errors on name and phone, focus on first", s.invalid.includes("full_name") && s.invalid.includes("phone") && s.focus === "full_name", JSON.stringify(s.invalid));
check("invalid: no lead event", (await events("generate_lead")).length === 0);
check("quote_start sent once on first interaction", (await events("quote_start")).length === 1);

// 2. Accepted, with a double click
await fill(); await js(`(() => { const b = document.querySelector('form[data-lead-form] button[type=submit]'); b.click(); b.click(); return true; })()`); await sleep(600);
s = await state();
let leads = await events("generate_lead");
check("accepted: one request sent despite double click", posts.length === 1, `posts=${posts.length}`);
check("accepted: success message shown, no preview note", s.success && s.title && !s.preview);
check("accepted: exactly one generate_lead", leads.length === 1, JSON.stringify(leads));
check("accepted: lead params are the allowlist only", leads.length === 1 && JSON.stringify(Object.keys(leads[0][1]).sort()) === '["area","form_id","page_type","project_scope","service"]' && leads[0][1].service === "repair", leads.length ? JSON.stringify(leads[0][1]) : "");
check("accepted: lead carries project size and area slugs", leads.length === 1 && leads[0][1].project_scope === "acreage" && leads[0][1].area === "castle_rock");
{
  const sent = new URLSearchParams(posts[0] || "");
  const want = { "form-name": "quote", full_name: NAME, phone: PHONE, email: "testy@example.com", city: "Castle Rock", service_needed: "Sprinkler repair", project_scope: "Acreage or several properties", message: "New system for a 5 acre lot" };
  const missing = Object.entries(want).filter(([k, v]) => sent.get(k) !== v).map(([k]) => k);
  check("accepted: all seven lead fields posted to Netlify Forms", missing.length === 0, missing.length ? "missing: " + missing.join(", ") : "");
  check("accepted: honeypot posted empty", sent.get("company") === "");
}
const layer = await js("JSON.stringify(window.dataLayer || [])");
check("no name or phone in analytics", !layer.includes("Testy") && !layer.includes("555") && !layer.includes("0199"));

// 3. Failed response
mode = "fail"; posts = [];
await load(`${PROD}/index.html`); await fill(); await submit(); await sleep(600);
s = await state();
check("failed: error shown, values kept, button re-enabled", s.error && !s.success && s.name === NAME && !s.btnDisabled);
check("failed: no lead event", (await events("generate_lead")).length === 0);

// 4. Network error
mode = "drop"; posts = [];
await load(`${PROD}/contact.html`); await fill(); await submit(); await sleep(800);
s = await state();
check("network error: error shown, no success", s.error && !s.success);
check("network error: no lead event", (await events("generate_lead")).length === 0);

// 5. Analytics unavailable (gtag throws): the form still works
mode = "ok"; posts = [];
await load(`${PROD}/sod-installation.html`);
await js("window.gtag = function () { throw new Error('blocked'); }, true");
await fill(); await submit(); await sleep(600);
s = await state();
check("analytics unavailable: request sent and success shown", posts.length === 1 && s.success);

// 6. Contact clicks are intent events
await load(`${PROD}/index.html`);
await js(`document.querySelector('.masthead__phone').click(), document.querySelector('a[href^="sms:"]').click(), true`); await sleep(200);
const clicks = await events("contact_click");
check("contact_click for phone and text, with placement", clicks.length === 2 && clicks[0][1].contact_method === "phone" && clicks[0][1].placement === "header" && clicks[1][1].contact_method === "sms", JSON.stringify(clicks));
check("contact click is not a lead", (await events("generate_lead")).length === 0);

// 6b. Optional size left empty: the lead still counts, marked not_given
mode = "ok"; posts = [];
await load(`${PROD}/sprinkler-installation.html`); await fill();
await js("document.querySelector('form[data-lead-form] [name=project_scope]').value = '', true");
await submit(); await sleep(600);
leads = await events("generate_lead");
check("no size given: one generate_lead with project_scope not_given", posts.length === 1 && leads.length === 1 && leads[0][1].project_scope === "not_given", JSON.stringify(leads));

// 6c. Honeypot filled (a bot): Netlify gets the post and discards it; not counted as a lead
mode = "ok"; posts = [];
await load(`${PROD}/contact.html`); await fill();
await js("document.querySelector('form[data-lead-form] [name=company]').value = 'Spam Co', true");
await submit(); await sleep(600);
check("honeypot filled: posted for Netlify to discard, no generate_lead", posts.length === 1 && (await events("generate_lead")).length === 0);

// 7. Preview / non-production host never sends
mode = "ok"; posts = [];
await load(`http://127.0.0.1:${PORT}/index.html`); await fill(); await submit(); await sleep(400);
s = await state();
check("preview host: nothing sent", posts.length === 0);
check("preview host: preview note shown, no 'received' message", s.success && s.preview && !s.title);
check("preview host: no analytics loaded or sent", (await js("typeof window.gtag")) === "undefined" && (await js("(window.dataLayer || []).length")) === 0);

// 8. Staff review tool: noindex everywhere, analytics only on the production host, form untouched
await load(`${PROD}/review.html`);
check("review.html: noindex, nofollow meta", (await js("(document.querySelector('meta[name=robots]') || {}).content || ''")) === "noindex, nofollow");
check("review.html: production host configures GA4", await js("(window.dataLayer || []).some(a => a && a[0] === 'config' && a[1] === 'G-NTW0DE5RLP') && !!document.querySelector('script[src*=googletagmanager]')"));
check("review.html: review-request form still present", await js("!!document.querySelector('#reviewForm #full_name') && !!document.querySelector('#reviewForm #phone')"));
await load(`http://127.0.0.1:${PORT}/review.html`);
check("review.html: no analytics on a non-production host", (await js("typeof window.gtag")) === "undefined" && !(await js("!!document.querySelector('script[src*=googletagmanager]')")));

ws.close(); chrome.kill(); server.close(); // the throwaway profile stays in the OS temp folder
await sleep(500);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
