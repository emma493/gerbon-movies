import { getShareSource } from "./player.js";
import { countDownload } from "./telemetry.js";

/* js/features/share.js — Web Share API + download fallback only. */

export async function init() {
  const shareBtn = document.getElementById("share-btn");
  const video = document.getElementById("main-video");
  if (!shareBtn) return;

  shareBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const src = getShareSource(video);
    if (navigator.share) {
      try {
        await navigator.share({ url: src, title: document.title });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "video_" + Date.now() + ".mp4";
      document.body.appendChild(a);
      a.click();
      countDownload();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Share failed:", error);
      window.open(src, "_blank");
    }
  });
}
