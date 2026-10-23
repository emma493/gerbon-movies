/* js/features/ads.js — banner refresh controller for the no-reload feed.
 *
 * The old index<->vid2 page-flip re-ran every ad script per video. The swipe
 * feed never reloads, so without this each banner would earn exactly one
 * impression per session. This module replays each ad CODE individually on
 * every video change (every scroll, scroll-only — no watch-time trigger).
 *
 * Serialized queue: all banner slots share the global `atOptions`, so slots
 * re-inject strictly one at a time — never overlapping, never mixed keys.
 * Social Bar / pop / tab-guard scripts are NEVER touched (persistent formats).
 * First impression always comes from the static index.html markup. */

let slots = [];
let queue = Promise.resolve();
let batches = 0;

function collectSlots() {
  const found = [];
  try {
    document.querySelectorAll("[data-ad-slot]").forEach((el) => {
      const type = el.getAttribute("data-ad-type") || "atoptions";
      if (type === "container") {
        const src = el.getAttribute("data-ad-src") || "";
        const container = el.getAttribute("data-ad-container") || "";
        if (!src || !container) return;
        found.push({ el, type, src, container, async: el.getAttribute("data-ad-async") === "1" });
      } else {
        const key = el.getAttribute("data-ad-key") || "";
        const host = el.getAttribute("data-ad-host") || "https://biomanos.org/22";
        const w = parseInt(el.getAttribute("data-ad-w") || "0", 10) || 0;
        const h = parseInt(el.getAttribute("data-ad-h") || "0", 10) || 0;
        if (!key) return;
        found.push({ el, type: "atoptions", key, host, w, h });
      }
    });
  } catch (e) {}
  return found;
}

function injectScript(container, src, isAsync) {
  return new Promise((resolve) => {
    try {
      const s = document.createElement("script");
      s.type = "text/javascript";
      if (isAsync) s.async = true;
      try { s.setAttribute("data-cfasync", "false"); } catch (e) {}
      s.src = src;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      s.onload = () => setTimeout(finish, 250);
      s.onerror = finish;
      setTimeout(finish, 8000);
      container.appendChild(s);
    } catch (e) {
      resolve();
    }
  });
}

/* Re-run ONE slot's code. DOM injection only — never document.write
 * (post-load document.write would wipe the page). */
function refreshSlot(s) {
  return (async () => {
    try {
      if (!document.contains(s.el)) return;
      s.el.innerHTML = "";
      if (s.type === "container") {
        const box = document.createElement("div");
        box.id = s.container;
        s.el.appendChild(box);
        await injectScript(s.el, s.src, s.async);
      } else {
        try {
          window.atOptions = { key: s.key, format: "iframe", height: s.h, width: s.w, params: {} };
        } catch (e) {}
        await injectScript(s.el, s.host + "/" + s.key, false);
      }
    } catch (e) {}
  })();
}

function runBatch(reason) {
  batches++;
  slots.forEach((s) => {
    queue = queue.then(() => refreshSlot(s));
  });
  queue = queue.catch(() => {});
}

function maybeBatch() {
  return slots.length > 0;
}

function onVideoChanged() {
  // Every scroll = one batch. No counter, no floor, no watch timer.
  if (maybeBatch()) {
    runBatch("scroll");
  }
}

function clearAdSlots() {
  try {
    document.querySelectorAll("[data-ad-slot]").forEach((el) => {
      el.innerHTML = "";
    });
  } catch (e) {}
}

function waitForVideoThenLoadAds() {
  const video = document.getElementById("main-video");
  const startAds = () => {
    slots = collectSlots();
    if (!slots.length) return;
    runBatch("video-ready");
  };
  if (!video) {
    startAds();
    return;
  }
  if (video.readyState >= 2) {
    startAds();
  } else {
    video.addEventListener("loadeddata", startAds, { once: true });
  }
  // Fallback: load ads after 15s if video never becomes ready.
  setTimeout(startAds, 15000);
}

export async function init() {
  // Clear any pre-loaded ad scripts from static HTML so ads don't load
  // before the video is ready.
  clearAdSlots();
  waitForVideoThenLoadAds();
  // Scroll-only: every sx:video-changed (swipe) replays all banner slots.
  // No scroll = no reload.
  window.addEventListener("sx:video-changed", () => {
    try { onVideoChanged(); } catch (e) {}
  });
  // Manual trigger (console/debug): window.sxAdsRefresh().
  window.sxAdsRefresh = () => {
    if (maybeBatch()) runBatch("manual");
    return batches;
  };
  window.sxAdsStats = () => ({ batches, slots: slots.length });
}
