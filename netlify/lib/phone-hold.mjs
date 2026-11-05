/* Same-number hold for the 1-Tap Review tool: at most one review request per phone number per
   24 hours. The number is stored only as a keyed hash.

   Netlify Blobs cannot delete conditionally (delete(key) has no onlyIfMatch), so cleanup must never
   delete a key that a request could still write. Holds are therefore written to day buckets:

     phone/v2/<bucket>/<keyed hash>      { at, n }     bucket = whole days since 09:00 UTC epoch

   - A request writes ONLY the bucket of its own start time, with an atomic create/compare-and-set.
   - Before writing it looks for a live hold in that bucket and the ones before it that can still
     hold one; after writing it looks again at the neighbouring buckets, so two requests on either
     side of a bucket boundary cannot both send. If both see each other, both stop (fail closed).
   - Cleanup (pruneHolds) deletes a bucket by key name only, once every hold in it is at least
     48 hours old. No request writes a bucket that old, so a refreshed hold can never be deleted.

   Buckets start at 09:00 UTC, when the nightly maintenance job runs. */
export const DAY_MS = 86400000;
const OFFSET_MS = 9 * 3600000;
const PREFIX = "phone/v2/";
export const LEGACY_PREFIX = "phone/"; // PR #4 format "phone/<hash>"; read for safety, never written

export const bucketOf = (ms) => Math.floor((ms - OFFSET_MS) / DAY_MS);
const bucketEnd = (b) => (b + 1) * DAY_MS + OFFSET_MS;
export const holdKey = (bucket, hash) => `${PREFIX}${bucket}/${hash}`;

const live = (data, t, holdMs) => data && typeof data.at === "number" && Math.abs(t - data.at) < holdMs;

/* Returns { status: "held", key } when this request now holds the number, or
   { status: "recently_sent" } when a live hold already exists, or
   { status: "conflict" } when another request took the number at the same moment. */
export async function acquireHold(store, hash, t, holdMs, nonce) {
  const span = Math.ceil(holdMs / DAY_MS); // buckets back that can still hold a live hold
  const c = bucketOf(t);
  const key = holdKey(c, hash);

  // 1. Any live hold (this bucket, the previous ones, or a PR #4 legacy key)?
  const legacy = await store.getWithMetadata(`${LEGACY_PREFIX}${hash}`, { type: "json" });
  if (live(legacy?.data, t, holdMs)) return { status: "recently_sent" };
  let mine = null;
  for (let b = c - span; b <= c; b++) {
    const found = await store.getWithMetadata(holdKey(b, hash), { type: "json" });
    if (b === c) mine = found;
    if (live(found?.data, t, holdMs)) return { status: "recently_sent" };
  }

  // 2. Take it atomically in this request's own bucket.
  const result = await store.setJSON(key, { at: t, n: nonce }, mine ? { onlyIfMatch: mine.etag } : { onlyIfNew: true });
  if (!result.modified) return { status: "recently_sent" };

  // 3. A request on the other side of a bucket boundary may have written at the same moment.
  for (let b = c - span; b <= c + 1; b++) {
    if (b === c) continue;
    const other = await store.getWithMetadata(holdKey(b, hash), { type: "json" });
    if (live(other?.data, t, holdMs) && other.data.n !== nonce) {
      await releaseHold(store, key); // only this request can have written this key since step 2
      return { status: "conflict" };
    }
  }
  return { status: "held", key };
}

/* Releases a hold this request wrote (nothing was sent). Safe: while it is live no other request
   can overwrite it (step 1 refuses, step 2 is conditional), so only this request's hold is removed. */
export async function releaseHold(store, key) {
  await store.delete(key);
}

/* Deletes hold buckets whose newest possible hold is at least keepMs old, by key name only.
   keepMs must be at least holdMs + one day so a bucket is never deleted while a lookup can need it.
   Legacy PR #4 keys are never written by this code, so reading then deleting them is safe. */
export async function pruneHolds(store, nowMs, keepMs, holdMs) {
  if (keepMs < holdMs + DAY_MS) throw new Error("phone hold retention shorter than hold + 1 day");
  let deleted = 0;
  const { blobs } = await store.list({ prefix: LEGACY_PREFIX });
  for (const { key } of blobs) {
    const v2 = key.match(/^phone\/v2\/(-?\d+)\/[a-f0-9]{64}$/);
    if (v2) {
      if (bucketEnd(Number(v2[1])) <= nowMs - keepMs) { await store.delete(key); deleted += 1; }
    } else if (/^phone\/[a-f0-9]{64}$/.test(key)) {
      const at = (await store.getWithMetadata(key, { type: "json" }))?.data?.at;
      if (typeof at === "number" && nowMs - at > keepMs) { await store.delete(key); deleted += 1; }
    }
  }
  return deleted;
}
