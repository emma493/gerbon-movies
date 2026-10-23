/* js/lib/side-menu.js — SINGLE SOURCE OF TRUTH for the slide-out drawer.
 * Guest-only: Home, Discover, Trending, Preferences, Install App (when not
 * installed), Live Cams. No auth, no profiles, no follows, no saved/liked. */

export function isAppInstalled() {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch (e) {}
  if (window.navigator && window.navigator.standalone === true) return true;
  try {
    return localStorage.getItem("shortxx_pwa_installed") === "1";
  } catch (e) {
    return false;
  }
}

export function getMenuHTML() {
  const installRow = isAppInstalled()
    ? ""
    : '<button class="sidebar-link" data-act="install"><i class="fas fa-download"></i><span>Install App</span></button>';
  return (
    '<div class="sx-sidebar-backdrop" data-close></div>' +
    '<aside class="sx-sidebar" aria-label="Site navigation">' +
    '<div class="sx-sidebar-header"><div class="sx-sidebar-title">Favmoney</div>' +
    '<div class="sx-sidebar-actions">' +
    '<button class="sx-close-btn" data-close aria-label="Close menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div></div>' +
    '<nav>' +
    '<button class="sidebar-link" data-go="home"><i class="fas fa-home"></i><span>Home</span></button>' +
    '<button class="sidebar-link" data-go="discover"><i class="fas fa-compass"></i><span>Discover</span></button>' +
    '<button class="sidebar-link" data-go="trending"><i class="fas fa-fire"></i><span>Trending</span></button>' +
    '<button class="sidebar-link" data-act="preferences"><i class="fas fa-sliders-h"></i><span>Preferences</span></button>' +
    installRow +
    "</nav>" +
    '<div class="sx-div"></div><nav>' +
    '<a class="sidebar-link" href="https://araplhn.org/4/f4da12d7aaa67cd61f6a1196381da654" target="_blank" rel="noopener"><i class="fas fa-video"></i><span>Live Cams</span></a>' +
    "</nav></aside>"
  );
}

/* Wire one drawer root. deps: { close(), toast() }. */
export function wireMenu(root, deps) {
  const toast = (deps && deps.toast) || (() => {});
  const close = (deps && deps.close) || (() => {
    root.style.display = "none";
  });
  root.querySelectorAll("[data-dead]").forEach((el) =>
    el.addEventListener("click", (e) => e.preventDefault()),
  );
  root.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", close),
  );
  root.querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => {
      const go = el.getAttribute("data-go");
      close();
      setTimeout(() => {
        if (go === "home") {
          if (window.sxCloseDiscover) { try { window.sxCloseDiscover(); } catch (e) {} }
          if (window.sxCloseTrending) { try { window.sxCloseTrending(); } catch (e) {} }
          if (location.pathname.endsWith("index.html") || location.pathname === "/") {
            // already home — nothing else to do
          } else {
            location.href = "./index.html";
          }
        }
        else if (go === "discover") window.sxOpenDiscover && window.sxOpenDiscover("all");
        else if (go === "trending") window.sxOpenTrending && window.sxOpenTrending("all");
      }, 60);
    }),
  );
  const installEl = root.querySelector('[data-act="install"]');
  if (installEl) {
    installEl.addEventListener("click", async () => {
      close();
      const helper = window.FavmoneyPWA;
      try {
        if (helper && helper.canPrompt()) {
          const outcome = await helper.promptInstall();
          if (outcome === "accepted") {
            try { localStorage.setItem("shortxx_pwa_installed", "1"); } catch (e) {}
            toast("Favmoney installed");
          }
        } else if (/iphone|ipad|ipod/i.test(navigator.userAgent || "")) {
          toast("iPhone: tap Share, then Add to Home Screen");
        } else {
          toast("Use your browser menu: Add to Home Screen");
        }
      } catch (e) {}
    });
  }
  // Preferences row: opens the content-preference popup on the feed; from
  // folder pages (no prefs module loaded) hop to the feed which opens it.
  const prefsEl = root.querySelector('[data-act="preferences"]');
  if (prefsEl) {
    prefsEl.addEventListener("click", () => {
      close();
      setTimeout(() => {
        try {
          if (window.sxOpenPrefs) window.sxOpenPrefs(true);
          else location.href = "/index.html?prefs=1";
        } catch (e) {}
      }, 60);
    });
  }
}

/* Build + attach a hidden drawer clone inside a given parent (overlay root
 * or document.body). Returns { root, open, close, isOpen }. */
export function attachMenuClone(parent, deps) {
  const wrap = document.createElement("div");
  wrap.className = "sx-menu-root sx-menu-clone";
  wrap.style.display = "none";
  wrap.innerHTML = getMenuHTML();
  parent.appendChild(wrap);
  const drawer = wrap.querySelector(".sx-sidebar");
  const backdrop = wrap.querySelector(".sx-sidebar-backdrop");

  function open() {
    wrap.style.display = "block";
    wrap.removeAttribute("hidden");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (backdrop) backdrop.classList.add("active");
        if (drawer) drawer.classList.add("active");
      });
    });
  }
  function close() {
    if (backdrop) backdrop.classList.remove("active");
    if (drawer) drawer.classList.remove("active");
    setTimeout(() => { wrap.style.display = "none"; }, 300);
  }
  function isOpen() {
    return wrap.style.display !== "none";
  }
  wireMenu(wrap, { close, toast: (deps && deps.toast) || (() => {}) });
  return { root: wrap, open, close, isOpen };
}
