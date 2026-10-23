import { getAllVideos, requestMoreVideos, hasMoreVideos } from "../../vid.js";
import { activateVideo, playVideoAt } from "./player.js";

/* js/features/swipe.js — no-reload swipe feed.
 * The player lives in the boot section and NEVER moves: the boot screen
 * sticks while transparent spacer sections scroll beneath it, and
 * activation only swaps the video source — playback behaves like a plain
 * inline <video>. Spacers only provide scroll distance + IO positions.
 * Views, store and sx:video-changed flow through player.js. */

let feedEl = null;
let playerRegion = null;
let overlay = null;
let mainVideo = null;
let observer = null;
let booted = false;
let activePoolIndex = 0;
// Last pool size seen: growth (paged appends) extends the window in place,
// only shrink/first-boot rebuilds (rebuilds replay + jump scroll).
let lastPoolSize = 0;
// poolIdx -> section element for the current window
let windowMap = new Map();

function pool() {
  return getAllVideos();
}

function wrapIndex(i, n) {
  return ((i % n) + n) % n;
}

/* Transparent spacer: no media inside (the static player shows the video,
 * exactly like a plain inline <video>). pointer-events:none via CSS lets
 * taps fall through to the player; IO positions come from data-sec. */
function sectionEl(poolIdx) {
  const sec = document.createElement("div");
  sec.className = "snap-item relative w-full sx-spacer";
  sec.setAttribute("data-sec", String(poolIdx));
  sec.setAttribute("role", "article");
  sec.setAttribute("aria-label", "Video " + (poolIdx + 1));
  return sec;
}

/* Append-only spacers for every pool index (0 lives in the boot shell).
 * Empty divs are trivial: never dropped, only rebuilt on reseed. */
function ensureWindow(center) {
  const list = pool();
  const n = list.length;
  if (!n || !feedEl) return;
  for (let idx = 1; idx < n; idx++) {
    if (windowMap.has(idx)) continue;
    const el = sectionEl(idx);
    try {
      feedEl.appendChild(el);
    } catch (e) { continue; }
    windowMap.set(idx, el);
    try { observer.observe(el); } catch (e) {}
  }
}

/* One-shot diagnostic for black-screen reports: paste window.sxDiag()
 * output from the console. Shows pool, boot, mount state and player state. */
