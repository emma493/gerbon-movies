import { ensurePoolSize, formatCount, getAllVideos, loadVideosFromFirestore } from "../../vid.js";
import { readJson, writeJson } from "../store.js";
import { esc } from "../lib/dom.js";
import { thumbHTML, hydrateThumbVideos, registerVideos } from "../lib/thumb.js";

/* js/pages/discover-page.js — standalone /discover/ folder page.
 * Same data model as the feed overlay (js/features/discover.js) but as a
 * real indexable route like NudiTok /discover. Supports ?q= deep links. */

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
      if (!e) { e = { tag: clean, count: 0, poster: null }; map.set(key, e); }
      e.count++;
      if (!e.poster && v.posterUrl) e.poster = v.posterUrl;
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function countLabel(n) {
  if (n >= 1000) { const v = n / 1000; return (v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")) + "K videos"; }
  return n + (n === 1 ? " video" : " videos");
}

function getRecent() {
  const v = readJson(RECENT_KEY, []);
  return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
}
function pushRecent(term) {
  term = (term || "").trim().toLowerCase();
  if (!term) return;
  writeJson(RECENT_KEY, [term, ...getRecent().filter((t) => t !== term)].slice(0, 8));
}

function matchVideo(v, q) {
  const tags = (v.hashtags || []).map((t) => stripHash(t).toLowerCase());
  if (!q) return true;
  const needle = stripHash(q).toLowerCase();
  if (!needle) return true;
  if (tags.some((t) => t.includes(needle))) return true;
  if (q.startsWith("#")) return false;
  return [v.id, v.category, tags.join(" ")].filter(Boolean).join(" ").toLowerCase().includes(q);
}

function playVideo(id) {
  try { sessionStorage.setItem("shortxx_pick", id); } catch (e) {}
  location.href = "../index.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  const qEl = document.querySelector("[data-q]");
  const hEl = document.querySelector("[data-hsearch]");
  const recentEl = document.querySelector("[data-recent]");
  const sectionsEl = document.querySelector("[data-sections]");
  const resultsEl = document.querySelector("[data-results]");
  if (!qEl || !sectionsEl) return;
  try {
    const q0 = new URLSearchParams(location.search).get("q");
    if (q0) qEl.value = q0;
  } catch (e) {}

  function paintRecent() {
    const list = getRecent();
    if (!list.length) { recentEl.innerHTML = ""; return; }
    recentEl.innerHTML = '<div class="sx-d-recent-head"><span class="sx-d-recent-title">Recent searches</span>' +
      '<button class="sx-d-recent-clear" data-clear-all>Clear all</button></div>' +
      list.map((term) => '<div class="sx-d-recent-row"><button class="sx-d-recent-term" data-term="' + esc(term) + '">' + esc(term) + "</button></div>").join("");
    recentEl.querySelector("[data-clear-all]").addEventListener("click", () => { writeJson(RECENT_KEY, []); paint(); });
    recentEl.querySelectorAll("[data-term]").forEach((b) => b.addEventListener("click", () => { qEl.value = b.getAttribute("data-term"); paint(); }));
  }

  function card(t) {
    return '<button class="sx-d-card" data-tag="' + esc(t.tag) + '" aria-label="Browse #' + esc(t.tag) + '">' +
      (t.poster ? '<img src="' + esc(t.poster) + '" alt="" loading="lazy" decoding="async">' : '<div class="sx-d-card-fallback">#</div>') +
      '<span class="sx-d-card-meta"><span class="sx-d-card-name">#' + esc(t.tag) + '</span>' +
      '<span class="sx-d-card-count">' + esc(countLabel(t.count)) + "</span></span></button>";
  }
  function pill(t) {
    return '<button class="sx-d-pill" data-tag="' + esc(t.tag) + '"><span class="n">#' + esc(t.tag) + '</span><span class="c">' + esc(formatCount(t.count)) + "</span></button>";
  }

  function paintSections() {
    const tags = tagIndex(false);
    if (!tags.length) { sectionsEl.innerHTML = '<div class="sx-discover-empty">No hashtags yet.</div>'; return; }
    let week = tagIndex(true);
    if (!week.length) week = tags;
    sectionsEl.innerHTML =
      '<div><div class="sx-d-sec-head"><h2 class="sx-d-h2">Trending This Week</h2></div><div class="sx-d-grid">' + week.slice(0, 12).map(card).join("") + "</div></div>" +
      '<div><h2 class="sx-d-h2">Popular Tags</h2><div class="sx-d-grid">' + tags.slice(0, 12).map(card).join("") + "</div></div>" +
      '<div><h2 class="sx-d-h2">All Hashtags</h2><div class="sx-d-pills">' + tags.slice(0, ALL_PILL_LIMIT).map(pill).join("") + "</div></div>";
    sectionsEl.querySelectorAll("[data-tag]").forEach((b) => b.addEventListener("click", () => {
      qEl.value = "#" + stripHash(b.getAttribute("data-tag")).toLowerCase();
      try { pushRecent(qEl.value); } catch (e) {}
      paint();
    }));
  }

  function paintResults() {
    const q = (qEl.value || "").trim().toLowerCase();
    if (!q) { resultsEl.style.display = "none"; resultsEl.innerHTML = ""; sectionsEl.style.display = ""; return; }
    sectionsEl.style.display = "none";
    resultsEl.style.display = "";
    resultsEl.innerHTML = '<div class="sx-d-vidhead">Videos for &ldquo;' + esc(q) + '&rdquo;</div><div class="sx-trending-grid" data-vgrid></div>';
    const grid = resultsEl.querySelector("[data-vgrid]");
    // Cap initial render so a broad query can't queue hundreds of thumb
    // captures at once; "Show more" appends the next chunk on demand.
    const PAGE = 48;
    const matches = getAllVideos().filter((v) => matchVideo(v, q));
    let rendered = 0;
    const renderChunk = () => {
      matches.slice(rendered, rendered + PAGE).forEach((v) => {
        const cell = document.createElement("button");
        cell.className = "sx-rank";
        cell.setAttribute("aria-label", "Play video by @" + (v.creator || "Favmoney"));
        cell.innerHTML = thumbHTML(v, "") + '<span class="sx-rank-cap"><div>' + esc(formatCount(v.views)) + "</div><div>" + esc(formatCount(v.likes)) + "</div></span>";
        cell.addEventListener("click", () => playVideo(v.id));
        grid.appendChild(cell);
      });
      rendered = Math.min(matches.length, rendered + PAGE);
      const old = resultsEl.querySelector("[data-more]");
      if (old) old.remove();
      if (rendered < matches.length) {
        const more = document.createElement("button");
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
    if (!matches.length) grid.innerHTML = '<div class="sx-discover-empty">No videos match.</div>';
    try { hydrateThumbVideos(grid); } catch (e) {}
  }

  function paint() {
    try { registerVideos(getAllVideos()); } catch (e) {}
    try { void ensurePoolSize(48); } catch (e) {}
    paintRecent();
    const q = (qEl.value || "").trim();
    if (!q) { resultsEl.style.display = "none"; paintSections(); try { hydrateThumbVideos(sectionsEl); } catch (e) {} }
    else paintResults();
  }

  qEl.addEventListener("input", paint);
  qEl.closest("form").addEventListener("submit", (e) => { e.preventDefault(); try { pushRecent(qEl.value); } catch (err) {} paint(); });
  if (hEl) {
    hEl.closest("form").addEventListener("submit", (e) => { e.preventDefault(); qEl.value = hEl.value || ""; paint(); });
  }
  paint();
  try { await loadVideosFromFirestore(); } catch (e) {}
  paint();
});
