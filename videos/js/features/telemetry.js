import { getDeviceName, publishIdentity } from "../store.js";
import {
  incrementUserCounters,
  markUserOffline,
  resolveCountry,
  upsertUserTelemetry,
} from "../../vid.js";

/* js/features/telemetry.js — guest presence + country + watch counters.
 * This is the LIVE path (main.js): the homepage no longer loads the legacy
 * script.js, so without this module nothing sets window.shortxxCountry
 * (every video_view logged "GH") and no users docs were written at all.
 *
 * tracking.js reads window.shortxxCountry per view; user docs get presence
 * heartbeat + watch time here. No raw IPs stored — country code only. */

let uid = null;
let beats = null;
let started = false;

function resolveGate() {
  try {
    if (window._shortxxCountryResolve) {
      window._shortxxCountryResolve();
      window._shortxxCountryResolve = null;
    }
  } catch (e) {}
}

export function getTelemetryUid() {
  return uid;
}

async function ensureCountry() {
  try {
    // Cached when main.js early-booted it; otherwise resolves now
    // (edge → ip-api → locale/timezone → GH fail-soft).
    const geo = await resolveCountry();
    window.shortxxCountry = geo.code;
    window.shortxxCountrySource = geo.source;
  } catch (e) {}
  resolveGate();
}

export async function refreshTelemetry() {
  try {
    publishIdentity();
  } catch (e) {}
  if (!uid) {
    try {
      uid = "guest_" + getDeviceName();
    } catch (e) {
      uid = null;
    }
  }
  await ensureCountry();
  if (uid) {
    try {
      await upsertUserTelemetry(uid, { authProvider: "guest" });
    } catch (e) {}
  }
}

function bump(counters) {
  if (!uid || !counters) return;
  try {
    incrementUserCounters(uid, counters);
  } catch (e) {}
}

export function countSave() {
  bump({ saveDelta: 1 });
}

export function countDownload() {
  bump({ downloadDelta: 1 });
}

export function noteWatch(seconds) {
  if (typeof seconds === "number" && seconds > 0) bump({ watchSeconds: Math.round(seconds) });
}

export function noteComplete() {
  bump({ completed: 1 });
}

export async function init() {
  // init() can re-run on main.js feature-retry — wire once only so we never
  // stack duplicate 25 s heartbeats.
  if (started) {
    await refreshTelemetry();
    return;
  }
  started = true;
  await refreshTelemetry();
  if (beats) clearInterval(beats);
  // Presence heartbeat: Admin treats lastActive <60s as ONLINE.
  beats = setInterval(() => {
    if (uid) {
      try {
        upsertUserTelemetry(uid, { authProvider: "guest" });
      } catch (e) {}
    }
  }, 25000);
  window.addEventListener("pagehide", () => {
    if (uid) {
      try {
        markUserOffline(uid);
      } catch (e) {}
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!uid) return;
    if (document.visibilityState === "hidden") {
      try {
        markUserOffline(uid);
      } catch (e) {}
    } else {
      refreshTelemetry();
    }
  });
}
