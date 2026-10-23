/* js/features/menu.js — slide-out sidebar drawer only. CSS lives in
 * css/features/menu.css. HTML/items come from js/lib/side-menu.js so
 * Discover / Trending / Profile clones render IDENTICAL items. */

import { getMenuHTML, wireMenu } from "../lib/side-menu.js";

let sheet = null;
let drawer = null;

function isInstalled() {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch (e) {}
  if (window.navigator.standalone === true) return true;
  try {
    return localStorage.getItem("shortxx_pwa_installed") === "1";
  } catch (e) {
    return false;
  }
}

export async function init(ctx) {
  const menuBtn = document.getElementById("menu-btn");
  const moreBtn = document.getElementById("more-btn");
  const toast = ctx.toast || (() => {});
  if (!menuBtn && !moreBtn) return;

  function build() {
    if (sheet) return sheet;
    const wrap = document.createElement("div");
    wrap.className = "sx-menu-root";
    wrap.style.display = "none";
    // IDENTICAL items everywhere — single source of truth.
    wrap.innerHTML = getMenuHTML();
    document.body.appendChild(wrap);
    sheet = wrap;
    drawer = wrap.querySelector(".sx-sidebar");
    wireMenu(wrap, { close: closeMenu, toast });
    return wrap;
  }

  function isOpen() {
    return !!sheet && sheet.style.display !== "none";
  }

  function openMenu() {
    const wrap = build();
    wrap.style.display = "block";
    wrap.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wrap.querySelector(".sx-sidebar-backdrop").classList.add("active");
        drawer.classList.add("active");
      });
    });
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
    if (moreBtn) moreBtn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    if (!isOpen()) return;
    sheet.querySelector(".sx-sidebar-backdrop").classList.remove("active");
    if (drawer) drawer.classList.remove("active");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    if (moreBtn) moreBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    setTimeout(() => {
      if (sheet) sheet.style.display = "none";
    }, 300);
  }
  window.sxCloseMenu = closeMenu;
  window.sxOpenMenu = openMenu;
  window.sxToggleMenu = () => {
    if (isOpen()) closeMenu();
    else openMenu();
  };

  if (menuBtn) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isOpen()) closeMenu();
      else openMenu();
    });
  }
  if (moreBtn) {
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isOpen()) closeMenu();
      else openMenu();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
}
