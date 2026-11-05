// In-memory stand-in for a Netlify Blobs store, for the review-request tests. Same conditional-write
// rules as the real store (onlyIfNew, onlyIfMatch) and list({ prefix }) like @netlify/blobs 11.
export function memoryStore() {
  const data = new Map(); let n = 0;
  return {
    data,
    async getWithMetadata(key) { const e = data.get(key); return e ? { data: JSON.parse(e.value), etag: e.etag, metadata: {} } : null; },
    async setJSON(key, value, opts = {}) {
      await new Promise((r) => setImmediate(r)); // let concurrent callers interleave
      const e = data.get(key);
      if (opts.onlyIfNew && e) return { modified: false };
      if (opts.onlyIfMatch && (!e || e.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = `"${++n}"`; data.set(key, { value: JSON.stringify(value), etag }); return { modified: true, etag };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix = "" } = {}) {
      await new Promise((r) => setImmediate(r));
      return { blobs: [...data].filter(([k]) => k.startsWith(prefix)).map(([key, e]) => ({ key, etag: e.etag })), directories: [] };
    },
  };
}