window.sxDiag = function () {
  try {
    const v = mainVideo;
    return {
      pool: pool().length,
      booted: !!booted,
      activeIdx: activePoolIndex,
      playerInDoc: !!(playerRegion && document.contains(playerRegion)),
      playerSection: 'static',
      videoW: v ? v.videoWidth : -1,
      videoH: v ? v.videoHeight : -1,
      clientW: v ? v.clientWidth : -1,
      clientH: v ? v.clientHeight : -1,
      paused: v ? v.paused : null,
      time: v ? +v.currentTime.toFixed(2) : null,
      readyState: v ? v.readyState : null,
      netState: v ? v.networkState : null,
      src: v && v.currentSrc ? v.currentSrc.slice(0, 80) : null,
      sections: windowMap ? windowMap.size : -1,
      viewSec: (() => {
        try {
          let best = null, bd = Infinity;
          windowMap.forEach((el, idx) => {
            const d = Math.abs((el.offsetTop - feedEl.offsetTop) - feedEl.scrollTop);
            if (d < bd) { bd = d; best = idx; }
          });
          return best;
        } catch (e) { return null; }
      })(),
    };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
};

function setActive(poolIdx) {
  const list = pool();
  if (!list.length) return;
  const idx = wrapIndex(poolIdx, list.length);
  // One-at-a-time: on the last loaded video with more behind, fetch
  // exactly 1 next. Steady state is 1 playing + 1 fetched ahead.
  try {
    if (hasMoreVideos() && idx >= list.length - 1) void requestMoreVideos(1);
  } catch (e) {}
  const sec = windowMap.get(idx);
  const data = list[idx];
  if (!sec || !data) {
    // Target spacer not mounted (stale IO event) — make sure it exists.
    ensureWindow(idx);
    return;
  }
  // Already active — just top up spacers.
  if (idx === activePoolIndex) {
    ensureWindow(idx);
    return;
  }
  activePoolIndex = idx;
  try {
    if (mainVideo) playVideoAt(mainVideo, activePoolIndex);
  } catch (e) {}
  activateVideo(data);
  ensureWindow(activePoolIndex);
}

function onIntersect(entries) {
  let best = null;
  let bestRatio = 0.6;
  entries.forEach((en) => {
    if (en.isIntersecting && en.intersectionRatio >= bestRatio) {
      bestRatio = en.intersectionRatio;
      best = en.target;
    }
  });
  if (!best) return;
  const idx = parseInt(best.getAttribute("data-sec") || "-1", 10);
  if (isNaN(idx) || idx < 0) return;
  setActive(idx);
}

function scrollToActive(instant) {
  const first = windowMap.get(activePoolIndex);
  if (!first || !feedEl) return;
  // Verified scroll: layout may still be settling at boot (fonts, images,
  // late CSS), so a single blind scrollTo can strand the viewport on an
  // empty section while audio plays elsewhere. Recompute + retry until the
  // viewport actually matches the active section.
  let tries = 0;
  const attempt = () => {
    const sec = windowMap.get(activePoolIndex);
    if (!sec || !feedEl) return;
    let target = 0;
    try {
      target = sec.offsetTop - feedEl.offsetTop;
    } catch (e) { return; }
    try {
      feedEl.scrollTo({ top: target, behavior: instant ? "auto" : "smooth" });
    } catch (e) {
      try { feedEl.scrollTop = target; } catch (e2) { return; }
    }
    tries++;
    if (tries < 4) {
      let off = Infinity;
      try { off = Math.abs(feedEl.scrollTop - target); } catch (e) {}
      if (off > 4) setTimeout(attempt, 150);
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(attempt));
}

function startIndex() {
  const list = pool();
  if (!list.length) return 0;
  // Guest feed shuffles every visit: grid picks jump to the video,
  // otherwise always start at the head (no resume).
  try {
    const pick = sessionStorage.getItem("shortxx_pick");
    if (pick) {
      const pi = list.findIndex((v) => v.id === pick);
      try { sessionStorage.removeItem("shortxx_pick"); } catch (e) {}
      if (pi >= 0) return pi;
    }
  } catch (e) {}
  return 0;
}

function boot() {
  if (booted) return;
  const list = pool();
  if (!list.length) return;
  booted = true;
  window.sxSwipeBooted = true;
  // The boot shell (static player home) stays forever; register it as
  // section 0 and build spacers behind it.
  try {
    const shell = feedEl && feedEl.querySelector("[data-boot]");
    if (shell) {
      shell.setAttribute("data-sec", "0");
      if (!windowMap.has(0)) {
        windowMap.set(0, shell);
        try { observer.observe(shell); } catch (e) {}
      }
    }
  } catch (e) {}
  activePoolIndex = startIndex();
  try {
    localStorage.setItem("currentVideoIndex", String(activePoolIndex));
  } catch (e) {}
  ensureWindow(activePoolIndex);
  scrollToActive(true);
  // Activate synchronously so first paint has video + rail even if the
  // observer hasn't fired yet; later IO events no-op via the setActive guard.
  setActive(activePoolIndex);
  lastPoolSize = pool().length;
}

/* Feed-mode switch without reload: rebuild pool window around the same
 * video when it survives, else restart at 0. Called AFTER
 * loadVideosFromFirestore() resolves (see feed.js). */
window.sxReseedFeed = function () {
  const list = pool();
  if (!list.length || !feedEl) return;
  try {
    // Keep position when possible: match by video id.
    const prevId = window._sxLastVideoId || null;
    let idx = 0;
    if (prevId) {
      const pi = list.findIndex((v) => v.id === prevId);
      if (pi >= 0) idx = pi;
    }
    activePoolIndex = idx;
    try { localStorage.setItem("currentVideoIndex", String(idx)); } catch (e) {}
    // Rebuild spacers (boot shell at 0 stays — player home is permanent).
    windowMap.forEach((el, k) => {
      if (k === 0) return;
      try { observer.unobserve(el); } catch (e) {}
      try { el.remove(); } catch (e) {}
      windowMap.delete(k);
    });
    try { feedEl.scrollTop = 0; } catch (e) {}
    ensureWindow(activePoolIndex);
    scrollToActive(true);
    setActive(activePoolIndex);
    lastPoolSize = pool().length;
  } catch (e) {}
};

window.sxSwipeTo = function (i) {
  const n = pool().length;
  if (!n) return;
  const idx = wrapIndex(i, n);
  // Make sure the target exists, then smooth-scroll; IO settles activation.
  ensureWindow(idx);
  const sec = windowMap.get(idx);
  if (sec && feedEl) {
    try { feedEl.scrollTo({ top: sec.offsetTop - feedEl.offsetTop, behavior: "smooth" }); } catch (e) {}
  }
};

export async function init() {
  feedEl = document.querySelector(".snap-feed");
  playerRegion = document.getElementById("player-region");
  overlay = document.getElementById("sx-overlay");
  mainVideo = document.getElementById("main-video");
  if (!feedEl || !playerRegion || !mainVideo) return;
  // Track current id for reseed continuity.
  window.addEventListener("sx:video-changed", () => {
    try {
      const list = pool();
      const v = list[activePoolIndex];
      if (v && v.id) window._sxLastVideoId = v.id;
    } catch (e) {}
  });
  observer = new IntersectionObserver(onIntersect, { root: feedEl, threshold: [0.6] });
  boot();
  window.addEventListener("sx:videos-ready", (ev) => {
    try {
      const n = pool().length;
      const reset = !!(ev && ev.detail && ev.detail.reset);
      if (reset || !booted || n < lastPoolSize) {
        // First boot or pool reset (feed switch): full rebuild, keeping
        // the boot shell (player home) at 0.
        booted = false;
        window.sxSwipeBooted = false;
        windowMap.forEach((el, k) => {
          if (k === 0) return;
          try { observer.unobserve(el); } catch (e) {}
          try { el.remove(); } catch (e) {}
          windowMap.delete(k);
        });
        boot();
      } else if (n > lastPoolSize) {
        // Paged append: extend the window in place, no replay/scroll jump.
        lastPoolSize = n;
        ensureWindow(activePoolIndex);
      }
    } catch (e) {}
  });
}
