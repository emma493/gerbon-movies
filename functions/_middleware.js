// Cloudflare Pages middleware.
//
// Three jobs:
// 1. Homepage bots (X/Twitter, Facebook, Telegram, WhatsApp, …) get OG HTML
//    whose og:image / twitter:image point at the default baked thumbnail
//    (site_config/og_preview). Humans pass through untouched.
// 2. Per-photo short-links /ep1, /ep2, … (Admin Photo page → photo_links/epN):
//    - bots get synthetic OG HTML with that link's own Cloudinary image +
//      "Hot Video 💋 / Click to watch now" copy (each link keeps its preview
//      forever, never overwritten).
//    - humans get a 302 to /?from=epN (landing_page + clicks attribution).
//      The redirect fires immediately; the clicks increment runs in the
//      background via waitUntil so it never slows navigation.
// 3. Everything else falls through; removed routes are handled by _redirects.

const BOT_RE =
  /twitterbot|facebookexternalhit|facebookcatalog|facebot|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|applebot|googlebot|bingbot|bytespider|embedly|quora link preview|showyoubot|outbrain|pinterest|tumblr/i;

// Strict slug shape: ep1 … ep999999 (case-insensitive on the path,
// always stored/looked up lowercase).
const EP_PATH_RE = /^\/ep\d{1,6}\/?$/i;
const EP_SLUG_RE = /^ep\d{1,6}$/;

const EP_TITLE = 'Hot Video \uD83D\uDC8B';
const EP_DESC = 'Click to watch now';

const PROJECT_ID = 'shortxx-app';
// Public browser API key (same as Admin bundle). Rules-gated, not secret.
const FIRESTORE_KEY = 'AIzaSyAcmxtdjT80jKyq4vuC0z6sd9AfS2zGE0w';
const META_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)` +
  `/documents/site_config/og_preview?key=${FIRESTORE_KEY}&mask.fieldPaths=imageUrl`;
const FALLBACK_IMG = 'https://favmoney.site/logo.png';

function photoDocUrl(slug) {
  return (
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)` +
    `/documents/photo_links/${encodeURIComponent(slug)}?key=${FIRESTORE_KEY}&mask.fieldPaths=imageUrl`
  );
}

function commitUrl() {
  return (
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)` +
    `/documents:commit?key=${FIRESTORE_KEY}`
  );
}

async function previewImageUrl() {
  try {
    const res = await fetch(META_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return FALLBACK_IMG;
    const doc = await res.json();
    const u = doc?.fields?.imageUrl?.stringValue || '';
    // Always serve the logo; never a Cloudinary-baked thumbnail.
    return FALLBACK_IMG;
  } catch {
    return FALLBACK_IMG;
  }
}

async function photoImageUrl(slug) {
  try {
    const res = await fetch(photoDocUrl(slug), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return FALLBACK_IMG;
    const doc = await res.json();
    const u = doc?.fields?.imageUrl?.stringValue || '';
    // Always serve the logo; never a Cloudinary-baked thumbnail.
    return FALLBACK_IMG;
  } catch {
    return FALLBACK_IMG;
  }
}

// Fire-and-forget clicks bump. Verifies the doc exists first so stray
// /ep999999 hits never create ghost docs via updateTransforms.
async function bumpEpClicks(slug) {
  try {
    const check = await fetch(photoDocUrl(slug), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!check.ok) return;
    const docName =
      `projects/${PROJECT_ID}/databases/(default)/documents/photo_links/${slug}`;
    await fetch(commitUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            updateTransforms: {
              document: docName,
              fieldTransforms: [
                { fieldPath: 'clicks', increment: { integerValue: '1' } },
                { fieldPath: 'lastClickedAt', setToServerValue: 'REQUEST_TIME' },
                { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
              ],
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Analytics must never break the redirect.
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEpHtml(slug, imgUrl) {
  const canonical = `https://favmoney.site/${slug}`;
  const title = escapeHtml(EP_TITLE);
  const desc = escapeHtml(EP_DESC);
  const img = escapeHtml(imgUrl);
  const url = escapeHtml(canonical);
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<title>${title}</title>` +
    `<meta name="description" content="${desc}">` +
    `<link rel="canonical" href="${url}">` +
    `<meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="${desc}">` +
    `<meta property="og:url" content="${url}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:image" content="${img}">` +
    `<meta property="og:image:secure_url" content="${img}">` +
    `<meta property="og:image:width" content="1200">` +
    `<meta property="og:image:height" content="630">` +
    `<meta property="og:site_name" content="Favmoney">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:title" content="${title}">` +
    `<meta name="twitter:description" content="${desc}">` +
    `<meta name="twitter:image" content="${img}">` +
    `<meta http-equiv="refresh" content="0;url=/?from=${encodeURIComponent(slug)}">` +
    `</head><body><p><a href="/?from=${encodeURIComponent(slug)}">${title}</a></p></body></html>`
  );
}

function rewriteOgImages(html, imgUrl) {
  // Order-independent: find each og:image / twitter:image meta tag, then swap
  // only its content attribute. Leaves image_src links + preloads alone.
  return html.replace(
    /<meta[^>]*?(?:property="og:image(?::secure_url)?"|name="twitter:image")[^>]*?>/gi,
    (tag) => tag.replace(/content="[^"]*"/i, `content="${imgUrl}"`)
  );
}

export async function onRequest(context) {
  const { request } = context;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return context.next();
  }
  if (request.method !== 'GET') return context.next();

  // ---- /epN short-links ----
  if (EP_PATH_RE.test(url.pathname)) {
    const slug = url.pathname.replace(/\//g, '').toLowerCase();
    if (!EP_SLUG_RE.test(slug)) return context.next();
    const ua = request.headers.get('user-agent') || '';
    const isBot = BOT_RE.test(ua);

    if (isBot) {
      const imgUrl = await photoImageUrl(slug);
      const html = buildEpHtml(slug, imgUrl);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          // Short edge cache: each epN image is immutable, but a short TTL
          // keeps first-time publishes converging fast on re-scrape.
          'Cache-Control': 'public, max-age=60, s-maxage=300',
          Vary: 'User-Agent',
        },
      });
    }

    // Human: count the click in the background, redirect immediately.
    try {
      const bump = bumpEpClicks(slug);
      const w =
        (context && context.waitUntil) ||
        (context && context.executionCtx && context.executionCtx.waitUntil);
      if (typeof w === 'function') w.call(context, bump);
      else bump.catch(() => {});
    } catch {
      // Never block navigation on analytics.
    }
    const target = new URL('/', url.origin);
    for (const [k, v] of url.searchParams) {
      if (k.toLowerCase() === 'from') continue;
      target.searchParams.append(k, v);
    }
    target.searchParams.set('from', slug);
    return Response.redirect(target.toString(), 302);
  }

  const isHome = url.pathname === '/' || url.pathname === '/index.html';
  if (!isHome) return context.next();

  const ua = request.headers.get('user-agent') || '';
  if (!BOT_RE.test(ua)) return context.next();

  try {
    const res = await context.next();
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return res;

    const html = await res.text();
    const imgUrl = await previewImageUrl();
    const out = rewriteOgImages(html, imgUrl);

    const headers = new Headers(res.headers);
    headers.set('Content-Type', 'text/html;charset=UTF-8');
    // Short edge cache: each publish is a new Cloudinary URL, so crawlers
    // pick up the new image on next scrape while repeats stay fast.
    headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    headers.set('Vary', 'User-Agent');
    return new Response(out, { status: res.status, headers });
  } catch {
    return context.next();
  }
}
