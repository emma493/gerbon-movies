/**
 * app-mode.js
 * ---------------------------------------------------------------
 * Detects when the site is running inside an Android WebView app
 * wrapper (e.g. the ShortsiesHub APK) rather than a normal mobile
 * browser, and applies extra logic ONLY in that case to stop the
 * "have to click every video to play" problem.
 *
 * WHY THIS IS NEEDED:
 * Regular mobile browsers (Chrome/Safari) allow a muted <video> to
 * autoplay with zero user gesture. Android WebView, by default,
 * still requires a real user gesture before it will honor a JS
 * video.play() call — even for muted video — unless the host app
 * explicitly sets WebSettings.setMediaPlaybackRequiresUserGesture(false)
 * on the native side. Since that native setting isn't something this
 * website can control, this script works around it in JS:
 * it "unlocks" playback the instant the user makes ANY input
 * (tap, touch, click) anywhere on the page — not just on the video —
 * so playback starts almost immediately instead of requiring a
 * deliberate tap on the video every time.
 *
 * Normal browser behavior (PC and mobile web) is left 100% untouched.
 * ---------------------------------------------------------------
 */
(function () {
    function detectAppWebView() {
        const ua = navigator.userAgent || '';

        // Standard Android System WebView signature: "; wv)" in the UA string.
        const hasWebViewToken = /;\s*wv\)/i.test(ua);

        // Some WebView-to-APK wrapper tools strip "Version/" (present in the
        // real Chrome browser UA) while keeping "Chrome/", or omit "Safari"
        // oddities. This is a secondary heuristic, used only in combination
        // with being on Android at all.
        const isAndroid = /Android/i.test(ua);
        const looksLikeStrippedChrome = isAndroid && /Chrome\//i.test(ua) && !/Version\//i.test(ua) && !hasWebViewToken;

        // Optional manual override: the app wrapper can append a custom
        // token to its User-Agent string (many WebView-to-APK tools support
        // this in settings) or load the page with ?app=1. Either works.
        const manualOverride = /ShortsiesHubApp/i.test(ua) || /[?&]app=1\b/.test(location.search);

        return hasWebViewToken || looksLikeStrippedChrome || manualOverride;
    }

    window.__isAppWebView = detectAppWebView();

    if (!window.__isAppWebView) return; // Leave normal browsers untouched.

    function tryPlay() {
        const video = document.querySelector('video');
        if (video && video.paused) {
            video.play().catch(() => {});
        }
    }

    // Attempt immediately and again once the DOM/video element exists.
    tryPlay();
    document.addEventListener('DOMContentLoaded', tryPlay);

    // The key fix: unlock on the very first user input of ANY kind,
    // anywhere on the page (capture phase = fires before other handlers,
    // before the swipe/like/mute logic even runs). Only needs to happen
    // once per page load — after one successful gesture-backed play(),
    // WebView allows further play() calls on that page without a gesture.
    const unlock = () => {
        tryPlay();
    };
    ['touchstart', 'pointerdown', 'click'].forEach((evt) => {
        document.addEventListener(evt, unlock, { capture: true, passive: true, once: true });
    });
})();
