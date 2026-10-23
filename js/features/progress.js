/* js/features/progress.js — video progress bar seek + fill.
 * Ported from refs/shortieshub_app_fix (range input over fill, hover
 * thumb) and merged with the existing pointer-drag scrub: the invisible
 * range input gives keyboard/screen-reader seeking, pointer events give
 * touch/mouse drag. Grows while playing via .sx-playing. */

export async function init() {
  const video = document.getElementById("main-video");
  const wrap = document.getElementById("ntok-progress");
  const fill = document.getElementById("ntok-progress-fill");
  const seek = document.getElementById("ntok-seek");
  if (!video || !wrap || !fill) return;

  const setFill = () => {
    if (!video.duration) return;
    const ratio = video.currentTime / video.duration;
    fill.style.transform = "scaleX(" + ratio + ")";
    wrap.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    if (seek && document.activeElement !== seek) {
      try { seek.value = String(ratio * 100); } catch (e) {}
    }
  };

  const setPlaying = () => {
    try { wrap.classList.toggle("sx-playing", !video.paused); } catch (e) {}
  };

  video.addEventListener("timeupdate", setFill);
  video.addEventListener("loadedmetadata", setFill);
  video.addEventListener("play", setPlaying);
  video.addEventListener("pause", setPlaying);
  setPlaying();

  const seekTo = (ratio) => {
    const r = Math.min(Math.max(ratio, 0), 1);
    if (video.duration) {
      video.currentTime = r * video.duration;
      setFill();
    }
  };

  // Range input: keyboard + screen-reader + mouse scrubbing.
  if (seek) {
    seek.addEventListener("input", () => {
      const max = parseFloat(seek.max) || 100;
      seekTo((parseFloat(seek.value) || 0) / max);
    });
  }

  // Pointer drag anywhere on the strip (touch-first, like before).
  const point = (e) => {
    const rect = wrap.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return x / rect.width;
  };

  let seeking = false;
  wrap.addEventListener("pointerdown", (e) => {
    // Let the range input handle its own events natively.
    if (e.target === seek) return;
    seeking = true;
    try { wrap.classList.add("sx-seeking"); } catch (err) {}
    try {
      wrap.setPointerCapture(e.pointerId);
    } catch (err) {}
    seekTo(point(e));
  });
  wrap.addEventListener("pointermove", (e) => {
    if (seeking) seekTo(point(e));
  });
  const endSeek = () => {
    seeking = false;
    try { wrap.classList.remove("sx-seeking"); } catch (e) {}
  };
  wrap.addEventListener("pointerup", endSeek);
  wrap.addEventListener("pointercancel", endSeek);
}
