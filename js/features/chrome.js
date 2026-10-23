/* js/features/chrome.js — fullscreen + visual-only dead controls. */

export async function init() {
  const fsBtn = document.getElementById("fs-btn");
  if (fsBtn) {
    fsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      fsBtn.setAttribute("aria-pressed", String(!document.fullscreenElement));
    });
  }

  document.querySelectorAll("[data-dead]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
}
