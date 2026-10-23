import { ensurePoolSize, formatCount, getAllVideos, loadVideosFromFirestore } from "../../vid.js";
import { esc } from "../lib/dom.js";
import { thumbHTML, hydrateThumbVideos, registerVideos } from "../lib/thumb.js";

/* js/pages/trending-page.js — standalone /trending/ folder page.
 * Mirrors NudiTok /trending ranking (engagement-sorted grid). */

let metric = "trending";
let windowKey = "all";
const WINDOWS = { today: 24 * 3600 * 1000, week: 7 * 24 * 3600 * 1000, all: 0 };

function value(v) {
  if (metric === "liked") return v.likes || 0;
  return v.views || 0;
}

document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.querySelector("[data-grid]");
  if (!grid) return;

  function paint() {
    try { registerVideos(getAllVideos()); } catch (e) {}
    try { void ensurePoolSize(48); } catch (e) {}
    document.querySelectorAll("[data-metric]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-metric") === metric));
    document.querySelectorAll("[data-window]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-window") === windowKey));
    let pool = [...getAllVideos()];
    const ms = WINDOWS[windowKey] || 0;
    if (ms > 0) { const c = Date.now() - ms; pool = pool.filter((v) => (v.createdAtMillis || 0) >= c); }
    pool.sort((a, b) => value(b) - value(a));
    grid.innerHTML = "";
    if (!pool.length) { grid.innerHTML = '<div class="sx-trending-empty">No videos yet — check All Time.</div>'; return; }
    pool.slice(0, 60).forEach((v) => {
      const cell = document.createElement("button");
      cell.className = "sx-rank";
      cell.setAttribute("aria-label", "Play video by @" + (v.creator || "Favmoney"));
      cell.innerHTML = thumbHTML(v, "") +
        '<span class="sx-rank-cap"><div>' + esc(formatCount(v.views)) + "</div><div>" + esc(formatCount(v.likes)) + "</div></span>";
      cell.addEventListener("click", () => {
        try { sessionStorage.setItem("shortxx_pick", v.id); } catch (e) {}
        location.href = "../index.html";
      });
      grid.appendChild(cell);
    });
    try { hydrateThumbVideos(grid); } catch (e) {}
  }

  document.querySelectorAll("[data-metric]").forEach((b) => b.addEventListener("click", () => { metric = b.getAttribute("data-metric"); paint(); }));
  document.querySelectorAll("[data-window]").forEach((b) => b.addEventListener("click", () => { windowKey = b.getAttribute("data-window"); paint(); }));
  paint();
  try { await loadVideosFromFirestore(); } catch (e) {}
  paint();
});
