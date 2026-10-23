import { ensurePoolSize, formatCount, getAllVideos } from "../../vid.js";
import { readJson, writeJson } from "../store.js";
import { esc } from "../lib/dom.js";
import { thumbHTML, hydrateThumbVideos, registerVideos } from "../lib/thumb.js";
import { attachMenuClone } from "../lib/side-menu.js";

/* js/features/discover.js — 1:1 NudiTok /discover (refs/discover page +
 * pasted reference). Same UI, nothing changed: desktop top header +
 * left side menu (Discover active), mobile back pill, H1, hashtag-first
 * subtitle, pill search, Recent searches, Trending-This-Week cards,
 * Popular Tags cards, All-Hashtags pills, Show-more button.
 * Card/pill tap filters to that tag's videos (tag-page anatomy);
 * video tap plays. Opened via bottom-nav Discover icon (.discover-link)
 * and top search buttons. Header/side chrome + result tiles reuse the
 * trending classes (identical UI). */

let sheet = null;
const RECENT_KEY = "shortxx_recent_searches";
const WEEK_MS = 7 * 24 * 3600 * 1000;
const ALL_PILL_LIMIT = 60;

/* Hashtags arrive raw from Firestore — some docs store "fyp", others "#fyp".
 * Normalize once (strip leading #s) so Discover never renders "##fyp" and
 * both spellings merge into a single tag entry. */
