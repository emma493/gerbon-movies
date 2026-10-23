import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
import { getFirestore, initializeFirestore, collection, getDocs, query, where, limit, startAfter, doc, getDoc, setDoc, updateDoc, increment, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Firebase Configuration (project: shortxx-app)
const firebaseConfig = {
  apiKey: "AIzaSyAcmxtdjT80jKyq4vuC0z6sd9AfS2zGE0w",
  authDomain: "shortxx-app.firebaseapp.com",
  projectId: "shortxx-app",
  storageBucket: "shortxx-app.firebasestorage.app",
  messagingSenderId: "533200613394",
  appId: "1:533200613394:web:90313909fd25237942a8cb",
  measurementId: "G-9MZN5BXC0X"
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firebase Analytics (measurementId G-9MZN5BXC0X) — guarded: ad-blockers
// or unsupported environments must never break video playback.
try {
  getAnalytics(app);
} catch (e) {
  console.warn("Analytics init skipped:", e);
}

// Default Firestore database instance. Auto-detect long polling so networks
// that kill the SDK's persistent stream (proxies, firewalls, adblockers)
// transparently fall back to plain request/response instead of going
// "offline". Falls back to stock init if the option is ever unsupported.
let db;
try {
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch (e) {
  db = getFirestore(app);
}

/** Shared Firebase app instance (powers Firebase Auth in script.js). */
export function getFirebaseApp() {
  return app;
}

/* Guest-only: no per-user synced profiles. Stubs kept so legacy
 * imports (script.js) never break. */
export async function loadUserProfile(uid) {
  return null;
}

export async function saveUserProfile(uid, data) {
  return;
}

// Stable per-video creator pseudonyms (no Admin change needed).
// Same video id always maps to the same name on every device.
export const USERNAMES = [
  "LilyGrace", "AvaRose", "EmmaBelle", "SophiaMae", "IsabellaJoy",
  "MiaHope", "CharlotteSky", "AmeliaDawn", "HarperLee", "EvelynRose",
  "AbigailStar", "EmilyBloom", "EllaJune", "ScarlettRay", "GraceLynn",
  "ChloeKate", "PenelopeSue", "LaylaJo", "RileyQuinn", "ZoeyAnn",
  "NoraJane", "LilyPearl",
];

export function creatorFor(id) {
  if (!id) return USERNAMES[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return USERNAMES[h % USERNAMES.length];
}

export function formatCount(n) {
  const v = typeof n === "number" ? n : 0;
  if (v >= 1000) return (v / 1000).toFixed(1) + "K";
  return String(v);
}

// Each entry is now { id, url, views, likes, creator, ... } so likes,
// views and attribution travel with the video.
let fetchedVideos = [];
let currentVideoIndex = 0;
let currentVideo = null;
let preloaderElement = null;
// Unfiltered pool (preference + feed-mode ordering derive from this).
// Append-only after boot: swipe windows are index-keyed, so existing
// entries never move — new pages concatenate at the end.
let allRawVideos = [];
// Paged feed: boot fetches a small batch in one round trip and shuffles
// it, so the first video is random every visit instead of always the same
// doc. After boot the pool keeps growing one video at a time as you swipe.
// Grids bulk-fill via ensurePoolSize below.
const FIRST_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;
let pageCursor = null;
let morePages = true;
let pagingInFlight = false;
let filling = false;

/** True while further pages can still be fetched. */
export function hasMoreVideos() {
  return morePages;
}

/** Orders ONLY new arrivals per current pref (never reshuffles the
 *  live pool — swipe windows are index-keyed and must stay stable). */
function orderPage(newRaw) {
  const scoped = applyPreference(newRaw);
  return shuffleArray([...scoped]);
}

/** One raw page via the SDK (cursor null = first page). */
async function fetchRawPage(cursor, size) {
  const videosRef = collection(db, "videos");
  // Tiny pages: small JSON per request instead of the whole collection at
  // once, so first paint never waits on hundreds of docs.
  const lim = Math.min(Math.max(size || 1, 1), MAX_PAGE_SIZE);
  const q = cursor
    ? query(videosRef, where("is_active", "==", true), startAfter(cursor), limit(lim))
    : query(videosRef, where("is_active", "==", true), limit(lim));
  const snap = await getDocs(q);
  const raw = [];
  snap.forEach((docSnap) => {
    const v = toVideoObject(docSnap.id, docSnap.data());
    if (v) raw.push(v);
  });
  const docs = snap.docs || [];
  return { raw, lastDoc: docs.length ? docs[docs.length - 1] : null, exhausted: docs.length < lim };
}
// Load-state tracking: lets the boot sequence tell "still loading" apart
// from "failed", retry a hung request, and surface the real cause instead
// of a silent black feed.
let loadSettled = false;
let lastLoadError = null;

/** True once the initial Firestore load resolved (success or failure). */
export function didVideosLoad() {
  return loadSettled;
}

/** Last load failure (Error or null). Null after any success. */
export function getLastLoadError() {
  return lastLoadError;
}

// Content preference: Girls only ('For You'). Hardcoded — no user
// preference storage, girls videos always play.
export function getContentPreference() {
  return "girls";
}

function effectiveCategory(v) {
  const c = v.creatorCategory || v.category;
  return c === "girls" ? c : null;
}

function applyPreference(list, prefOverride) {
  // Girls always play; no preference switching. Keep all videos that are
  // labeled girls, and unlabeled legacy videos (permissive fallback so the
  // feed can never blank on a data gap).
  const hasAnyLabeled = list.some((v) => effectiveCategory(v) !== null);
  const kept = list.filter((v) => {
    const c = effectiveCategory(v);
    if (!c) return !hasAnyLabeled;
    return c === "girls";
  });
  if (kept.length === 0 && list.length > 0) return list;
  return kept;
}

/* Girls always play. Kept as a stub so legacy imports (prefs.js) never
 * break. No persistence, no backfill — girls videos always play. */
export function setContentPreference(pref) {
  return true;
}

// Creator directory (Session A `creators` collection). Best-effort: rules
// may not be deployed yet — any failure falls back to stable pseudonyms.
let creatorsById = {};

export async function loadCreators() {
  try {
    const snap = await getDocs(
      query(collection(db, "creators"), where("is_active", "==", true)),
    );
    const map = {};
    snap.forEach((d) => {
      const data = d.data();
      if (data.username) {
        const num = (v) => (typeof v === "number" ? v : null);
        const cat = data.category === "girls" ? data.category : null;
        map[d.id] = {
          username: data.username,
          avatarUrl: data.avatarUrl || null,
          bio: typeof data.bio === "string" ? data.bio : null,
          followers: num(data.followers),
          following: num(data.following),
          likesTotal: num(data.likesTotal),
          category: cat,
        };
      }
    });
    creatorsById = map;
  } catch (err) {
    console.warn("Creators lookup skipped (rules/data pending):", err);
    creatorsById = {};
  }
  return creatorsById;
}

function resolveCreator(data, docId) {
  const ref = data.creatorId && creatorsById[data.creatorId];
  if (ref) {
    return {
      name: ref.username,
      avatarUrl: ref.avatarUrl || null,
      bio: ref.bio || null,
      followers: ref.followers,
      following: ref.following,
      likesTotal: ref.likesTotal,
      creatorCategory: ref.category || null,
      linked: true,
    };
  }
  // Unlinked legacy video: fall back to stable pseudonym so /@name
  // profiles (sitemap, creators grid, feed avatar) always resolve to
  // videos instead of rendering empty. linked=true keeps the feed avatar
  // visible and the standalone /@ route grouped by the same name.
  return { name: creatorFor(docId), avatarUrl: null, bio: null, followers: null, following: null, likesTotal: null, creatorCategory: null, linked: true };
}

/* Guest-only: single shuffled feed ordered by content preference
 * (Girls / Couples / All). No Following / Top modes. */
export function getFeedMode() {
  return "foryou";
}

export function setFeedMode(mode) {
  return;
}

function applyFeedOrder(list) {
  return shuffleArray([...applyPreference(list)]);
}

/** New random order for the NEXT cycle after the user has watched every
 *  video in the current pool. Never reshuffles mid-cycle (swipe windows are
 *  index-keyed) — only called exactly on wrap. */
function reshuffleLivePool() {
  const base = allRawVideos.length ? applyPreference(allRawVideos) : fetchedVideos;
  fetchedVideos = shuffleArray([...(base.length ? base : fetchedVideos)]);
}

/**
 * Fisher-Yates Shuffle Algorithm for true randomness.
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Preloads the next video in memory in the background for fast, instant
 * switching. Always warms the plain `direct_url` (not the HLS manifest) -
 * this is a throwaway <video> just to prime the browser's HTTP cache/DNS,
 * not the element that will actually play; hls.js does its own buffering
 * once a video is actually attached and playing.
 */
function preloadNextVideo() {
  if (fetchedVideos.length <= 1) return;
  const nextIndex = (currentVideoIndex + 1) % fetchedVideos.length;
  const nextVideo = fetchedVideos[nextIndex];
  if (!nextVideo) return;

  if (!preloaderElement) {
    preloaderElement = document.createElement("video");
    // Metadata ONLY, always: a full "auto" preload downloads the entire
    // next file and starves the playing video on slow links (audio flows,
    // picture never arrives). Headers + first bytes are enough to make the
    // next swipe instant without halving live bandwidth.
    preloaderElement.preload = "metadata";
  }

  preloaderElement.src = nextVideo.url;
  preloaderElement.load();
}

/**
 * Maps one plain video doc ({direct_url, ...}) to a pool entry.
 * Returns null when there is no playable URL. Shared by the SDK path
 * and the REST fallback below so both produce identical entries.
 */
function toVideoObject(id, data) {
  if (!data || !data.direct_url) return null;
  const who = resolveCreator(data, id);
  let createdAtMillis = 0;
  const ts = data.created_at || data.createdAt;
  if (ts && typeof ts.toMillis === "function") {
    try {
      createdAtMillis = ts.toMillis();
    } catch (e) {}
  } else if (ts && typeof ts._seconds === "number") {
    createdAtMillis = ts._seconds * 1000;
  } else if (typeof ts === "string") {
    const p = Date.parse(ts);
    if (!isNaN(p)) createdAtMillis = p;
  }
  return {
    id,
    url: data.direct_url,
    // Populated once the admin dashboard's transcodeVideo Cloud
    // Function has processed this video. Only trust hlsUrl for
    // adaptive playback when status is explicitly "ready" - a
    // video mid-transcode (or one that failed) still has a
    // perfectly playable `url` (direct_url) to fall back to.
    hlsUrl: data.status === 'ready' ? data.hls_url || null : null,
    posterUrl: data.poster_url || null,
    views: typeof data.views === 'number' ? data.views : 0,
    likes: typeof data.likes === 'number' ? data.likes : 0,
    creator: who.name,
    creatorLinked: who.linked,
    creatorCategory: who.creatorCategory || null,
    avatarUrl: who.avatarUrl,
    // Optional Session-A fields (captionAI / Upload page). Absent on
    // legacy docs — every consumer must tolerate missing values.
    category: typeof data.category === 'string' ? data.category : null,
    caption: typeof data.caption === 'string' ? data.caption : null,
    hashtags: Array.isArray(data.hashtags) ? data.hashtags.filter((t) => typeof t === 'string' && t) : [],
    createdAtMillis,
  };
}

// --- REST fallback unwrappers (Firestore REST wraps every value in a
// typed envelope: {stringValue}, {integerValue: "5"}, {booleanValue}, ...).
const restStr = (f) => (f && typeof f.stringValue === "string" ? f.stringValue : null);
const restBool = (f) => !!(f && (f.booleanValue === true || f.booleanValue === "true"));
const restNum = (f) => {
  if (!f) return 0;
  if (typeof f.integerValue !== "undefined") {
    const n = parseInt(f.integerValue, 10);
    return isNaN(n) ? 0 : n;
  }
  if (typeof f.doubleValue !== "undefined") return Number(f.doubleValue) || 0;
  return 0;
};

/**
 * Plain-HTTPS fallback for the videos list. Used only when the Firestore
 * SDK path yields nothing (offline mode / blocked watch stream): the SDK
 * needs a persistent stream, plain fetch does not, so proxies that kill
 * long-lived streams can still serve this. Returns pool entries (same
 * shape as the SDK path) or [].
 */
async function loadVideosViaRest() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 45000);
  try {
    const url =
      "https://firestore.googleapis.com/v1/projects/" + firebaseConfig.projectId +
      "/databases/(default)/documents/videos?pageSize=200&key=" + firebaseConfig.apiKey;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res || !res.ok) {
      console.warn("[shortxx] REST fallback HTTP " + (res ? res.status : "no-response"));
      return [];
    }
    const json = await res.json();
    const docs = json && Array.isArray(json.documents) ? json.documents : [];
    const out = [];
    for (const d of docs) {
      try {
        const f = d.fields || {};
        if (!restBool(f.is_active)) continue;
        const tags = f.hashtags && Array.isArray(f.hashtags.arrayValue && f.hashtags.arrayValue.values)
          ? f.hashtags.arrayValue.values.map((t) => (t && t.stringValue) || "").filter(Boolean)
          : [];
        const v = toVideoObject(String((d.name || "").split("/").pop() || ""), {
          direct_url: restStr(f.direct_url),
          hls_url: restStr(f.hls_url),
          poster_url: restStr(f.poster_url),
          status: restStr(f.status),
          views: restNum(f.views),
          likes: restNum(f.likes),
          creatorId: restStr(f.creatorId),
          category: restStr(f.category),
          caption: restStr(f.caption),
          hashtags: tags,
          created_at: restStr(f.created_at) || restStr(f.createdAt),
        });
        if (v) out.push(v);
      } catch (e) {}
    }
    return out;
  } catch (e) {
    console.warn("[shortxx] REST fallback failed:", String((e && e.message) || e));
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches all active videos from Firestore, restores playback state, and
 * orders them per the active feed mode.
 */
export async function loadVideosFromFirestore() {
  // Fresh pool (boot, feed switch, retry): reset paging, load page one.
  pageCursor = null;
  morePages = true;
  try {
    // Creator directory is best-effort: never let it block videos. A hung
    // creators query (offline SDK) loses the race after 8s and videos
    // proceed with stable pseudonyms.
    await Promise.race([
      loadCreators(),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);

    // Same guard for the videos query itself: a hung SDK request must not
    // wedge the boot — time out into the REST fallback below.
    let first;
    try {
      first = await Promise.race([
        fetchRawPage(null, FIRST_PAGE_SIZE),
        new Promise((_, reject) => setTimeout(() => reject(new Error("sdk-timeout")), 20000)),
      ]);
    } catch (e) {
      first = { raw: [], lastDoc: null, exhausted: true };
    }
    pageCursor = first.lastDoc;
    morePages = !first.exhausted;

    let rawVideos = first.raw;

    // SDK yielded nothing (offline mode / blocked stream): one plain-HTTPS
    // attempt before giving up. REST returns the full set, so paging ends.
    // No-op cost on the normal path.
    if (rawVideos.length === 0) {
      try {
        rawVideos = await loadVideosViaRest();
        if (rawVideos.length) {
          morePages = false;
          console.info("[shortxx] videos via REST fallback: " + rawVideos.length);
        }
      } catch (e) {}
    }

    if (rawVideos.length === 0) {
      console.warn("No active videos found in Firestore.");
      loadSettled = true;
      lastLoadError = new Error("empty pool: no active videos");
      // Surface instead of stranding on black: main.js toasts on this event.
      try {
        window.dispatchEvent(new CustomEvent("sx:videos-error", { detail: { message: "empty pool: no active videos" } }));
      } catch (e) {}
      return [];
    }

    // Guest feed: fresh random shuffle EVERY visit (no resume).
    allRawVideos = rawVideos;
    fetchedVideos = applyFeedOrder(rawVideos);
    currentVideoIndex = 0;

    // Discover/Trending grid pick: jump straight to the chosen video.
    try {
      const pick = sessionStorage.getItem("shortxx_pick");
      if (pick) {
        const pi = fetchedVideos.findIndex((v) => v.id === pick);
        if (pi >= 0) currentVideoIndex = pi;
        sessionStorage.removeItem("shortxx_pick");
      }
    } catch (e) { /* storage blocked: ignore */ }
    try {
      localStorage.setItem("currentVideoIndex", String(currentVideoIndex));
    } catch (e) {}

    preloadNextVideo();
    loadSettled = true;
    lastLoadError = null;
    return fetchedVideos;
  } catch (error) {
    console.error("Error fetching videos from Firestore:", error);
    loadSettled = true;
    lastLoadError = error instanceof Error ? error : new Error(String(error));
    // Surface the cause to the boot sequence (toast + retry UI) instead
    // of failing silently with an empty pool.
    try {
      window.dispatchEvent(new CustomEvent("sx:videos-error", { detail: { message: String((error && error.message) || error) } }));
    } catch (e) {}
    return [];
  }
}

/**
 * Fetches the next page (default: exactly 1 video) and appends it to the
 * live pool — steady state is 1 playing + 1 fetched ahead. Existing indices
 * never move; grids + swipe extend via sx:videos-ready. Returns pool size.
 * No-op while a fetch is in flight or exhausted. Pages fully filtered out
 * (e.g. Following with no match) auto-advance to the next page.
 */
export async function requestMoreVideos(count = 1) {
  if (!morePages || pagingInFlight) return getVideoCount();
  pagingInFlight = true;
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      const page = await fetchRawPage(pageCursor, count);
      pageCursor = page.lastDoc || pageCursor;
      if (page.exhausted) morePages = false;
      if (page.raw.length) {
        allRawVideos = [...allRawVideos, ...page.raw];
        fetchedVideos = [...fetchedVideos, ...orderPage(page.raw)];
        try {
          window.dispatchEvent(new CustomEvent("sx:videos-ready"));
        } catch (e) {}
        return getVideoCount();
      }
      if (!morePages) break;
    }
    return getVideoCount();
  } catch (e) {
    return getVideoCount();
  } finally {
    pagingInFlight = false;
  }
}

/**
 * Bulk-fill for grids (Discover/Trending/Saved/Liked/Creators): pages up
 * until the pool holds n videos or the collection is exhausted. Single
 * runner at a time; fire-and-forget from paint code.
 */
export async function ensurePoolSize(n) {
  if (filling) return getVideoCount();
  filling = true;
  try {
    while (morePages && getVideoCount() < n) {
      await requestMoreVideos(Math.min(MAX_PAGE_SIZE, n - getVideoCount()));
    }
  } catch (e) {} finally {
    filling = false;
  }
  return getVideoCount();
}

/**
 * Returns the current/next video sequentially from the ordered pool, and
 * records a real view for it in Firestore via window.trackVideoView
 * (defined in tracking.js).
 */
export function getNextVideo() {
  if (fetchedVideos.length === 0) {
    console.warn("No active videos available.");
    return null;
  }

  const videoData = fetchedVideos[currentVideoIndex];
  currentVideo = videoData;

  // Advance index and save state to prevent repeats on page switches.
  // On full-cycle wrap, reshuffle silently so the next round plays in a
  // different random order instead of repeating the same sequence.
  const wrapped = currentVideoIndex >= fetchedVideos.length - 1;
  currentVideoIndex = (currentVideoIndex + 1) % fetchedVideos.length;
  if (wrapped && fetchedVideos.length > 1) {
    try {
      reshuffleLivePool();
    } catch (e) {}
  }
  localStorage.setItem("currentVideoIndex", currentVideoIndex.toString());

  // Trigger background preloading for the upcoming video
  preloadNextVideo();

  // Record the view for the video that's actually about to be shown
  if (videoData && videoData.id && typeof window.trackVideoView === "function") {
    window.trackVideoView(videoData.id);
  }

  return videoData;
}

export function getCurrentVideo() {
  return currentVideo;
}

/** Random access into the ordered pool (swipe feed) without advancing
 * the rotation pointer. Wraps modulo. Records a view like getNextVideo. */
export function getVideoAt(i) {
  if (!fetchedVideos.length) return null;
  const idx = ((i % fetchedVideos.length) + fetchedVideos.length) % fetchedVideos.length;
  const videoData = fetchedVideos[idx];
  if (!videoData) return null;
  currentVideo = videoData;
  try {
    localStorage.setItem("currentVideoIndex", String(idx));
  } catch (e) {}
  if (videoData && videoData.id && typeof window.trackVideoView === "function") {
    window.trackVideoView(videoData.id);
  }
  return videoData;
}

/** Pool size for the swipe window (0 until Firestore loads). */
export function getVideoCount() {
  return fetchedVideos.length;
}

/** Full ordered pool (powers Discover grid + search). */
export function getAllVideos() {
  return [...fetchedVideos];
}

/** Jump the rotation to a specific pool index (Discover picks). */
export function jumpToIndex(i) {
  if (!fetchedVideos.length) return;
  currentVideoIndex = ((i % fetchedVideos.length) + fetchedVideos.length) % fetchedVideos.length;
  localStorage.setItem("currentVideoIndex", currentVideoIndex.toString());
}

/**
 * Persist a like/unlike on the video document (public write allowed by
 * Firestore rules on videos/*). Returns silently on failure.
 */
export async function persistLike(videoId, like) {
  if (!videoId) return;
  try {
    await updateDoc(doc(db, "videos", videoId), {
      likes: increment(like ? 1 : -1),
    });
    const item = fetchedVideos.find((v) => v.id === videoId);
    if (item) item.likes = Math.max(0, (item.likes || 0) + (like ? 1 : -1));
  } catch (err) {
    console.warn("Like persist failed:", err);
  }
}

function detectDeviceType() {
  const ua = (navigator.userAgent || "").toLowerCase();
  if (/tablet|ipad|playbook|silk/.test(ua)) return "Tablet";
  if (/mobile|iphone|ipod|android|blackberry|windows phone/.test(ua)) return "Mobile";
  return "Desktop";
}

/* ---- User telemetry for the Admin Users tab (merge-safe, country-only) ----
 * PWA detection reuses the standalone display-mode check from pwa-banner.js.
 * Referral is normalized to Direct/Google/Organic/Social from utm_source +
 * document.referrer. Country is resolved client-side (timezone + optional
 * ip-api fallback) — raw IPs are never stored. */

export function detectAppType() {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return "PWA";
  } catch (e) {}
  if (window.navigator && window.navigator.standalone === true) return "PWA";
  return "Browser";
}

export function classifyReferral() {
  try {
    const params = new URLSearchParams(location.search || "");
    const utm_source = (params.get("utm_source") || "").slice(0, 80);
    const utm_medium = (params.get("utm_medium") || "").slice(0, 80);
    const utm_campaign = (params.get("utm_campaign") || "").slice(0, 80);
    const utm = utm_source.toLowerCase();
    const ref = document.referrer || "";
    let host = "";
    try { host = ref ? new URL(ref).hostname.toLowerCase() : ""; } catch (e) { host = ref.toLowerCase(); }
    const raw = ref || (utm_source ? utm_source : "Direct");
    const base = { host: host.slice(0, 120), utm_source, utm_medium, utm_campaign };
    if (host && host === location.hostname) return { group: "Direct", raw: "Direct", ...base };
    if (utm.includes("google") || host.includes("google")) return { group: "Google", raw: (raw || "google").slice(0, 120), ...base };
    if (!ref && !utm_source) return { group: "Direct", raw: "Direct", ...base };
    if (/facebook|instagram|tiktok|twitter|x\.com|youtube|snap|whatsapp|telegram/.test(utm + " " + host)) {
      return { group: "Social", raw: raw.slice(0, 120) || "Social", ...base };
    }
    if (host && host !== location.hostname) return { group: "Organic", raw: host.slice(0, 120), ...base };
    if (utm_source) return { group: "Organic", raw: utm_source.slice(0, 120), ...base };
    return { group: "Direct", raw: (raw || "Direct").slice(0, 120), ...base };
  } catch (e) {
    return { group: "Direct", raw: "Direct", host: "", utm_source: "", utm_medium: "", utm_campaign: "" };
  }
}

let _cachedCountry = null;

const TZ_COUNTRY_HINTS = [
  ["accra", "GH"], ["lagos", "NG"], ["nairobi", "KE"], ["johannesburg", "ZA"],
  ["cairo", "EG"], ["abidjan", "CI"], ["dakar", "SN"], ["casablanca", "MA"],
  ["london", "GB"], ["paris", "FR"], ["berlin", "DE"], ["amsterdam", "NL"],
  ["new_york", "US"], ["chicago", "US"], ["los_angeles", "US"], ["toronto", "CA"],
  ["dubai", "AE"], ["tokyo", "JP"], ["singapore", "SG"], ["mumbai", "IN"],
];

export async function resolveCountry() {
  if (_cachedCountry) return _cachedCountry;
  // IP-based providers raced in PARALLEL (first valid code wins, 3 s cap).
  // Edge is same-origin/unblockable but only exists on Cloudflare Pages
  // (currently 404 in prod — kept first so it wins automatically if the
  // host ever serves functions). ipapi.co + ipwho.is cover adblock users
  // that block ip-api.com. Country code only, nothing identifying.
  // Local/dev hosts fail all four silently and fall through to hints below.
  const validCode = (s) => typeof s === "string" && /^[A-Za-z]{2}$/.test(s) && s.toUpperCase() !== "XX" ? s.toUpperCase() : null;
  const racers = [
    (async () => {
      const res = await fetch("/api/country", { cache: "no-store" });
      if (!res.ok) throw 0;
      const j = await res.json();
      const code = validCode(j && j.code);
      if (!code) throw 0;
      return { code, source: "edge" };
    })(),
    (async () => {
      const res = await fetch("https://ipapi.co/country/");
      if (!res.ok) throw 0;
      const code = validCode((await res.text()).trim());
      if (!code) throw 0;
      return { code, source: "ip-api" };
    })(),
    (async () => {
      const res = await fetch("https://ipwho.is/?fields=country_code");
      if (!res.ok) throw 0;
      const j = await res.json();
      const code = validCode(j && (j.country_code || j.countryCode));
      if (!code) throw 0;
      return { code, source: "ip-api" };
    })(),
    (async () => {
      const res = await fetch("https://ip-api.com/json/?fields=countryCode");
      if (!res.ok) throw 0;
      const j = await res.json();
      const code = validCode(j && j.countryCode);
      if (!code) throw 0;
      return { code, source: "ip-api" };
    })(),
  ];
  try {
    const winner = await new Promise((resolve, reject) => {
      let pending = racers.length;
      let done = false;
      const to = setTimeout(() => {
        if (!done) { done = true; reject(0); }
      }, 3000);
      racers.forEach((p) => {
        Promise.resolve(p).then(
          (v) => {
            if (!done) {
              done = true;
              clearTimeout(to);
              resolve(v);
            }
          },
          () => {
            pending -= 1;
            if (pending <= 0 && !done) {
              done = true;
              clearTimeout(to);
              reject(0);
            }
          }
        );
      });
    });
    _cachedCountry = winner;
    return _cachedCountry;
  } catch (e) {}
  // Offline hints (free, instant): timezone city map, then locale region.
  try {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "").toLowerCase();
    if (tz) {
      for (const [frag, code] of TZ_COUNTRY_HINTS) {
        if (tz.includes(frag)) { _cachedCountry = { code, source: "client-locale" }; return _cachedCountry; }
      }
      // Bare "africa/<city>" without a mapped city still hints at the continent —
      // keep GH default but flag low confidence via client-locale source.
      if (tz.startsWith("africa/")) { _cachedCountry = { code: "GH", source: "client-locale" }; return _cachedCountry; }
    }
  } catch (e) {}
  try {
    const lang = (navigator.language || "").toUpperCase();
    const m = lang.match(/-([A-Z]{2})$/);
    if (m && m[1] && m[1] !== "US" && /^[A-Z]{2}$/.test(m[1])) {
      _cachedCountry = { code: m[1], source: "client-locale" };
      return _cachedCountry;
    }
  } catch (e) {}
  _cachedCountry = { code: "GH", source: "client-locale" };
  return _cachedCountry;
}

