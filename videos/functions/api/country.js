// Real visitor country from Cloudflare edge geo (IP-based, unblockable).
//
// Client-side lookups (ip-api, timezone, locale) all fail closed to a GH
// default when blocked or spoofed — this endpoint is the authoritative
// source: same-origin fetch, so adblockers can't touch it, and the value
// comes from the edge, not the browser. Never cached (per-visitor).
//
// Used by vid.js resolveCountry() step 0. Non-Cloudflare hosts (local dev,
// previews) get { code: "XX", source: "unknown" } and fall through to the
// legacy client chain.

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  let code = 'XX';
  try {
    const cf = request.cf || {};
    const raw = typeof cf.country === 'string' ? cf.country.toUpperCase() : '';
    if (/^[A-Z]{2}$/.test(raw)) code = raw;
  } catch {
    // Fall through to XX — client treats it as "unknown, keep resolving".
  }
  const headers = {
    'Content-Type': 'application/json',
    // Per-visitor response: never store anywhere.
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  };
  if (request.method === 'HEAD') return new Response(null, { headers });
  return new Response(JSON.stringify({ code }), { headers });
}
