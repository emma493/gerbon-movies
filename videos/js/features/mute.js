/* js/features/mute.js — mute / unmute only.
 * Choice persists in localStorage ("videoMuted") so every video (and every
 * visit) honors it; player.js also carries the choice across swipe source
 * swaps. Rail button (below Share, previous-version FA icons) shows
 * volume-up at full opacity when sounding, volume-mute dimmed when muted. */

function paintRailIcons(video) {
  const muted = video.muted;
  document.querySelectorAll(".mute-btn[data-rail-mute]").forEach((btn) => {
    const icon = btn.querySelector("i, svg");
    if (icon && icon.tagName === "I") {
      icon.className = muted
        ? "fas fa-volume-mute sx-rail-mute-icon"
        : "fas fa-volume-up sx-rail-mute-icon";
    }
    btn.style.opacity = muted ? "0.55" : "1";
    btn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    btn.setAttribute("aria-pressed", String(!muted));
  });
}

export async function init() {
  const video = document.getElementById("main-video");
  const muteBtns = document.querySelectorAll(".mute-btn");
  const hint = document.getElementById("unmute-hint");
  const dismiss = document.getElementById("unmute-dismiss");
  if (!video) return;

  const update = (muted) => {
    video.muted = muted;
    if (hint) hint.style.display = muted ? "" : "none";
    paintRailIcons(video);
  };

  muteBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = !video.muted;
      try {
        localStorage.setItem("videoMuted", String(next));
      } catch (err) {}
      update(next);
    });
  });

  // Programmatic mutes (e.g. autoplay fallback in player.js) repaint the
  // rail icon too — without touching the stored user choice.
  video.addEventListener("volumechange", () => {
    try { paintRailIcons(video); } catch (e) {}
  });

  if (dismiss && hint) {
    dismiss.addEventListener("click", (e) => {
      e.stopPropagation();
      hint.style.display = "none";
    });
  }

  let saved = null;
  try {
    saved = localStorage.getItem("videoMuted");
  } catch (e) {}
  if (saved === null) {
    try {
      localStorage.setItem("videoMuted", "true");
    } catch (e) {}
    update(true);
  } else {
    update(saved === "true");
  }
}
