/* js/features/prefs.js — content-preference popup REMOVED.
 * Girls videos always play; no preferences, no popup, no storage.
 * Stubs kept so legacy imports (main.js, side menu) never break. */

import { getContentPreference } from "../../vid.js";

let root = null;
let toast = () => {};

export async function init(ctx) {
  toast = (ctx && ctx.toast) || (() => {});
  // Intentionally never opens: girls always play, no preference popup.
  window.sxOpenPrefs = () => {};
}
