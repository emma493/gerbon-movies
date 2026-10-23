(function () {
    /**
     * Attempts to programmatically play the video and simulate a screen touch/click
     * to bypass browser autoplay restrictions.
     * @param {HTMLVideoElement} video 
     */
    function resumePlayback(video) {
        if (!video) return;

        // 1. Programmatic play call
        video.play().catch(function (error) {
            console.warn("Autoplay/Resume blocked by browser policy:", error);
        });

        // 2. Dispatch simulated click/tap events on the video element
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        video.dispatchEvent(clickEvent);

        // 3. Dispatch simulated touch event for mobile devices
        if ('TouchEvent' in window) {
            const touchObj = new Touch({
                identifier: Date.now(),
                target: video,
                clientX: video.clientWidth / 2,
                clientY: video.clientHeight / 2
            });

            const touchEvent = new TouchEvent('touchstart', {
                touches: [touchObj],
                targetTouches: [touchObj],
                changedTouches: [touchObj],
                bubbles: true,
                cancelable: true
            });
            video.dispatchEvent(touchEvent);
        }
    }

    /**
     * Initializes playback monitoring on the target video element.
     */
    function initAutoResume() {
        const video = document.getElementById('stream-video');
        if (!video) return;

        // Monitor pause events and trigger auto-resume
        video.addEventListener('pause', function () {
            // Prevent auto-resume if the video has reach the end normally
            if (!video.ended) {
                resumePlayback(video);
            }
        });

        // Periodically verify playback status as a fallback
        setInterval(function () {
            if (video.paused && !video.ended) {
                resumePlayback(video);
            }
        }, 500);
    }

    // Ensure the DOM is fully loaded before binding listeners
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutoResume);
    } else {
        initAutoResume();
    }
})();