export function authProviderLabel(user) {
  return "guest";
}

/** Upsert merge-safe user doc: presence + device/platform/auth/geo.
 * NOTE: firstSeen is intentionally NOT written here — merge:true would
 * overwrite it on every 25 s heartbeat, destroying the original value the
 * Admin date-range filter depends on. First-seen defaults are applied
 * read-side (Admin subscribeToUsers falls back to `new Date()`). */
export async function upsertUserTelemetry(uid, extra) {
  if (!uid) return;
  try {
    const appType = detectAppType();
    const { group, raw, host, utm_source, utm_medium, utm_campaign } = classifyReferral();
    const geo = await resolveCountry();
    await setDoc(doc(db, "users", uid), {
      userId: uid,
      deviceType: detectDeviceType(),
      appType: appType,
      isPWA: appType === "PWA",
      trafficSource: raw,
      referralGroup: group,
      referrerHost: (host || "").slice(0, 120),
      utmSource: utm_source || "",
      utmMedium: utm_medium || "",
      utmCampaign: utm_campaign || "",
      landingPage: (location.pathname + location.search).slice(0, 200),
      country: geo.code,
      countrySource: geo.source,
      status: "Online",
      lastActive: serverTimestamp(),
      currentPage: location.pathname + location.search,
      authProvider: (extra && extra.authProvider) || "guest",
    }, { merge: true });
  } catch (err) {
    console.warn("User telemetry upsert failed:", err);
  }
}

