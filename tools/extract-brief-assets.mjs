// Extracts the prepared image derivatives embedded in the J&M relaunch production brief.
// Usage: node tools/extract-brief-assets.mjs <path-to-brief.html>
// Brand files (official logo, favicons) go to images/brand/ and are public company identity.
// Ranch photographs go to .private/ranch/ (git-ignored) until publication permission is recorded.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const brief = process.argv[2];
if (!brief) { console.error("Usage: node tools/extract-brief-assets.mjs <brief.html>"); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(brief, "utf8");
const block = html.match(/<script[^>]*id="jm-assets"[^>]*>([\s\S]*?)<\/script>/);
if (!block) throw new Error("No jm-assets block found in the brief");
const { manifest, files } = JSON.parse(block[1]);

const expected = new Map();
for (const entry of manifest) for (const d of entry.derivatives) expected.set(d.path, { ...d, original: entry.original });

const brandDir = path.join(root, "images", "brand");
const ranchDir = path.join(root, ".private", "ranch");
fs.mkdirSync(brandDir, { recursive: true });
fs.mkdirSync(ranchDir, { recursive: true });

let written = 0;
for (const [name, b64] of Object.entries(files)) {
  const meta = expected.get(name);
  if (!meta) throw new Error(`${name} is not in the manifest`);
  const bytes = Buffer.from(b64, "base64");
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha !== meta.sha256) throw new Error(`SHA-256 mismatch for ${name}`);
  const dir = /^jm-(official-logo|favicon)-/.test(name) ? brandDir : ranchDir;
  fs.writeFileSync(path.join(dir, name), bytes);
  written++;
}
if (written !== expected.size) throw new Error(`Expected ${expected.size} files, wrote ${written}`);
fs.writeFileSync(path.join(ranchDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Verified and wrote ${written} files (SHA-256 matched the manifest).`);
