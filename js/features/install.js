import { isAppInstalled } from "../lib/side-menu.js";

/* js/features/install.js — rail Install button (below Sound in the viewer rail).
 * Same pipeline as the drawer Install row (side-menu.js): always shown when
 * not installed; tap fires the native prompt when available, otherwise shows
 * per-platform add-to-homescreen instructions. Hidden only once installed. */

export async function init(ctx) {
  const toast = (ctx && ctx.toast) || (() => {});
  const btn = document.getElementById("sx-rail-install");
  if (!btn) return;

  const hide = () => {
    btn.style.display = "none";
    btn.setAttribute("aria-hidden", "true");
  };

  if (isAppInstalled()) {
    hide();
    return;
  }
  btn.style.display = "";

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const helper = window.FavmoneyPWA;
    try {
      if (helper && helper.canPrompt()) {
        const outcome = await helper.promptInstall();
        if (outcome === "accepted") {
          try { localStorage.setItem("shortxx_pwa_installed", "1"); } catch (err) {}
          toast("Favmoney installed");
          hide();
        }
      } else if (/iphone|ipad|ipod/i.test(navigator.userAgent || "")) {
        toast("iPhone: tap Share, then Add to Home Screen");
      } else {
        toast("Use your browser menu: Add to Home Screen");
      }
    } catch (err) {}
  });

  window.addEventListener("appinstalled", () => {
    try { localStorage.setItem("shortxx_pwa_installed", "1"); } catch (err) {}
    hide();
  });
}
