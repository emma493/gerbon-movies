import { ensurePoolSize, formatCount, getAllVideos } from "../../vid.js";
import { esc } from "../lib/dom.js";
import { thumbHTML, hydrateThumbVideos, registerVideos } from "../lib/thumb.js";
import { attachMenuClone } from "../lib/side-menu.js";

/* js/features/trending.js — guest Trending overlay.
 * Metric pills (Trending/Most Liked/Most Viewed), window pills
 * (Today/This Week/This Month/All Time), 3-col 9/16 tiles with play +
 * heart counts. Tapping a tile plays it. No auth, no saved/commented. */

const METRICS = [
  ["trending", "Trending"],
  ["liked", "Most Liked"],
  ["viewed", "Most Viewed"],
];

const WINDOWS = [
  ["today", "Today", 24 * 3600 * 1000],
  ["week", "This Week", 7 * 24 * 3600 * 1000],
  ["month", "This Month", 30 * 24 * 3600 * 1000],
  ["all", "All Time", 0],
];

function metricValue(v, metric) {
  if (metric === "liked") return v.likes || 0;
  return v.views || 0;
}

let root = null;
let gridEl = null;
let metric = "trending";
let windowKey = "all";

function poolFor() {
  const all = getAllVideos();
  const def = WINDOWS.find((t) => t[0] === windowKey) || WINDOWS[3];
  let pool = all;
  if (def[2] > 0) {
    const cutoff = Date.now() - def[2];
    pool = all.filter((v) => (v.createdAtMillis || 0) >= cutoff);
  }
  const m = metric;
  return [...pool].sort((a, b) => metricValue(b, m) - metricValue(a, m));
}

function paintPills() {
  root.querySelectorAll("[data-metric]").forEach((b) => {
    b.classList.toggle("on", b.getAttribute("data-metric") === metric);
  });
  root.querySelectorAll("[data-window]").forEach((b) => {
    b.classList.toggle("on", b.getAttribute("data-window") === windowKey);
  });
}

const PLAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path></svg>';
const HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path></svg>';

function paintGrid() {
  const pool = poolFor();
  gridEl.innerHTML = "";
  if (!pool.length) {
    const wlabel = (WINDOWS.find((t) => t[0] === windowKey) || WINDOWS[3])[1];
    gridEl.innerHTML =
      '<div class="sx-trending-empty">' +
      (windowKey === "all" ? "No videos yet." : "No videos added (" + esc(wlabel) + ") — check All Time.") +
      "</div>";
    return;
  }
  pool.slice(0, 60).forEach((v) => {
    const cell = document.createElement("button");
    cell.className = "sx-rank";
    cell.setAttribute("aria-label", "Play video by @" + (v.creator || "Favmoney"));
    cell.innerHTML =
      '<span class="sx-rank-shimmer" aria-hidden="true"></span>' +
      thumbHTML(v, "") +
      '<span class="sx-rank-hover" aria-hidden="true"></span>' +
      '<span class="sx-rank-cap"><div>' + PLAY + esc(formatCount(v.views)) + "</div><div>" + HEART + esc(formatCount(v.likes)) + "</div></span>";
    const img = cell.querySelector("img,video");
    if (img) {
      const clear = () => {
        const s = cell.querySelector(".sx-rank-shimmer");
        if (s) s.remove();
      };
      if (img.tagName === "VIDEO") {
        try {
          img.muted = true;
          img.load();
        } catch (e) {}
        img.addEventListener("loadeddata", clear);
        img.addEventListener("error", clear);
        setTimeout(clear, 4000);
      } else if (img.complete) clear();
      else {
        img.addEventListener("load", clear);
        img.addEventListener("error", clear);
      }
    } else {
      const s = cell.querySelector(".sx-rank-shimmer");
      if (s) s.remove();
    }
    cell.addEventListener("click", () => {
      try {
        sessionStorage.setItem("shortxx_pick", v.id);
      } catch (e) {}
      location.reload();
    });
    gridEl.appendChild(cell);
  });
}

function safePaint() {
  try {
    try { registerVideos(getAllVideos()); } catch (e) {}
    try { void ensurePoolSize(48); } catch (e) {}
    paintPills();
    paintGrid();
    try { hydrateThumbVideos(gridEl); } catch (e) {}
  } catch (err) {
    console.error("[shortxx] trending paint failed:", err);
    try {
      gridEl.innerHTML = '<div class="sx-trending-empty">Trending failed to load. Close and retry.</div>';
    } catch (e) {}
  }
}

function open(which) {
  if (!root) return;
  if (which) {
    if (METRICS.some(([k]) => k === which)) metric = which;
    else if (WINDOWS.some(([k]) => k === which)) windowKey = which;
  }
  // Show FIRST so a paint failure can never present as a dead entry.
  root.style.display = "block";
  root.removeAttribute("hidden");
  document.body.style.overflow = "hidden";
  safePaint();
  root.scrollTop = 0;
}

function close() {
  if (!root || root.style.display === "none") return;
  root.style.display = "none";
  document.body.style.overflow = "";
}