/** Increment engagement counters without overwriting profile fields. */
export async function incrementUserCounters(uid, counters) {
  if (!uid || !counters) return;
  try {
    const payload = { lastActive: serverTimestamp(), status: "Online" };
    if (counters.watchSeconds) payload.totalDurationSeconds = increment(counters.watchSeconds);
    if (counters.completed) payload.videosWatched = increment(1);
    if (counters.saveDelta) payload.totalSaves = increment(counters.saveDelta);
    if (counters.downloadDelta) payload.totalDownloads = increment(counters.downloadDelta);
    await setDoc(doc(db, "users", uid), payload, { merge: true });
  } catch (err) {
    console.warn("User counter increment failed:", err);
  }
}

/** Mark user offline on tab hide (best-effort; heartbeat is source of truth). */
export async function markUserOffline(uid) {
  if (!uid) return;
  try {
    await setDoc(doc(db, "users", uid), { status: "Offline", lastActive: serverTimestamp() }, { merge: true });
  } catch (err) {}
}

/* Guest-only: comments removed. Stubs kept for legacy imports. */
export async function getComments(videoId) {
  return [];
}

export async function postComment(videoId, name, text) {
  return null;
}

/**
 * Recovers playback automatically if network dropouts or stream stalls occur.
 */
export function initializePlayerRecovery(videoElementId = "main-video") {
  const video = document.getElementById(videoElementId);
  if (!video) return;

  video.addEventListener("error", () => {
    console.warn("Video playback encountered a network/stream error. Recovering...");
    const fallback = getNextVideo();
    if (fallback && fallback.url) {
      video.src = fallback.url;
      video.load();
      video.play().catch((e) => console.warn("Auto-recovery play error:", e));
    }
  });

  video.addEventListener("stalled", () => {
    console.warn("Stream stalled. Attempting playback resume...");
    video.load();
    video.play().catch(() => {});
  });
}

// Make functions globally available
window.getNextVideo = getNextVideo;
window.loadVideosFromFirestore = loadVideosFromFirestore;
window.initializePlayerRecovery = initializePlayerRecovery;
