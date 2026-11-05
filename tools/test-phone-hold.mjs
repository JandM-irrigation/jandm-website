// Concurrency tests for the 24-hour same-number hold and its cleanup (netlify/lib/phone-hold.mjs).
//   node tools/test-phone-hold.mjs
// Deterministic: interleavings are forced with hooks and barriers, and the randomized sweep uses a
// fixed seed. GoHighLevel is a mock; nothing leaves this computer. Numbers are fictional (555-01xx).
import { createHash, createHmac } from "node:crypto";
import { createHandler, LIMITS } from "../netlify/lib/review-request.mjs";
import { pruneState } from "../netlify/lib/review-maintenance.mjs";
import { DAY_MS, bucketOf, holdKey, pruneHolds } from "../netlify/lib/phone-hold.mjs";
import { memoryStore } from "./blobs-double.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? "  " + detail : ""}`); };

const WEBHOOK = "https://services.leadconnectorhq.com/hooks/TESTlocation/webhook-trigger/TEST-0000";
const JUAN = "J".repeat(20) + "uan_Sending-Key" + "x".repeat(8);
const ENV = { REVIEW_WEBHOOK_URL: WEBHOOK, REVIEW_STAFF_KEYS: `juan:${createHash("sha256").update(JUAN).digest("hex")}` };
const H = 3600000;
const PHONE = "+17205550101";
const phoneHash = createHmac("sha256", WEBHOOK).update(PHONE).digest("hex");
const BOUNDARY = Date.UTC(2026, 10, 6, 9, 0, 0); // a bucket boundary (09:00 UTC)
let seq = 0;

function sender(store, clock, calls) {
  const handle = createHandler({
    env: ENV, store, now: clock, log: () => {}, limits: { ...LIMITS, perHour: 1000, perDay: 1000 },
    fetchImpl: async (url, init) => { calls.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); },
  });
  return async (phone = "720-555-0101") => {
    const res = await handle(new Request("https://jmirrigationco.com/api/review-request", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://jmirrigationco.com", authorization: `Bearer ${JUAN}` },
      body: JSON.stringify({ request_id: `req-${String(++seq).padStart(4, "0")}-abcdefghijkl`, full_name: "Pat Example", phone }),
    }));
    return (await res.json()).code;
  };
}

// Store wrapper that runs hook(key) just before each delete reaches the store.
function beforeEachDelete(store, hook) {
  return { ...store, data: store.data, delete: async (key) => { await hook(key); return store.delete(key); } };
}

// ---------- 1. the reported race, reproduced against the previous algorithm ----------
{
  // The previous pruneState: read the hold, and if it is over 48 h old, delete it unconditionally.
  async function previousPrune(store, nowMs) {
    const { blobs } = await store.list({ prefix: "phone/" });
    for (const { key } of blobs) {
      const at = (await store.getWithMetadata(key, { type: "json" }))?.data?.at;
      if (typeof at === "number" && nowMs - at > 48 * H) await store.delete(key);
    }
  }
  const store = memoryStore();
  const key = `phone/${phoneHash}`;
  await store.setJSON(key, { at: BOUNDARY - 72 * H }); // an expired hold in the PR #4 format
  const now = BOUNDARY + 2 * H;
  // Between maintenance's read and its delete, a request refreshes the hold (PR #4's write).
  const racing = beforeEachDelete(store, async () => {
    const prior = await store.getWithMetadata(key, { type: "json" });
    await store.setJSON(key, { at: now }, { onlyIfMatch: prior.etag });
  });
  await previousPrune(racing, now);
  check("reproduced: the previous cleanup deletes a hold refreshed between its read and delete", !store.data.has(key));
}

// ---------- 2. the same interleaving against the fix ----------
{
  const store = memoryStore();
  const calls = [];
  let clock = BOUNDARY - 70 * H;
  const send = sender(store, () => clock, calls);
  check("setup: first request sent", (await send()) === "sent");
  clock = BOUNDARY + 2 * H; // the first hold is 72 h old; its bucket is due for deletion
  let refreshed = null;
  const racing = beforeEachDelete(store, async (key) => {
    if (key.startsWith("phone/") && refreshed === null) refreshed = await send(); // refresh in the gap
  });
  await pruneState(racing, clock);
  const holds = [...store.data.keys()].filter((k) => k.startsWith("phone/"));
  check("fix: a request in the read/delete gap refreshes the hold", refreshed === "sent" && calls.length === 2);
  check("fix: cleanup deleted only the expired bucket; the refreshed hold survives", holds.length === 1 && holds[0] === holdKey(bucketOf(clock), phoneHash), holds.join(","));
  clock += 23 * H;
  check("fix: 24-hour guarantee holds after cleanup (same number within 24 h refused)", (await send()) === "recently_sent" && calls.length === 2);
  clock += 2 * H;
  check("fix: after 24 h the number can be sent again", (await send()) === "sent" && calls.length === 3);
}
{
  // Cleanup at every possible moment: run a refresh before each individual delete, across a range of times.
  let failures = 0;
  for (let hoursAfter = 24; hoursAfter <= 96; hoursAfter += 1) {
    const store = memoryStore(); const calls = [];
    let clock = BOUNDARY - 30 * H;
    const send = sender(store, () => clock, calls);
    await send();
    clock += hoursAfter * H;
    await pruneState(beforeEachDelete(store, async (key) => { if (key.startsWith("phone/")) await send(); }), clock);
    if (calls.length === 2) { clock += 1 * H; if ((await send()) !== "recently_sent") failures += 1; }
    else { await send(); }
    if (calls.length > 2) failures += 1;
  }
  check("fix: refresh during cleanup at 73 different times never allows a second text within 24 h", failures === 0, `failures=${failures}`);
}
{
  // A PR #4 legacy hold is still honoured, and deleting it is safe because nothing writes that format.
  const store = memoryStore(); const calls = [];
  let clock = BOUNDARY;
  await store.setJSON(`phone/${phoneHash}`, { at: clock - 2 * H });
  const send = sender(store, () => clock, calls);
  check("legacy PR #4 hold (2 h old) still blocks the number", (await send()) === "recently_sent" && calls.length === 0);
  clock += 50 * H;
  check("legacy hold expired: the number is sent (new format)", (await send()) === "sent");
  await pruneState(store, clock);
  check("legacy hold over 48 h old is cleaned up; the new hold is kept", !store.data.has(`phone/${phoneHash}`) && [...store.data.keys()].some((k) => k.startsWith("phone/v2/")));
}

