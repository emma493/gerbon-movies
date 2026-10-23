import {
  loadVideosFromFirestore,
  getCurrentVideo,
  didVideosLoad,
  getLastLoadError,
  getVideoCount,
  resolveCountry,
} from "../vid.js";
import { store, publishIdentity } from "./store.js";
import { makeToast } from "./lib/dom.js";
// Critical path is static (like the old single-script app): player + swipe
// wire FIRST and play even if every other feature stalls below.
import { init as initPlayer } from "./features/player.js";
import { init as initSwipe } from "./features/swipe.js";

/* js/main.js — isolated bootstrap. Player + swipe (the critical path) are
 * static imports wired FIRST so video plays even on a bad network; every
 * other feature loads via dynamic import() IN PARALLEL with its own
 * timeout + try/catch, so one slow CDN or broken feature never blocks
 * the rest. */

const FEATURES = [
  "ads",
  "creator",
  "guide",
  "prefs",
  "telemetry",
  "likes",
  "discover",
  "menu",
  "install",
  "feed",
  "trending",
  "mute",
  "share",
  "video-title",
  "chrome",
  "nav",
  "progress",
];

// Slow networks must not serialize-block the UI: cap each feature.
const FEATURE_TIMEOUT_MS = 30000;

function report(feature, err) {
  console.warn("[shortxx] feature failed: " + feature, err);
}

