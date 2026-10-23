/* Favmoney PWA bootstrap: registers the service worker and exposes a
 * one-shot install prompter consumed by the install banner UI
 * (pwa-banner.js). The native prompt is only ever fired from an explicit
 * user tap on that banner — never automatically. */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js")
        .catch((err) => console.warn("Favmoney Service Worker registration failed:", err));
    });
  }

  window.FavmoneyPWA = {
    canPrompt() {
      return !!window.__deferredInstallPrompt;
    },
    async promptInstall() {
      const d = window.__deferredInstallPrompt;
      if (!d) return "unavailable";
      window.__deferredInstallPrompt = null;
      try {
        d.prompt();
        const choice = await d.userChoice;
        return choice && choice.outcome === "accepted" ? "accepted" : "dismissed";
      } catch (e) {
        return "error";
      }
    },
  };
})();
