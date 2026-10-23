#!/usr/bin/env node
/* tools/generate-creator-pages.mjs — folder-style creator profile pages.
 *
 * Other sections (discover, trending, creators, liked, saved) are real
 * folders that work on any static host with zero rewrites. Creator profiles
 * used to live only behind /@name rewrites. This script gives them the same
 * treatment: it copies the creator/index.html shell into creator/<name>/
 * per creator, baking per-creator SEO head (title/canonical/og/JSON-LD).
 *
 * Source of truth: sitemap.xml <loc> entries matching /@<name> (the
 * maintained SEO list), plus any extra names passed as CLI args:
 *
 *   node tools/generate-creator-pages.mjs [--prune] [Name ...]
 *
 * --prune deletes creator/<name>/ folders no longer in the set.
 * Re-run + commit whenever a creator is added/removed. The runtime painter
 * (js/pages/creator-page.js) parses /creator/<name>/, /@name, ?u= and #@,
 * so legacy /@ links keep working as an alias.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATE = join(ROOT, "creator", "index.html");
const SITEMAP = join(ROOT, "sitemap.xml");
const CREATOR_DIR = join(ROOT, "creator");
const SITE = "https://favmoney.site";
const VALID = /^[\w-]+$/;

function profileUrl(name) {
  return `${SITE}/creator/${encodeURIComponent(name)}/`;
}

function bake(template, name) {
  const url = profileUrl(name);
  const title = `@${name} - Short Videos | Favmoney`;
  const desc = `Watch @${name}'s short videos on Favmoney.`;
  let out = template;
  out = out.replace(
    "<title>Creator | Favmoney</title>",
    `<title>${title}</title>\n  <!-- Generated for @${name} by tools/generate-creator-pages.mjs — do not hand-edit; edit creator/index.html + re-run. -->`
  );
  out = out.replace(
    '<link rel="canonical" href="https://favmoney.site/creators">',
    `<link rel="canonical" href="${url}">`
  );
  out = out.replace(
    '<meta name="description" content="Watch this creator\'s short videos on Favmoney.">',
    `<meta name="description" content="${desc}">`
  );
  out = out.replace(
    '<meta property="og:title" content="Creator | Favmoney">',
    `<meta property="og:title" content="${title}">`
  );
  out = out.replace(
    '<meta property="og:url" content="https://favmoney.site/creators">',
    `<meta property="og:url" content="${url}">`
  );
  out = out.replace(
    '<meta name="twitter:title" content="Creator | Favmoney">',
    `<meta name="twitter:title" content="${title}">`
  );
  out = out.replace(
    '<meta name="twitter:description" content="Watch this creator\'s videos on Favmoney.">',
    `<meta name="twitter:description" content="${desc}">`
  );
  out = out.replace(
    '<script type="application/ld+json" data-profile-json>{"@context":"https://schema.org","@type":"Person","name":"Favmoney creator","url":"https://favmoney.site/creators"}</script>',
    `<script type="application/ld+json" data-profile-json>{"@context":"https://schema.org","@type":"Person","name":"${name}","alternateName":"@${name}","url":"${url}"}</script>`
  );
  out = out.replace(
    '<h1 class="cp-name" data-profile-h1>Creator | Favmoney</h1>',
    `<h1 class="cp-name" data-profile-h1>@${name}</h1>`
  );
  return out;
}

function namesFromSitemap() {
  const xml = readFileSync(SITEMAP, "utf8");
  const names = [];
  // Folder-style locs (canonical): https://favmoney.site/creator/<name>/
  // Legacy alias locs: https://favmoney.site/@<name>
  const re = /<loc>\s*https?:\/\/[^/]+\/(?:creator\/([^<\s/]+)\/?|@([^<\s/]+))\s*<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) {
    const raw = (m[1] ?? m[2] ?? "").trim();
    if (!raw) continue;
    try {
      names.push(decodeURIComponent(raw).trim());
    } catch {
      names.push(raw);
    }
  }
  return names;
}

const args = process.argv.slice(2);
const prune = args.includes("--prune");
const cliNames = args.filter((a) => !a.startsWith("--"));

const wanted = new Map();
for (const n of [...namesFromSitemap(), ...cliNames]) {
  if (!n) continue;
  if (!VALID.test(n)) {
    console.warn(`[gen] skip invalid creator name: ${JSON.stringify(n)}`);
    continue;
  }
  wanted.set(n, true);
}

const template = readFileSync(TEMPLATE, "utf8");
let written = 0;
for (const name of wanted.keys()) {
  const dir = join(CREATOR_DIR, name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "index.html");
  const baked = bake(template, name);
  let prev = null;
  try {
    prev = readFileSync(file, "utf8");
  } catch {}
  if (prev !== baked) {
    writeFileSync(file, baked);
    written++;
  }
}

let pruned = 0;
if (prune) {
  for (const entry of readdirSync(CREATOR_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".git") continue;
    if (!wanted.has(entry.name)) {
      rmSync(join(CREATOR_DIR, entry.name), { recursive: true, force: true });
      pruned++;
      console.log(`[gen] pruned creator/${entry.name}/`);
    }
  }
}

console.log(`[gen] creators: ${wanted.size}, files written: ${written}, pruned: ${pruned}`);

// No-slash handling is intentionally left to the platform: every creator has
// a real static folder, so /creator/<name> gets its trailing slash natively.
// (A generated /creator/<name> -> /creator/<name>/ 301 block used to live in
// _redirects, but Cloudflare's validator rejects some entries as infinite
// loops [code 100324] and fails the ENTIRE deploy — so nothing is written.)
console.log("[gen] _redirects: slash-redirect block intentionally skipped (platform normalizes)");