function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout: " + label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const toast = makeToast();
  const ctx = { toast, getCurrentVideo, store };

  // 0. PWA shortcut deep links (?feed=...) — same behavior as before split.
  // Declared outside try: read again after features boot below.
  let wantsPrefs = false;
  try {
    const params = new URLSearchParams(location.search);
    const deepFeed = params.get("feed");
    const deepPrefs = params.get("prefs");
    if (deepFeed === "live") {
      location.href =
        "https://araplhn.org/4/f4da12d7aaa67cd61f6a1196381da654";
      return;
    }
    if (deepFeed === "foryou" || deepFeed === "trending" || deepFeed === "saved") {
      const u = new URL(location.href);
      u.searchParams.delete("feed");
      try {
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) {}
    }
    // Side-menu Preferences from folder pages (?prefs=1): strip the param
    // now, open the popup after features boot below.
    if (deepPrefs === "1") {
      wantsPrefs = true;
      try {
        const u = new URL(location.href);
        u.searchParams.delete("prefs");
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) {}
    }
  } catch (e) {
    report("deeplink", e);
  }

  // 1. Wire up the UI FIRST so every button is clickable instantly,
  // then fill in the videos in the background.
  publishIdentity();

  // 1b. Country early-boot (edge-first via /api/country): tracking.js
  // video_view events read window.shortxxCountry at play time. Resolve NOW,
  // fire-and-forget, so the first play logs the real country instead of the
  // "GH" default. The readiness gate lets tracking.js wait up to ~800ms for
  // this; the safety timeout resolves anyway so views are never dropped.
  // The telemetry feature (step 4) reuses the cached value for user docs.
  if (!window.shortxxCountryReady) {
    window.shortxxCountryReady = new Promise((resolve) => {
      window._shortxxCountryResolve = resolve;
      setTimeout(() => {
        try {
          if (window._shortxxCountryResolve) window._shortxxCountryResolve();
        } catch (e) {}
        window._shortxxCountryResolve = null;
      }, 800);
    });
  }
  resolveCountry().then(
    (geo) => {
      try {
        window.shortxxCountry = geo.code;
        window.shortxxCountrySource = geo.source;
        if (window._shortxxCountryResolve) window._shortxxCountryResolve();
      } catch (e) {}
      window._shortxxCountryResolve = null;
    },
    () => {
      try {
        if (window._shortxxCountryResolve) window._shortxxCountryResolve();
      } catch (e) {}
      window._shortxxCountryResolve = null;
    }
  );

  const videosReady = () => {
    try {
      if (getVideoCount() > 0) {
        const r = document.getElementById("sx-retry");
        if (r) r.remove();
      }
    } catch (e) {}
    window.dispatchEvent(new CustomEvent("sx:videos-ready"));
  };
  const load = (async () => {
    try {
      await loadVideosFromFirestore();
    } catch (e) {
      report("videos", e);
    }
    videosReady();
  })();
  // Manual retry (feed button / error UI): reload pool, rebuild on success.
  window.sxRetryVideos = async () => {
    try {
      const r = document.getElementById("sx-retry");
      if (r) r.remove();
    } catch (e) {}
    try {
      const l = document.getElementById("sx-loader");
      if (l) l.style.display = "flex";
    } catch (e) {}
    try {
      await loadVideosFromFirestore();
    } catch (e) {
      report("videos-retry", e);
    }
    videosReady();
  };
  // Surface load failures in plain language instead of a silent black feed.
  window.addEventListener("sx:videos-error", (ev) => {
    try {
      const msg = String((ev && ev.detail && ev.detail.message) || "");
      console.error("Database error:", msg);
      if (/permission|denied/i.test(msg)) {
        toast("Database blocked access — check Firestore rules");
      } else if (/unavailable|network|failed to get|failed to fetch|timeout/i.test(msg)) {
        toast("Can't reach database — check connection or adblocker");
      } else {
        toast("Video load failed — reopen the app to retry");
      }
      // Empty pool: stop the infinite spinner and offer a tap-to-retry
      // button over the player instead of a forever-loader.
      if (/empty pool/i.test(msg)) {
        try {
          const l = document.getElementById("sx-loader");
          if (l) l.style.display = "none";
        } catch (e) {}
        try {
          if (!document.getElementById("sx-retry")) {
            const host = document.getElementById("player-region");
            if (host) {
              const b = document.createElement("button");
              b.id = "sx-retry";
              b.type = "button";
              b.textContent = "Couldn't load videos — tap to retry";
              b.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;max-width:80%;padding:12px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:rgba(20,20,20,.92);color:#fff;font-size:14px;font-weight:700;cursor:pointer;";
              b.addEventListener("click", () => {
                try { window.sxRetryVideos && window.sxRetryVideos(); } catch (e) {}
              });
              host.appendChild(b);
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  });
  // Safety net: if the network hangs, retry once instead of stranding the
  // feed. Late success self-heals via sx:videos-ready (swipe rebuilds).
  setTimeout(async () => {
    try {
      if (didVideosLoad() && getVideoCount() > 0) return;
      const err = getLastLoadError();
      if (!didVideosLoad() || (err && getVideoCount() === 0)) {
        toast("Still connecting to database…");
        await window.sxRetryVideos();
        if (!didVideosLoad() || getVideoCount() === 0) {
          console.error("Database retry failed — reloading page");
          location.reload();
        }
      }
    } catch (e) {}
  }, 12000);

  // Guest-only: no auth module, no login stubs.
  // 2. Critical path FIRST: player + swipe wire synchronously so video
  // plays even if the parallel fan-out below stalls (slow CDN/radio).
  try {
    await initPlayer(ctx);
  } catch (e) {
    report("player", e);
  }
  try {
    await initSwipe();
  } catch (e) {
    report("swipe", e);
  }

  // 3. Secondary features wait for the first played frame (or 15s), so
  // boot bandwidth belongs to the video alone — test.html parity. They
  // sync via store + sx:* events, so late init is lossless.
  const waitFirstFrame = new Promise((resolve) => {
    let done = false;
    const go = () => { if (!done) { done = true; resolve(); } };
    try {
      const v = document.getElementById("main-video");
      if (v) {
        v.addEventListener("playing", go, { once: true });
        if (!v.paused && v.readyState >= 2) { go(); return; }
      }
    } catch (e) {}
    setTimeout(go, 15000);
  });
  await waitFirstFrame;

  // 4. Load ALL remaining features in parallel — order-independent by design
  // (they sync via store + sx:* window events, never direct imports).
  const loadFeature = async (name) => {
    const mod = await withTimeout(
      import("./features/" + name + ".js"),
      FEATURE_TIMEOUT_MS,
      name,
    );
    if (mod && typeof mod.init === "function") {
      await withTimeout(Promise.resolve().then(() => mod.init(ctx)), FEATURE_TIMEOUT_MS, name + ":init");
    }
  };
  // Two passes: stragglers on a slow link get a second chance instead of
  // staying dead for the whole session. Only import-stage timeouts retry
  // (re-running a half-finished init could double-wire UI); only
  // double-failures toast.
  let results = await Promise.allSettled(FEATURES.map(loadFeature));
  const failedOnce = FEATURES.filter((name, i) => {
    if (results[i].status !== "rejected") return false;
    const msg = String((results[i].reason && results[i].reason.message) || results[i].reason || "");
    return !/:init$/.test(msg);
  });
  if (failedOnce.length) {
    const retry = await Promise.allSettled(failedOnce.map(loadFeature));
    retry.forEach((r, k) => {
      if (r.status === "fulfilled") {
        const i = FEATURES.indexOf(failedOnce[k]);
        if (i >= 0) results[i] = r;
      }
    });
  }
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      report(FEATURES[i], r.reason);
      try {
        toast("Feature unavailable: " + FEATURES[i]);
      } catch (err) {}
    }
  });
  if (wantsPrefs) {
    try {
      if (window.sxOpenPrefs) window.sxOpenPrefs(true);
    } catch (e) {}
  }
  await load;
  // Late-feature heal: prefs/guide/discover/trending/player all init AFTER
  // the early boot sx:videos-ready above, so their listeners miss it and the
  // first-visit popup never opens. One non-reset re-fire lets them sync.
  // Safe: swipe.js treats a same-size non-reset event as a no-op (no
  // rebuild, no replay, no scroll jump).
  try {
    if (getVideoCount() > 0) videosReady();
  } catch (e) {}
});
