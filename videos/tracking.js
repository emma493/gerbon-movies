/**
 * tracking.js - Favmoney Video Data Engine (Reliable Views Fix)
 */

const firebaseConfig = {
  apiKey: "AIzaSyAcmxtdjT80jKyq4vuC0z6sd9AfS2zGE0w",
  authDomain: "shortxx-app.firebaseapp.com",
  projectId: "shortxx-app",
  storageBucket: "shortxx-app.firebasestorage.app",
  messagingSenderId: "533200613394",
  appId: "1:533200613394:web:90313909fd25237942a8cb",
  measurementId: "G-9MZN5BXC0X",
};

(function loadFirebaseSDKs() {
  const scripts = [
    "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-compat.js",
  ];

  let loadedCount = 0;
  scripts.forEach((src) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      loadedCount++;
      if (loadedCount === scripts.length) {
        initFirebase();
      }
    };
    document.head.appendChild(script);
  });
})();

function initFirebase() {
  let app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();
  
  // Default Firestore database instance (project: shortxx-app)
  const db = app.firestore();

  window.shortxxDb = db;

  // Flush any pending views queued prior to SDK load
  if (window._shortxxPendingViews && window._shortxxPendingViews.length) {
    const pending = [...window._shortxxPendingViews];
    window._shortxxPendingViews = [];
    pending.forEach((id) => recordView(id));
  }
}

function detectDeviceType() {
  const ua = (navigator.userAgent || "").toLowerCase();
  if (/tablet|ipad|playbook|silk/.test(ua)) return "Tablet";
  if (/mobile|iphone|ipod|android|blackberry|windows phone/.test(ua)) return "Mobile";
  return "Desktop";
}

function detectAppType() {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return "PWA";
  } catch (e) {}
  if (window.navigator && window.navigator.standalone === true) return "PWA";
  return "Browser";
}

function parseReferral() {
  try {
    const params = new URLSearchParams(location.search || "");
    const utm_source = (params.get("utm_source") || "").slice(0, 80);
    const utm_medium = (params.get("utm_medium") || "").slice(0, 80);
    const utm_campaign = (params.get("utm_campaign") || "").slice(0, 80);
    const click_id = params.get("gclid") || params.get("fbclid") || params.get("msclkid") || "";
    const utm = utm_source.toLowerCase();
    const ref = document.referrer || "";
    let host = "";
    try { host = ref ? new URL(ref).hostname.toLowerCase() : ""; } catch (e) { host = ref.toLowerCase(); }
    // Internal navigation (same host) counts as Direct, not Organic.
    let selfHost = "";
    try { selfHost = (location.hostname || "").toLowerCase(); } catch (e) {}
    if (host && selfHost && host === selfHost) {
      return { group: "Direct", host: host.slice(0, 120), utm_source, utm_medium, utm_campaign, click_id: String(click_id).slice(0, 80) };
    }
    if (utm.includes("google") || host.includes("google")) return { group: "Google", host: host.slice(0, 120), utm_source, utm_medium, utm_campaign, click_id: String(click_id).slice(0, 80) };
    if (!ref && !utm_source) return { group: "Direct", host: "", utm_source, utm_medium, utm_campaign, click_id: "" };
    if (/facebook|instagram|tiktok|twitter|x\.com|youtube|snap|whatsapp|telegram/.test(utm + " " + host)) return { group: "Social", host: host.slice(0, 120), utm_source, utm_medium, utm_campaign, click_id: String(click_id).slice(0, 80) };
    return { group: "Organic", host: host.slice(0, 120), utm_source, utm_medium, utm_campaign, click_id: String(click_id).slice(0, 80) };
  } catch (e) {
    return { group: "Direct", host: "", utm_source: "", utm_medium: "", utm_campaign: "", click_id: "" };
  }
}

function classifyReferralGroup() {
  return parseReferral().group;
}

// Country readiness gate: main.js (modular path) and script.js (legacy
// path) resolve window.shortxxCountry right after boot. The first play can
// happen before that, which used to log every early view as "GH". Wait up
// to ~800ms for the real (edge-first) country; the safety timeout resolves
// anyway so views are never dropped for geo. Absent gate = legacy behavior.
function readyCountry() {
  try {
    if (window.shortxxCountry) return Promise.resolve();
    if (window.shortxxCountryReady && typeof window.shortxxCountryReady.then === "function") {
      return Promise.race([
        window.shortxxCountryReady,
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    }
  } catch (e) {}
  return Promise.resolve();
}

async function recordView(videoId) {
  if (!videoId || !window.shortxxDb) return;

  await readyCountry();

  const docRef = window.shortxxDb.collection("videos").doc(videoId);
  const eventsRef = window.shortxxDb.collection("events");

  // Perform view increment directly on video document
  docRef.update({
    views: firebase.firestore.FieldValue.increment(1),
    last_viewed: firebase.firestore.FieldValue.serverTimestamp()
  }).catch((err) => {
    // If update fails because document missing views field, fallback to set with merge
    docRef.set(
      { views: firebase.firestore.FieldValue.increment(1), last_viewed: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });

  // Log granular video_view event for the 24H analytics filter
  // userId bridges to the signed-in identity when script.js has set one.
  const _ref = parseReferral();
  eventsRef.add({
    event_type: "video_view",
    video_id: videoId,
    userId: window.shortxxIdentity || "ANONYMOUS",
    user_agent: navigator.userAgent || "",
    device_type: detectDeviceType(),
    app_type: detectAppType(),
    referral_group: _ref.group,
    referrer_host: _ref.host || "Direct",
    utm_source: _ref.utm_source || "",
    utm_medium: _ref.utm_medium || "",
    utm_campaign: _ref.utm_campaign || "",
    landing_page: (location.pathname + location.search).slice(0, 200),
    country: (window.shortxxCountry || "GH"),
    country_source: (window.shortxxCountrySource || "client-locale"),
    referrer: document.referrer || "Direct",
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    createdAt: new Date().toISOString() // Backup ISO string for legacy queries
  }).catch((err) => {
    console.warn("Error logging video_view event:", err);
  });
}

window.trackVideoView = async function (videoId) {
  if (!videoId) return;

  if (!window.shortxxDb) {
    window._shortxxPendingViews = window._shortxxPendingViews || [];
    window._shortxxPendingViews.push(videoId);
    return;
  }

  await recordView(videoId);
};

// Video-ad interstitial removed — no-op stub so already-cached pages
// calling window.trackPromoEvent() can't throw. Historical promo_*
// events stay in Firestore as read-only history.
window.trackPromoEvent = function () {};