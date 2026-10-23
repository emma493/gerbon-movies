/* Favmoney service worker — app-shell caching only.
 * Video streams (HLS/mp4), Firestore traffic, analytics and ad networks
 * always go straight to the network so playback and data stay fresh. */
const CACHE = "favmoney-v17";
const SHELL = [
  "/",
  "/index.html",
  "/ntok.css",
  "/css/base.css",
  "/css/effects.css",
  "/css/features/menu.css",
  "/css/features/discover.css",
  "/css/features/feed.css",
  "/css/features/trending.css",
  "/css/features/player.css",
  "/css/features/guide.css",
  "/css/features/prefs.css",
  "/css/features/pwa.css",
  "/js/main.js",
  "/js/store.js",
  "/js/lib/dom.js",
  "/js/lib/side-menu.js",
  "/js/lib/thumb.js",
  "/js/features/player.js",
  "/js/features/swipe.js",
  "/js/features/ads.js",
  "/js/features/telemetry.js",
  "/js/features/creator.js",
  "/js/features/guide.js",
  "/js/features/prefs.js",
  "/js/features/likes.js",
  "/js/features/discover.js",
  "/js/features/menu.js",
  "/js/features/install.js",
  "/js/features/feed.js",
  "/js/features/trending.js",
  "/js/features/mute.js",
  "/js/features/share.js",
  "/js/features/video-title.js",
  "/js/features/chrome.js",
  "/js/features/nav.js",
  "/js/features/progress.js",
  "/vid.js",
  "/tracking.js",
  "/app-mode.js",
  "/pwa-install.js",
  "/pwa-banner.js",
  "/manifest.json",
  "/logo.png",
  "/icon.png",
  "/gif.webp",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/shortcut-home.png",
  "/icons/shortcut-fire.png",
  "/icons/shortcut-bookmark.png",
  "/icons/shortcut-video.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isBypass(url) {
  return (
    // Per-visitor edge APIs must never be cached or served cross-visitor.
    url.includes("/api/") ||
    url.includes("firestore.googleapis.com") ||
    url.includes("firebaseinstallations.googleapis.com") ||
    url.includes("googletagmanager.com") ||
    url.includes("google-analytics.com") ||
    url.includes("effectivecpmnetwork.com") ||
    url.includes("highperformanceformat.com") ||
    url.includes("biomanos.org") ||
    url.includes("profitableratecpmnetwork.com") ||
    url.includes(".m3u8") ||
    url.includes(".m3u8?") ||
    url.includes(".ts") ||
    url.includes(".mp4")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Media segments, streams, backend and ads: never intercept.
  if (isBypass(req.url)) return;
  if (req.headers.has("range")) return;

  // Navigations: network first, offline falls back to cached shell.
  // Only cache successful responses — never poison the fallback with
  // an error page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put("/index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate so deploys go live
  // without waiting for a CACHE version bump.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  // Cross-origin libraries (CDN): network first, cache fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});

/* Notifications (Web Push) removed — no push / notificationclick handlers. */