const SVG = {
  logo: '<svg width="28" height="28" viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="currentColor"></circle><polygon points="38,25 38,75 78,50" fill="white"></polygon></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>',
  login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 17 5-5-5-5"></path><path d="M15 12H3"></path><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"></path></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><path d="M16 3.128a4 4 0 0 1 0 7.744"></path><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><circle cx="9" cy="7" r="4"></circle></svg>',
  usercheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
  bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
  back: '<span class="sx-back-arrow" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></span><span>Back to feed</span>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path></svg>',
};

export async function init(ctx) {
  const toast = (ctx && ctx.toast) || (() => {});
  if (root) return;

  root = document.createElement("div");
  root.className = "sx-trending";
  root.style.display = "none";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Trending");
  root.innerHTML =
    '<a href="#main-content" class="sr-only">Skip to content</a>' +
    '<header class="sx-t-head"><div style="display:flex;align-items:center;gap:4px;">' +
    '<button class="sx-t-menu" data-menu aria-label="Open menu" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:none;background:none;color:#fff;cursor:pointer;">' +
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></button>' +
    '<button class="sx-t-logo" data-home aria-label="Favmoney home">' + SVG.logo + 'Favmoney</button></div>' +
    '<form class="sx-t-search" role="search"><div class="sx-t-search-box">' + SVG.search +
    '<input placeholder="Search tags..." aria-label="Search tags" autocomplete="off" data-search /></div></form></header>' +
    '<aside class="sx-t-side" aria-label="Site navigation">' +
    '<nav class="sx-t-nav">' +
    '<button class="sx-t-navlink" data-go="home">' + SVG.home + 'Home</button>' +
    '<button class="sx-t-navlink" data-go="discover">' + SVG.search + 'Discover</button>' +
    '<button class="sx-t-navlink on" data-go="trending" aria-current="page">' + SVG.flame + 'Trending</button>' +
    '<button class="sx-t-navlink" data-go="live">' + SVG.play + 'Live Cams</button>' +
    "</nav></aside>" +
    '<div class="sx-t-page"><button class="sx-trending-back" data-close aria-label="Go back">' + SVG.back + "</button>" +
    '<button class="sx-t-menumob" data-menu aria-label="Open menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></button>' +
    '<div class="sx-t-wrap"><h1 class="sx-t-h1">Trending</h1>' +
    '<div class="sx-t-metrics">' +
    METRICS.map(([k, label]) => '<button class="sx-t-metric" data-metric="' + k + '">' + label + "</button>").join("") +
    "</div>" +
    '<div class="sx-t-windows">' +
    WINDOWS.map(([k, label]) => '<button class="sx-t-window" data-window="' + k + '">' + label + "</button>").join("") +
    "</div>" +
    '<div class="sx-trending-grid" data-grid></div><div class="sx-t-tail"></div></div></div>';
  document.body.appendChild(root);
  gridEl = root.querySelector("[data-grid]");

  root.querySelector("[data-close]").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.style.display !== "none") close();
  });

  root.querySelectorAll("[data-metric]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      metric = b.getAttribute("data-metric");
      safePaint();
    }),
  );
  root.querySelectorAll("[data-window]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      windowKey = b.getAttribute("data-window");
      safePaint();
    }),
  );

  const goSearch = () => {
    close();
    if (window.sxOpenDiscover) window.sxOpenDiscover("all");
    setTimeout(() => {
      const q = document.querySelector(".sx-d-q");
      if (q) q.focus();
    }, 60);
  };
  root.querySelector("[data-home]").addEventListener("click", () => {
    location.href = "./index.html";
  });
  const searchInput = root.querySelector("[data-search]");
  searchInput.addEventListener("focus", goSearch);
  root.querySelector(".sx-t-search").addEventListener("submit", (e) => {
    e.preventDefault();
    goSearch();
  });
  root.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      const go = b.getAttribute("data-go");
      if (go === "home") location.href = "./index.html";
      else if (go === "discover") goSearch();
      else if (go === "trending") safePaint();
      else if (go === "live") {
        location.href =
          "https://araplhn.org/4/f4da12d7aaa67cd61f6a1196381da654";
      }
    }),
  );
  // FIXED side menu clone: IDENTICAL items to index.html drawer.
  let cloneMenu = null;
  try {
    cloneMenu = attachMenuClone(root, { toast });
    cloneMenu.root.style.zIndex = "1200";
  } catch (e) { cloneMenu = null; }
  root.querySelectorAll("[data-menu]").forEach((menuBtn) => {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cloneMenu) { cloneMenu.open(); return; }
      if (window.sxOpenMenu) window.sxOpenMenu();
      else if (window.sxToggleMenu) window.sxToggleMenu();
    });
  });
  // Real-data pipeline: repaint when Firestore pool arrives.
  window.addEventListener("sx:videos-ready", () => {
    try {
      if (root.style.display !== "none") safePaint();
    } catch (e) {}
  });
  root.querySelectorAll("[data-dead]").forEach((el) =>
    el.addEventListener("click", (e) => e.preventDefault()),
  );

  window.sxOpenTrending = open;
  window.sxCloseTrending = close;
}
