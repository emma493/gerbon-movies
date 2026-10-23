/* Favmoney install banner — visible PWA install UI.
 * Shows a dismissible card above the bottom nav when the app is
 * installable but not yet installed. Android/desktop uses the captured
 * beforeinstallprompt; iOS (no prompt API) gets Share-menu instructions.
 * Snoozes 7 days on dismiss, hides forever once installed. */
(function () {
  var DISMISS_KEY = "shortxx_pwa_dismissed";
  var INSTALLED_KEY = "shortxx_pwa_installed";
  var SNOOZE_MS = 7 * 24 * 3600 * 1000;

  function standalone() {
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e) {}
    return window.navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  }

  function storeGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function storeSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  if (standalone() || storeGet(INSTALLED_KEY) === "1") return;
  var dismissedAt = parseInt(storeGet(DISMISS_KEY) || "0", 10);
  if (Date.now() - dismissedAt < SNOOZE_MS) return;

  function canShow() {
    return !!(window.__deferredInstallPrompt || (window.FavmoneyPWA && window.FavmoneyPWA.canPrompt()) || isIOS());
  }

  // The prompt event can arrive late — poll briefly before giving up.
  var waited = 0;
  var timer = setInterval(function () {
    if (canShow() || waited >= 8000) {
      clearInterval(timer);
      if (canShow()) setTimeout(show, 2500);
    }
    waited += 500;
  }, 500);

  window.addEventListener("appinstalled", function () {
    storeSet(INSTALLED_KEY, "1");
    var b = document.getElementById("pwa-banner");
    if (b) b.remove();
  });

  function dismiss() {
    storeSet(DISMISS_KEY, String(Date.now()));
    var b = document.getElementById("pwa-banner");
    if (b) b.remove();
  }

  function show() {
    if (document.getElementById("pwa-banner")) return;
    var ios = isIOS() && !(window.__deferredInstallPrompt || (window.FavmoneyPWA && window.FavmoneyPWA.canPrompt()));
    var el = document.createElement("div");
    el.id = "pwa-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Install Favmoney");
    el.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(3.5rem + env(safe-area-inset-bottom,0px));z-index:85;max-width:456px;margin:0 auto;background:#1e1e1e;border:1px solid #2f2f2f;border-radius:16px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 32px rgba(0,0,0,0.6);";
    el.innerHTML =
      '<img src="icons/icon-192.png" alt="" style="width:44px;height:44px;border-radius:12px;flex:none;">' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="color:#fff;font-size:14px;font-weight:800;">Install Favmoney</div>' +
      '<div data-sub style="color:#a0a0a0;font-size:12px;">' +
      (ios ? "iPhone: tap Share, then Add to Home Screen" : "Add to home screen for fullscreen clips") +
      "</div></div>" +
      '<button data-act style="background:#fe2c55;color:#fff;font-size:13px;font-weight:800;border:none;border-radius:999px;padding:9px 16px;flex:none;">' +
      (ios ? "OK" : "Install") +
      "</button>" +
      '<button data-close aria-label="Dismiss" style="background:none;border:none;color:#8a8a8a;font-size:18px;padding:4px;">✕</button>';
    document.body.appendChild(el);

    el.querySelector("[data-close]").addEventListener("click", function (e) {
      e.stopPropagation();
      dismiss();
    });

    el.querySelector("[data-act]").addEventListener("click", async function (e) {
      e.stopPropagation();
      if (ios) {
        dismiss();
        return;
      }
      var helper = window.FavmoneyPWA;
      var outcome = helper ? await helper.promptInstall() : "unavailable";
      if (outcome === "accepted") {
        storeSet(INSTALLED_KEY, "1");
        el.remove();
      } else if (outcome === "unavailable") {
        var sub = el.querySelector("[data-sub]");
        if (sub) sub.textContent = "Use your browser menu: Add to Home Screen";
      } else {
        dismiss();
      }
    });
  }
})();
