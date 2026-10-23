/* js/lib/thumb.js — grid tiles are REAL <video> elements now.
 * No canvas capture, no frame cache, no observer: each tile points straight
 * at the video URL with preload="metadata" (headers + first bytes only, so
 * the first frame paints fast without downloading whole files). Grids show
 * live video instantly; the player takes over on tap.
 */

import { esc } from "./dom.js";

function keyOf(v) {
  return String(v.id || v.url || "");
}

/* Poster passthrough for the player / swipe paint while video loads.
 * Returns the Firestore poster_url when set, else null (no capture). */
export function getCachedThumb(v) {
  try {
    if (!v) return null;
    if (v.posterUrl) return v.posterUrl;
    return null;
  } catch (e) {
    return null;
  }
}

/* Tile HTML: a real muted video tile. Falls back to poster <img> when there
 * is no playable URL, or a dark placeholder when there is nothing at all. */
export function thumbHTML(v, cls) {
  const c = cls || "";
  try {
    if (!v) return '<div class="' + esc(c) + ' sx-thumb-fallback"></div>';
    if (v.url) {
      const poster = v.posterUrl
        ? ' poster="' + esc(v.posterUrl) + '"'
        : "";
      return (
        '<video class="' + esc(c) + ' sx-thumbvid" src="' + esc(v.url) + '"' +
        poster +
        ' muted playsinline preload="metadata" disablepictureinpicture aria-hidden="true"></video>'
      );
    }
    if (v.posterUrl) {
      return '<img class="' + esc(c) + '" src="' + esc(v.posterUrl) + '" alt="" loading="lazy" decoding="async" fetchpriority="low" />';
    }
  } catch (e) {}
  // Tiny dark placeholder (never white/blank) when nothing playable exists.
  return (
    '<div class="' + esc(c) + ' sx-thumb-fallback" data-vidkey="' + esc(keyOf(v || {})) + '"></div>'
  );
}

/* Kept for import compatibility — tiles no longer need a registry. */
export function registerVideos(list) {
  void list;
}

/* Kept for import compatibility — tiles load themselves, nothing to hydrate. */
export function hydrateThumbVideos(root) {
  void root;
}
