/* js/features/guide.js — first-visit swipe tutorial. Faithful port of the
 * Tutorial Initializer from refs/shortieshub_app_fix/index.html: same
 * #swipe-tutorial-overlay markup contract (index.html), same 3.5 s
 * auto-dismiss, same dismiss gestures, and the SAME localStorage key
 * (hasSeenSwipeTutorial) so returning visitors who saw the original are
 * never re-prompted. Storage access is guarded: sandboxed WebViews that
 * throw on localStorage simply show the overlay per visit.
 *
 * First-visit sequence: prefs popup -> tutorial -> straight into the
 * For You feed (the default). The tutorial waits for the prefs popup to
 * close instead of firing on a blind timer, so the two never overlap. */

const FLAG = "hasSeenSwipeTutorial";
const SHOW_DELAY_MS = 400;
const AUTO_DISMISS_MS = 3500;

function seen() {
  try {
    return localStorage.getItem(FLAG);
  } catch (e) {
    return null;
  }
}

function markSeen() {
  try {
    localStorage.setItem(FLAG, "true");
  } catch (e) {}
}

function prefsChosen() {
  // Girls always play; no preference system. Treat as already chosen so the
  // swipe tutorial shows immediately without waiting.
  return true;
}

export async function init() {
  const overlay = document.getElementById("swipe-tutorial-overlay");
  if (!overlay) return;
  if (seen()) return;

  let timer = 0;
  let shown = false;

  const dismiss = () => {
    if (!overlay.classList.contains("active")) return;
    overlay.classList.remove("active");
    clearTimeout(timer);
    markSeen();
    // Feed already defaults to For You — no forced menu; the user can
    // switch via the feed button whenever they want.
  };

  const show = () => {
    if (shown || seen()) return;
    shown = true;
    setTimeout(() => {
      overlay.classList.add("active");
    }, SHOW_DELAY_MS);
    timer = setTimeout(dismiss, SHOW_DELAY_MS + AUTO_DISMISS_MS);
  };

  const handleAction = () => {
    dismiss();
  };

  overlay.addEventListener("touchstart", handleAction, { passive: true });
  overlay.addEventListener("click", handleAction);
  window.addEventListener("wheel", handleAction, { passive: true });
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") handleAction();
  });

  // Prefs already chosen (or no prefs module): run once the feed has content.
  window.addEventListener("sx:videos-ready", () => {
    try {
      if (seen()) return;
      if (prefsChosen()) show();
      // Otherwise wait for the popup to close (sx:prefs-closed below).
    } catch (e) {}
  });
  // Popup closed (chosen or dismissed) -> tutorial goes next.
  window.addEventListener("sx:prefs-closed", () => {
    try {
      show();
    } catch (e) {}
  });
}
