import { getContentPreference, setContentPreference } from "../../vid.js";

/* js/features/feed.js — guest category switcher: For You (girls creators
 * only). Top-center button; persisting + repaints live (no reload). */

const NAMES = { girls: "For You" };
const ORDER = ["girls"];

function paintMenuChecks(menu) {
  if (!menu) return;
  const cur = getContentPreference();
  menu.querySelectorAll(".sx-feed-item").forEach((b, i) => {
    const mode = ORDER[i];
    if (!mode) return;
    const on = mode === cur;
    b.setAttribute("aria-checked", String(on));
    const spans = b.querySelectorAll("span");
    const check = spans[spans.length - 1];
    if (check) check.textContent = on ? "✓" : "";
  });
}

export async function init(ctx) {
  const feedBtn = document.getElementById("feed-btn");
  const feedLabel = document.getElementById("feed-label");
  const toast = ctx.toast || (() => {});
  if (!feedBtn) return;

  const paint = () => {
    const cur = getContentPreference();
    if (feedLabel) feedLabel.textContent = NAMES[cur] || "For You";
    feedBtn.setAttribute("aria-label", "Change category, currently " + (NAMES[cur] || "For You"));
    feedBtn.setAttribute("aria-disabled", "true");
    feedBtn.setAttribute("tabindex", "-1");
  };
  paint();
  window.addEventListener("sx:prefs-chosen", paint);

  const switchFeed = async (mode) => {
    const cur = getContentPreference();
    if (mode === cur) return;
    setContentPreference(mode);
    paint();
    paintMenuChecks(menu);
    try {
      toast("Showing " + (NAMES[mode] || "For You") + " videos");
    } catch (e) {}
    closeMenu();
    // Live switch: setContentPreference() rebuilt the pool + fired
    // sx:videos-ready (swipe.js rebuilds spacers + restarts at head,
    // grids repaint). No reload so the toast stays visible.
  };
  window.sxSwitchFeed = switchFeed;

  let menu = null;
  let closer = null;

  const closeMenu = () => {
    if (!menu) return;
    menu.classList.remove("open");
    feedBtn.setAttribute("aria-expanded", "false");
    if (closer) {
      document.removeEventListener("click", closer);
      closer = null;
    }
    setTimeout(() => {
      if (menu && !menu.classList.contains("open")) {
        menu.remove();
        menu = null;
      }
    }, 300);
  };

  const openMenu = () => {
    if (menu) {
      paintMenuChecks(menu);
      menu.classList.add("open");
      feedBtn.setAttribute("aria-expanded", "true");
      return;
    }
    menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.className = "sx-feed-menu";
    ORDER.forEach((mode) => {
      const b = document.createElement("button");
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(getContentPreference() === mode));
      b.className = "sx-feed-item";
      b.innerHTML = "<span>" + NAMES[mode] + "</span><span>" + (getContentPreference() === mode ? "✓" : "") + "</span>";
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        switchFeed(mode);
      });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (menu) menu.classList.add("open");
      });
    });
    feedBtn.setAttribute("aria-expanded", "true");
    setTimeout(() => {
      closer = function (ev) {
        if (menu && !menu.contains(ev.target)) closeMenu();
      };
      document.addEventListener("click", closer);
    }, 0);
  };

  window.sxOpenFeedMenu = openMenu;
  window.sxCloseFeedMenu = closeMenu;

  feedBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Disabled: category switcher is inactive (single option: For You)
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
}