// ---------- 3. two requests for the same number across a bucket boundary ----------
{
  // Forced worst case: both pass the first check, both write (in different buckets), then both re-check.
  const base = memoryStore();
  // Two barriers on the hold writes: both pass the first check before either writes, and both
  // writes land before either re-checks.
  let armed = true;
  const gate = () => { const q = []; return () => new Promise((release) => { q.push(release); if (q.length === 2) q.forEach((f) => f()); }); };
  const beforeWrite = gate(), afterWrite = gate();
  const barrier = { ...base, data: base.data, setJSON: async (key, ...rest) => {
    if (!armed || !key.startsWith("phone/v2/")) return base.setJSON(key, ...rest);
    await beforeWrite();
    const r = await base.setJSON(key, ...rest);
    await afterWrite();
    return r;
  } };
  const calls = [];
  const a = sender(barrier, () => BOUNDARY - 1, calls);
  const b = sender(barrier, () => BOUNDARY + 1, calls);
  const codes = await Promise.all([a(), b()]);
  check("boundary, both write before either re-checks: neither sends (fail closed)", calls.length === 0 && codes.every((c) => c === "hold_conflict"), codes.join(","));
  check("boundary conflict releases both holds", ![...base.data.keys()].some((k) => k.startsWith("phone/v2/")));
  armed = false; // the barriers only apply to the first pair
  const retry = sender(base, () => BOUNDARY + 5000, calls);
  check("boundary conflict: a retry sends exactly once", (await retry()) === "sent" && calls.length === 1);
}
{
  // Seeded sweep: random delays before every store operation, 400 runs, clocks 1 ms either side of the boundary.
  let seed = 20261105;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const jitter = (store) => {
    const wait = async () => { for (let i = Math.floor(rand() * 6); i > 0; i--) await new Promise((r) => setImmediate(r)); };
    return {
      data: store.data,
      getWithMetadata: async (...a) => { await wait(); return store.getWithMetadata(...a); },
      setJSON: async (...a) => { await wait(); return store.setJSON(...a); },
      delete: async (...a) => { await wait(); return store.delete(...a); },
      list: async (...a) => { await wait(); return store.list(...a); },
    };
  };
  let over = 0, sentOnce = 0, bothStopped = 0, retryFailed = 0;
  for (let run = 0; run < 400; run++) {
    const store = jitter(memoryStore()); const calls = [];
    const offsets = run % 2 ? [-1, 1] : [1, -1];
    await Promise.all(offsets.map((o) => sender(store, () => BOUNDARY + o, calls)()));
    if (calls.length > 1) over += 1;
    else if (calls.length === 1) sentOnce += 1;
    else { bothStopped += 1; if ((await sender(store, () => BOUNDARY + 1000, calls)()) !== "sent") retryFailed += 1; }
  }
  check("boundary sweep (400 seeded interleavings): never two texts", over === 0, `over=${over}`);
  check("boundary sweep: when both stop, a retry sends", retryFailed === 0, `sentOnce=${sentOnce} bothStopped=${bothStopped}`);
  check("boundary sweep: most interleavings still send exactly one", sentOnce > bothStopped, `sentOnce=${sentOnce} bothStopped=${bothStopped}`);
}
{
  // Same bucket, 10 at once: the atomic create still allows exactly one.
  const store = memoryStore(); const calls = [];
  await Promise.all(Array.from({ length: 10 }, (_, i) => sender(store, () => BOUNDARY + 3 * H + i, calls)()));
  check("same bucket, 10 at once: exactly one text", calls.length === 1);
}

// ---------- 4. cleanup never deletes a bucket a live hold or lookup can need ----------
{
  let unsafe = 0;
  for (let step = 0; step < 24 * 6; step++) {
    const now = BOUNDARY + step * 10 * 60000; // every 10 minutes over 24 h
    const store = memoryStore();
    for (let ageH = 0; ageH <= 96; ageH++) {
      const t = now - ageH * H;
      await store.setJSON(holdKey(bucketOf(t), `${String(ageH).padStart(2, "0")}`.padEnd(64, "a")), { at: t, n: "x" });
    }
    await pruneHolds(store, now, 48 * H, 24 * H);
    for (let ageH = 0; ageH < 48; ageH++) {
      if (!store.data.has(holdKey(bucketOf(now - ageH * H), `${String(ageH).padStart(2, "0")}`.padEnd(64, "a")))) unsafe += 1;
    }
    const left = [...store.data.values()].map((v) => JSON.parse(v.value).at);
    if (left.some((at) => now - at > 72 * H)) unsafe += 1; // and nothing lingers past 72 h
  }
  check("cleanup at 144 times of day: every hold younger than 48 h kept, none older than 72 h left", unsafe === 0, `unsafe=${unsafe}`);
  let refused = false;
  try { await pruneHolds(memoryStore(), BOUNDARY, 30 * H, 24 * H); } catch { refused = true; }
  check("cleanup refuses a retention shorter than the hold plus one day", refused);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
