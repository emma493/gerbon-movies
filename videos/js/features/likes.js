import { formatCount, persistLike } from "../../vid.js";
import { store, writeJson } from "../store.js";

/* js/features/likes.js — guest like button + double-tap heart only.
 * Likes persist locally + globally via Firestore persistLike. */

export async function init(ctx) {
  const likeBtn = document.querySelector(".like-btn");
  const likeHeart = document.querySelector(".like-heart");
  const likeCountEl = document.querySelector(".like-count");
  const playerRegion = document.getElementById("player-region");
  const video = document.getElementById("main-video");
  if (!likeBtn) return;
  let lastTap = 0;

  const paintLike = () => {
    const liked = !!store.likedMap[store.videoId];
    likeBtn.setAttribute("aria-pressed", String(liked));
    likeBtn.setAttribute("aria-label", liked ? "Unlike" : "Like");
    if (likeHeart) {
      likeHeart.classList.toggle("text-white", !liked);
      likeHeart.classList.toggle("text-primary", liked);
    }
  };
  paintLike();
  window.addEventListener("sx:video-changed", paintLike);

  const toggleLike = () => {
    if (!store.videoId) return;
    const liked = !store.likedMap[store.videoId];
    if (liked) store.likedMap[store.videoId] = true;
    else delete store.likedMap[store.videoId];
    writeJson("shortxx_liked", store.likedMap);
    if (store.current) {
      store.current.likes = Math.max(0, (store.current.likes || 0) + (liked ? 1 : -1));
    }
    if (likeCountEl) likeCountEl.textContent = formatCount(store.current ? store.current.likes : 0);
    paintLike();
    if (likeHeart) {
      likeHeart.classList.remove("sx-pop");
      void likeHeart.offsetWidth;
      likeHeart.classList.add("sx-pop");
    }
    persistLike(store.videoId, liked);
  };

  // Center-screen tap feedback (play/pause flash). Ported from the previous
  // site's spawnFeedbackIcon (refs/shortieshub_app_fix/script.js); inline SVG
  // like the big heart so no icon-font dependency is needed.
  const flash = (kind) => {
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.className = "sx-tap-flash";
    const path =
      kind === "pause"
        ? '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>'
        : '<path d="M7 4.5a1 1 0 0 1 1.54-.84l11 7.5a1 1 0 0 1 0 1.68l-11 7.5A1 1 0 0 1 7 19.5z" fill="currentColor"/>';
    el.innerHTML =
      '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" style="filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5))">' +
      path +
      "</svg>";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
  };

  const showBigHeart = (x, y) => {
    const heart = document.createElement("div");
    heart.setAttribute("aria-hidden", "true");
    heart.className = "sx-big-heart";
    heart.innerHTML =
      '<svg width="96" height="96" viewBox="0 0 24 24" fill="#fe2c55" stroke="none" style="filter:drop-shadow(0 4px 12px rgba(0,0,0,0.5))"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
    heart.style.left = x + "px";
    heart.style.top = y + "px";
    document.body.appendChild(heart);
    requestAnimationFrame(() => heart.classList.add("sx-big-heart-show"));
    setTimeout(() => heart.classList.add("sx-big-heart-fade"), 450);
    setTimeout(() => heart.remove(), 900);
    if (!store.likedMap[store.videoId]) toggleLike();
  };

  likeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLike();
  });

  if (playerRegion && video) {
    playerRegion.addEventListener("click", (e) => {
      if (e.target.closest("button,a,[role=progressbar]")) return;
      const now = Date.now();
      const gap = now - lastTap;
      if (gap < 300 && gap > 0) {
        showBigHeart(e.clientX, e.clientY);
        lastTap = now;
        return;
      }
      lastTap = now;
      if (video.paused) {
        video.play().catch(() => {});
        flash("play");
      } else {
        video.pause();
        flash("pause");
      }
    });
  }

  if (ctx && ctx.onTap) ctx.onTap((x, y) => showBigHeart(x, y));
}
