/* js/features/nav.js — swipe / wheel / keyboard feed navigation.
 * No-reload model: gestures scroll the .snap-feed container by one viewport
 * and swipe.js (IntersectionObserver) settles playback on the landed
 * section. Legacy data-next/prev page-flip is gone. */

function feedEl() {
  return document.querySelector(".snap-feed");
}

function step(dir) {
  const feed = feedEl();
  if (!feed) return;
  const h = feed.clientHeight || window.innerHeight;
  try {
    feed.scrollBy({ top: dir * h, behavior: "smooth" });
  } catch (e) {
    try { feed.scrollTop += dir * h; } catch (e2) {}
  }
}

export async function init() {
  const feed = feedEl();
  if (!feed) return;

  let touchY = 0;
  window.addEventListener("touchstart", (e) => {
    try { touchY = e.changedTouches[0].screenY; } catch (err) {}
  }, { passive: true });

  // Snap handles the finger motion; this only covers tiny drags that don't
  // cross the snap threshold on some browsers.
  window.addEventListener("touchend", (e) => {
    let y = 0;
    try { y = e.changedTouches[0].screenY; } catch (err) { return; }
    if (touchY - y > 90) step(1);
    else if (y - touchY > 90) step(-1);
  }, { passive: true });

  let scrolling = false;
  window.addEventListener("wheel", (e) => {
    if (scrolling) return;
    if (Math.abs(e.deltaY) < 30) return;
    scrolling = true;
    step(e.deltaY > 0 ? 1 : -1);
    setTimeout(() => { scrolling = false; }, 450);
  }, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    }
  });
}