function stripHash(t) {
  return String(t || "").trim().replace(/^#+/, "");
}

function tagIndex(recentOnly) {
  const map = new Map();
  const cutoff = recentOnly ? Date.now() - WEEK_MS : 0;
  getAllVideos().forEach((v) => {
    if (recentOnly && (v.createdAtMillis || 0) < cutoff) return;
    (v.hashtags || []).forEach((t) => {
      const clean = stripHash(t);
      const key = clean.toLowerCase();
      if (!key) return;
      let e = map.get(key);
      if (!e) {
        e = { tag: clean, count: 0, poster: null, url: null };
        map.set(key, e);
      }
      e.count++;
      if (!e.poster && v.posterUrl) e.poster = v.posterUrl;
      if (!e.url && v.url) e.url = v.url;
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function countLabel(n) {
  if (n >= 1000) {
    const v = n / 1000;
    return (v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")) + "K videos";
  }
  return n + (n === 1 ? " video" : " videos");
}

function getRecent() {
  const v = readJson(RECENT_KEY, []);
  return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
}

function pushRecent(term) {
  term = (term || "").trim().toLowerCase();
  if (!term) return;
  const list = getRecent().filter((t) => t !== term);
  list.unshift(term);
  writeJson(RECENT_KEY, list.slice(0, 8));
}

export function openDiscover(filter) {
  if (!sheet) return;
  sheet._open(filter || "all");
}

const SVG = {
  logo: '<svg width="28" height="28" viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="currentColor"></circle><polygon points="38,25 38,75 78,50" fill="white"></polygon></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>',
  login: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 17 5-5-5-5"></path><path d="M15 12H3"></path><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"></path></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><path d="M16 3.128a4 4 0 0 1 0 7.744"></path><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><circle cx="9" cy="7" r="4"></circle></svg>',
  usercheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
  back: '<span class="sx-back-arrow" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></span><span>Back to feed</span>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
  trendUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7h6v6"></path><path d="m22 7-8.5 8.5-5-5L2 17"></path></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
};

export async function init(ctx) {
  const toast = (ctx && ctx.toast) || (() => {});
  const searchBtns = document.querySelectorAll(".search-btn");
  const discoverLinks = document.querySelectorAll(".discover-link");
  if (!searchBtns.length && !discoverLinks.length) return;

  // Delegated wiring FIRST (before any DOM building): a single bubble-phase
  // listener that survives nav re-renders and still fires even if a later
  // build step throws. NOTE: .discover-link is a real folder route
  // (./discover/, like NudiTok /discover) so it must NOT be intercepted —
  // only .search-btn opens the overlay in place.
  if (!window.__sxDiscoverDelegated) {
    window.__sxDiscoverDelegated = true;
    document.addEventListener("click", (e) => {
      const t = e.target && e.target.closest ? e.target.closest(".search-btn") : null;
      if (!t || !document.contains(t)) return;
      e.preventDefault();
      try {
        if (window.sxOpenDiscover) {
          window.sxOpenDiscover("all");
          if (t.classList.contains("search-btn")) {
            setTimeout(() => {
              const q = document.querySelector(".sx-d-q");
              if (q) q.focus();
            }, 50);
          }
        } else {
          console.warn("[shortxx] discover not ready yet");
        }
      } catch (err) {
        console.error("[shortxx] discover open failed:", err);
      }
    });
  }

  const wrap = document.createElement("div");
  wrap.className = "sx-discover";
  wrap.style.display = "none";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Discover");
  wrap.innerHTML =
    '<a href="#main-content" class="sr-only">Skip to content</a>' +
    '<header class="sx-t-head"><div style="display:flex;align-items:center;gap:4px;">' +
    '<button class="sx-t-menu" data-menu aria-label="Open menu" style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border:none;background:none;color:#fff;cursor:pointer;">' +
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></button>' +
    '<button class="sx-t-logo" data-home aria-label="Favmoney home">' + SVG.logo + 'Favmoney</button></div>' +
    '<form class="sx-t-search" role="search"><div class="sx-t-search-box">' + SVG.search +
    '<input placeholder="Search tags..." aria-label="Search tags" autocomplete="off" data-hsearch /></div></form></header>' +
    '<aside class="sx-t-side" aria-label="Site navigation">' +
    '<nav class="sx-t-nav">' +
    '<button class="sx-t-navlink" data-go="home">' + SVG.home + 'Home</button>' +
    '<button class="sx-t-navlink on" data-go="discover" aria-current="page">' + SVG.search + 'Discover</button>' +
    '<button class="sx-t-navlink" data-go="trending">' + SVG.flame + 'Trending</button>' +
    '<button class="sx-t-navlink" data-go="live">' + SVG.play + 'Live Cams</button>' +
    "</nav></aside>" +
    '<div class="sx-d-page"><button class="sx-d-back" data-close aria-label="Go back">' + SVG.back + "</button>" +
    '<button class="sx-d-menu" data-menu aria-label="Open menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></button>' +
    '<div class="sx-d-wrap"><main id="main-content">' +
    '<h1 class="sx-d-h1">Discover</h1>' +
    '<form class="sx-d-search" role="search">' + SVG.search +
    '<input data-q class="sx-d-q" placeholder="Search videos, tags..." aria-label="Search" type="text" autocomplete="off" value="" /></form>' +
    '<div class="sx-d-recent" data-recent></div>' +
    '<div class="sx-d-secs" data-sections></div>' +
    '<div data-results style="display:none"></div>' +
    "</main></div></div>";
  document.body.appendChild(wrap);
  sheet = wrap;

  let filter = "girls";
  let allExpanded = false;
  const qEl = wrap.querySelector("[data-q]");
  const recentEl = wrap.querySelector("[data-recent]");
  const sectionsEl = wrap.querySelector("[data-sections]");
  const resultsEl = wrap.querySelector("[data-results]");
  const form = wrap.querySelector(".sx-d-search");

  function setNavActive(on) {
    discoverLinks.forEach((a) => {
      a.classList.toggle("text-white", on);
      a.classList.toggle("text-white/50", !on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function hashCard(t) {
    // Real data: resolve one video carrying a usable thumbnail for this tag.
    const sample =
      getAllVideos().find(
        (v) => (v.hashtags || []).some((h) => stripHash(h).toLowerCase() === String(t.tag).toLowerCase()),
      ) || null;
    const thumb = sample
      ? thumbHTML(sample, "")
      : t.poster
        ? '<img src="' + esc(t.poster) + '" alt="" loading="lazy" decoding="async" />'
        : '<div class="sx-d-card-fallback">#</div>';
    return (
      '<button class="sx-d-card" data-tag="' + esc(t.tag) + '" aria-label="Browse #' + esc(t.tag) + '">' +
      thumb +
      '<span class="sx-d-card-meta"><span class="sx-d-card-name">#' + esc(t.tag) + "</span>" +
      '<span class="sx-d-card-count">' + esc(countLabel(t.count)) + "</span></span></button>"
    );
  }

  function hashPill(t) {
    return (
      '<button class="sx-d-pill" data-tag="' + esc(t.tag) + '" aria-label="Browse #' + esc(t.tag) + '">' +
      '<span class="n">#' + esc(t.tag) + '</span><span class="c">' + esc(formatCount(t.count)) + "</span></button>"
    );
  }

  function paintRecent() {
    const list = getRecent();
    if (!list.length) {
      recentEl.innerHTML = "";
      recentEl.style.display = "none";
      return;
    }
    recentEl.style.display = "";
    recentEl.innerHTML =
      '<div class="sx-d-recent-head"><span class="sx-d-recent-title">Recent searches</span>' +
      '<button class="sx-d-recent-clear" data-clear-all>Clear all</button></div>' +
      list
        .map(
          (term) =>
            '<div class="sx-d-recent-row">' + SVG.clock +
            '<button class="sx-d-recent-term" data-term="' + esc(term) + '">' + esc(term) + "</button>" +
            '<button class="sx-d-recent-x" data-del="' + esc(term) + '" aria-label="Remove search">' + SVG.x + "</button></div>",
        )
        .join("");
    recentEl.querySelector("[data-clear-all]").addEventListener("click", () => {
      writeJson(RECENT_KEY, []);
      safePaint();
    });
    recentEl.querySelectorAll("[data-term]").forEach((b) =>
      b.addEventListener("click", () => {
        qEl.value = b.getAttribute("data-term");
        safePaint();
      }),
    );
    recentEl.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        writeJson(
          RECENT_KEY,
          getRecent().filter((t) => t !== b.getAttribute("data-del")),
        );
        safePaint();
      }),
    );
  }

  function paintSections() {
    const tags = tagIndex(false);
    if (!tags.length) {
      sectionsEl.innerHTML = '<div class="sx-discover-empty">No hashtags yet.</div>';
      return;
    }
    let week = tagIndex(true);
    if (!week.length) week = tags;
    const trending = week.slice(0, 18);
    const popular = tags.slice(0, 18);
    const rest = allExpanded ? tags : tags.slice(0, ALL_PILL_LIMIT);
    sectionsEl.innerHTML =
      "<div><div class=\"sx-d-sec-head\">" + SVG.trendUp + '<h2 class="sx-d-h2">Trending This Week</h2></div>' +
      '<div class="sx-d-grid">' + trending.map(hashCard).join("") + "</div></div>" +
      '<div><h2 class="sx-d-h2">Popular Tags</h2>' +
      '<div class="sx-d-grid">' + popular.map(hashCard).join("") + "</div></div>" +
      '<div><h2 class="sx-d-h2">All Hashtags</h2>' +
      '<p class="sx-d-allsub">Every hashtag with published videos on Favmoney, most-used first.</p>' +
      '<div class="sx-d-pills">' + rest.map(hashPill).join("") + "</div>" +
      (tags.length > ALL_PILL_LIMIT
        ? '<button class="sx-d-more" data-more' + (allExpanded ? " disabled" : "") + ">" +
          (allExpanded ? "Showing all " + tags.length + " hashtags" : "Show more hashtags") +
          "</button>"
        : "") +
      "</div>";
    const more = sectionsEl.querySelector("[data-more]");
    if (more && !allExpanded) {
      more.addEventListener("click", () => {
        allExpanded = true;
        safePaint();
      });
    }
    sectionsEl.querySelectorAll("[data-tag]").forEach((b) =>
      b.addEventListener("click", () => {
        const t = "#" + stripHash(b.getAttribute("data-tag")).toLowerCase();
        qEl.value = t;
        try {
          pushRecent(t);
        } catch (err) {}
        safePaint();
      }),
    );
  }

  function matchVideo(v, q) {
    const tags = (v.hashtags || []).map((t) => stripHash(t).toLowerCase());
    if (!q) return true;
    const needle = stripHash(q).toLowerCase();
    if (!needle) return true;
    if (tags.some((t) => t.includes(needle))) return true;
    if (q.startsWith("#")) return false;
    const hay = [v.id, v.category, tags.join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function paintResults() {
    const q = (qEl.value || "").trim().toLowerCase();
    const active = q || filter !== "all";
    if (!active) {
      resultsEl.style.display = "none";
      resultsEl.innerHTML = "";
      sectionsEl.style.display = "";
      return;
    }
    sectionsEl.style.display = "none";
    resultsEl.style.display = "";
    const pool = getAllVideos();
    let head = "Videos";
    if (q) head = "Videos for \u201C" + q + "\u201D";
    else if (filter.startsWith("cat:")) head = filter.slice(4);
    resultsEl.innerHTML = '<div class="sx-d-vidhead">' + esc(head) + "</div>" + '<div class="sx-trending-grid" data-vgrid></div>';
    const grid = resultsEl.querySelector("[data-vgrid]");
    // Cap initial render so a broad query can't queue hundreds of thumb
    // captures at once; "Show more" appends the next chunk on demand.
    const PAGE = 48;
    const matches = pool.filter((v) => {
      // Same resolution as the feed filter (vid.js effectiveCategory):
      // creator-linked category wins, video doc category is the fallback.
      if (filter.startsWith("cat:")) {
        const c = v.creatorCategory || v.category;
        if (c !== filter.slice(4)) return false;
      }
      return matchVideo(v, q);
    });
    let rendered = 0;
    const renderChunk = () => {
      matches.slice(rendered, rendered + PAGE).forEach((v) => {
        const cell = document.createElement("button");
        cell.className = "sx-rank";
        cell.setAttribute("aria-label", "Play video by @" + (v.creator || "Favmoney"));
        cell.innerHTML =
          '<span class="sx-rank-shimmer" aria-hidden="true"></span>' +
          thumbHTML(v, "") +
          '<span class="sx-rank-hover" aria-hidden="true"></span>' +
          '<span class="sx-rank-cap"><div>' + SVG.play + esc(formatCount(v.views)) + "</div><div>" + SVG.heart + esc(formatCount(v.likes)) + "</div></span>";
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
          // Safety: never leave shimmer stuck on slow CDN.
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
        grid.appendChild(cell);
      });
      rendered = Math.min(matches.length, rendered + PAGE);
      let more = grid.nextElementSibling;
      if (more && more.hasAttribute && more.hasAttribute("data-more")) more.remove();
      if (rendered < matches.length) {
        more = document.createElement("button");
        more.setAttribute("data-more", "");
        more.className = "sx-d-more";
        more.textContent = "Show more (" + (matches.length - rendered) + " remaining)";
        more.addEventListener("click", () => {
          renderChunk();
          try { hydrateThumbVideos(grid); } catch (e) {}
        });
        grid.after(more);
      }
    };
    renderChunk();
    const shown = matches.length;
    if (!shown) {
      grid.innerHTML = '<div class="sx-discover-empty">No videos match.</div>';
    }
  }

  function paint() {
    paintRecent();
    paintResults();
    const q = (qEl.value || "").trim();
    if (!q) paintSections();
    else sectionsEl.innerHTML = "";
  }

  // Never let a paint failure leave the icon looking dead: log it and
  // keep the page usable with an inline error state.
  function safePaint() {
    try {
      try { registerVideos(getAllVideos()); } catch (e) {}
      try { void ensurePoolSize(48); } catch (e) {}
      paint();
      try {
        hydrateThumbVideos(sectionsEl);
      } catch (e) {}
      try {
        hydrateThumbVideos(resultsEl);
      } catch (e) {}
    } catch (err) {
      console.error("[shortxx] discover paint failed:", err);
      try {
        sectionsEl.style.display = "";
        sectionsEl.innerHTML = '<div class="sx-discover-empty">Discover failed to load. Close and retry.</div>';
      } catch (e) {}
    }
  }

  // Real-data pipeline: Firestore loads async AFTER UI wires up.
  // Repaint when videos arrive so grids fill with real data.
  window.addEventListener("sx:videos-ready", () => {
    try {
      if (wrap.style.display !== "none") safePaint();
    } catch (e) {}
  });

  qEl.addEventListener("input", safePaint);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      pushRecent(qEl.value);
    } catch (err) {}
    safePaint();
  });

  function close() {
    wrap.style.display = "none";
    document.body.style.overflow = "";
    try {
      setNavActive(false);
    } catch (e) {}
  }

  wrap.querySelector("[data-close]").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wrap.style.display !== "none") close();
  });

  // Side chrome wiring (same UI as reference).
  wrap.querySelector("[data-home]").addEventListener("click", () => {
    location.href = "./index.html";
  });
  const hsearch = wrap.querySelector("[data-hsearch]");
  hsearch.addEventListener("focus", () => {
    qEl.value = "";
    safePaint();
    setTimeout(() => qEl.focus(), 60);
    wrap.querySelector(".sx-d-page").scrollTop = 0;
    wrap.scrollTop = 0;
  });
  wrap.querySelector(".sx-t-search").addEventListener("submit", (e) => {
    e.preventDefault();
    qEl.value = hsearch.value || "";
    try {
      pushRecent(qEl.value);
    } catch (err) {}
    safePaint();
  });
  wrap.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      const go = b.getAttribute("data-go");
      if (go === "home") location.href = "./index.html";
      else if (go === "discover") {
        qEl.value = "";
        filter = "all";
        allExpanded = false;
        safePaint();
      } else if (go === "trending") {
        close();
        if (window.sxOpenTrending) window.sxOpenTrending("all");
      } else if (go === "live") {
        location.href =
          "https://araplhn.org/4/f4da12d7aaa67cd61f6a1196381da654";
      }
    }),
  );
  // FIXED side menu clone: IDENTICAL items to index.html drawer.
  // Top-left [data-menu] buttons open this first (works even if the
  // index drawer hasn't built yet), falling back to the global drawer.
  let cloneMenu = null;
  try {
    cloneMenu = attachMenuClone(wrap, { toast });
    // Clone drawer must sit above the discover overlay.
    cloneMenu.root.style.zIndex = "1200";
  } catch (e) { cloneMenu = null; }
  wrap.querySelectorAll("[data-menu]").forEach((menuBtn) => {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cloneMenu) { cloneMenu.open(); return; }
      if (window.sxOpenMenu) window.sxOpenMenu();
      else if (window.sxToggleMenu) window.sxToggleMenu();
    });
  });
  wrap.querySelectorAll("[data-dead]").forEach((el) =>
    el.addEventListener("click", (e) => e.preventDefault()),
  );

  wrap._open = (f) => {
    if (f) filter = f;
    qEl.value = "";
    allExpanded = false;
    // Show FIRST so a paint failure can never present as a dead icon.
    wrap.style.display = "block";
    wrap.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    safePaint();
    wrap.scrollTop = 0;
    try {
      setNavActive(true);
    } catch (e) {}
  };
  window.sxOpenDiscover = (f) => wrap._open(f || "all");
  window.sxCloseDiscover = close;
  // Nav wiring lives in the delegated document handler at the top of
  // init() — nothing per-element here (avoids double-toggle).
  void searchBtns;
  void discoverLinks;
}
